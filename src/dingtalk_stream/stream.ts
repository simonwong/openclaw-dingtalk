import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { AckMessage, EventMessage, SystemMessage } from "./frames.js";
import type { EventHandler, SystemHandler } from "./handlers.js";
import type { AckParams, CallbackListenerResult, OpenConnectionResponse, RawFrame, StreamSubscription } from "./types.js";

export const TOPIC_ROBOT = "/v1.0/im/bot/messages/get" as const;

const DINGTALK_OPENAPI_ENDPOINT = "https://api.dingtalk.com";
const OPEN_CONNECTION_API = `${DINGTALK_OPENAPI_ENDPOINT}/v1.0/gateway/connections/open`;
const ACCESS_TOKEN_API = `${DINGTALK_OPENAPI_ENDPOINT}/v1.0/oauth2/accessToken`;

type CallbackHandler = (res: CallbackListenerResult) => void | Promise<void>;

type StreamClientOpts = {
  clientId: string;
  clientSecret: string;
  debug?: boolean;
  logger?: {
    info?: (m: string) => void;
    warn?: (m: string) => void;
    error?: (m: string) => void;
  };
};

export class DingTalkStreamClient {
  private opts: StreamClientOpts;
  private callbackHandlerMap = new Map<string, CallbackHandler>();
  private eventHandlers: EventHandler[] = [];
  private systemHandlers: SystemHandler[] = [];
  private ws: WebSocket | null = null;
  private stopping = false;
  private preStarted = false;
  private isEventRequired = false;
  private accessToken: { accessToken: string; expireTime: number } | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;

  constructor(opts: StreamClientOpts) {
    this.opts = opts;
  }

  registerAllEventHandler(): void {
    this.isEventRequired = true;
  }

  registerCallbackListener(topic: string, handler: CallbackHandler): void {
    this.callbackHandlerMap.set(topic, handler);
  }

  registerEventHandler(handler: EventHandler): void {
    this.eventHandlers.push(handler);
    this.isEventRequired = true;
  }

  registerSystemHandler(handler: SystemHandler): void {
    this.systemHandlers.push(handler);
  }

  preStart(): void {
    if (this.preStarted) return;
    this.preStarted = true;

    // Call preStart on all handlers
    for (const handler of this.eventHandlers) {
      handler.preStart();
    }
    for (const handler of this.systemHandlers) {
      handler.preStart();
    }
  }

  async connect(): Promise<void> {
    this.preStart();
    this.stopping = false;

    // Reconnect loop (python style)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.stopping) return;
      try {
        const connection = await this.openConnection();
        const uri = `${connection.endpoint}?ticket=${encodeURIComponent(connection.ticket)}`;
        this.logInfo(`endpoint is ${connection.endpoint}`);

        await this.connectWebSocket(uri);
      } catch (err) {
        this.logError(`[start] network exception, error=${err instanceof Error ? err.message : String(err)}`);
        await sleep(10_000);
        continue;
      } finally {
        this.stopKeepalive();
        try {
          this.ws?.terminate();
        } catch {
          // ignore
        }
        this.ws = null;
      }

      await sleep(3_000);
    }
  }

  disconnect(): void {
    this.stopping = true;
    this.stopKeepalive();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }

  close(): void {
    this.disconnect();
  }

  socketCallBackResponse(messageId: string, params: AckParams): void {
    if (!messageId) return;
    const ack = new AckMessage();
    ack.code = params.success ? AckMessage.STATUS_OK : AckMessage.STATUS_SYSTEM_EXCEPTION;
    ack.headers.messageId = messageId;
    ack.headers.contentType = "application/json";
    ack.message = params.message ?? (params.success ? "OK" : (params.error ?? "ERROR"));
    ack.data = { response: ack.message };
    this.sendJson(ack.toDict());
  }

  resetAccessToken(): void {
    this.accessToken = null;
  }

  async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && now < this.accessToken.expireTime) {
      return this.accessToken.accessToken;
    }

    const resp = await fetch(ACCESS_TOKEN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ appKey: this.opts.clientId, appSecret: this.opts.clientSecret }),
    });

    const txt = await resp.text().catch(() => "");
    if (!resp.ok) {
      throw new Error(`get dingtalk access token failed, status=${resp.status}, body=${txt}`);
    }

    const json = safeJsonParse(txt);
    const token = String(json?.accessToken ?? "");
    const expireIn = Number(json?.expireIn ?? 0);
    if (!token || !expireIn) {
      throw new Error("get dingtalk access token failed, missing accessToken/expireIn");
    }

    // reserve 5min buffer
    this.accessToken = {
      accessToken: token,
      expireTime: Math.floor(Date.now() / 1000) + expireIn - 5 * 60,
    };

    return token;
  }

  /**
   * Upload file to DingTalk via oapi media endpoint
   * @param filePath Local file path
   * @param mediaType Media type: image, file, or voice
   * @param accessToken Optional access token (will fetch if not provided)
   * @returns media_id if successful, null otherwise
   */
  async uploadToDingTalk(
    filePath: string,
    mediaType: "image" | "file" | "voice" = "file",
    accessToken?: string,
  ): Promise<string | null> {
    try {
      const oapiToken = accessToken ?? await this.getOapiAccessToken();
      if (!oapiToken) {
        this.logError("[uploadToDingTalk] Failed to get oapi token");
        return null;
      }

      if (!fs.existsSync(filePath)) {
        this.logWarn(`[uploadToDingTalk] File not found: ${filePath}`);
        return null;
      }

      const fileName = path.basename(filePath);
      const formData = new FormData();
      const fileBuffer = await fs.promises.readFile(filePath);
      const blob = new Blob([fileBuffer]);
      formData.append("media", blob, fileName);

      this.logInfo(`[uploadToDingTalk] Uploading ${mediaType}: ${filePath}`);

      const response = await fetch(
        `https://oapi.dingtalk.com/media/upload?access_token=${oapiToken}&type=${mediaType}`,
        { method: "POST", body: formData },
      );

      if (!response.ok) {
        const text = await response.text();
        this.logError(`[uploadToDingTalk] Upload failed: ${response.status} ${text}`);
        return null;
      }

      const data = (await response.json()) as { media_id?: string; errcode?: number };
      const mediaId = data.media_id;

      if (mediaId) {
        this.logInfo(`[uploadToDingTalk] Upload success: media_id=${mediaId}`);
        return mediaId;
      }

      this.logWarn(`[uploadToDingTalk] No media_id returned: errcode=${data.errcode}`);
      return null;
    } catch (err) {
      this.logError(`[uploadToDingTalk] Error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Get oapi access token for media operations
   */
  private async getOapiAccessToken(): Promise<string | null> {
    try {
      const response = await fetch(
        `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(this.opts.clientId)}&appsecret=${encodeURIComponent(this.opts.clientSecret)}`,
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { errcode?: number; access_token?: string };
      if (data.errcode === 0 && data.access_token) {
        return data.access_token;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async openConnection(): Promise<OpenConnectionResponse> {
    this.logInfo(`open connection, url=${OPEN_CONNECTION_API}`);

    const topics: StreamSubscription[] = [];
    if (this.isEventRequired) {
      topics.push({ type: "EVENT", topic: "*" });
    }
    for (const topic of this.callbackHandlerMap.keys()) {
      topics.push({ type: "CALLBACK", topic });
    }

    const body = {
      clientId: this.opts.clientId,
      clientSecret: this.opts.clientSecret,
      subscriptions: topics,
      ua: "dingtalk-sdk-ts/0.1-union",
      localIp: getHostIp(),
    };

    const resp = await fetch(OPEN_CONNECTION_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "DingTalkStream/1.0 SDK/TS (+https://github.com/open-dingtalk/dingtalk-stream-sdk-python)",
      },
      body: JSON.stringify(body),
    });

    const txt = await resp.text().catch(() => "");
    if (!resp.ok) {
      throw new Error(`open connection failed, status=${resp.status}, body=${txt}`);
    }

    const json = safeJsonParse(txt);
    if (!json?.endpoint || !json?.ticket) {
      throw new Error(`open connection failed, bad response: ${txt}`);
    }

    return {
      endpoint: String(json.endpoint),
      ticket: String(json.ticket),
      connectionId: json.connectionId ? String(json.connectionId) : undefined,
    };
  }

  private async connectWebSocket(uri: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(uri);
      this.ws = ws;

      ws.on("open", () => {
        this.startKeepalive(ws);
        resolve();
      });

      ws.on("error", (err) => {
        reject(err);
      });

      ws.on("message", (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        void this.backgroundTask(raw);
      });

      ws.on("close", () => {
        // reconnect loop will handle
      });
    });

    // Wait until close
    await new Promise<void>((resolve) => {
      const ws = this.ws;
      if (!ws) return resolve();
      ws.once("close", () => resolve());
    });
  }

  private startKeepalive(ws: WebSocket, pingInterval = 60_000): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      try {
        ws.ping();
      } catch {
        // ignore
      }
    }, pingInterval);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private async backgroundTask(raw: string): Promise<void> {
    try {
      const frame = safeJsonParse(raw) as RawFrame;
      await this.routeMessage(frame);
    } catch (err) {
      this.logError(`error processing message: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async routeMessage(frame: RawFrame): Promise<void> {
    const msgType = String(frame?.type ?? "");
    const headers = (frame?.headers ?? {}) as Record<string, any>;
    const topic = String(headers?.topic ?? "");
    const messageId = String(headers?.messageId ?? "");

    const dataStr = typeof frame?.data === "string" ? frame.data : JSON.stringify(frame?.data ?? {});

    if (this.opts.debug) {
      this.logInfo(`[dingtalk_stream] inbound type=${msgType} topic=${topic} messageId=${messageId}`);
    }

    if (msgType === "SYSTEM") {
      // Handle with custom system handlers first
      if (this.systemHandlers.length > 0) {
        const systemMessage = SystemMessage.fromDict(frame);
        for (const handler of this.systemHandlers) {
          try {
            await handler.process(systemMessage);
          } catch (err) {
            this.logError(`system handler error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // python: disconnect -> close
      if (topic === SystemMessage.TOPIC_DISCONNECT) {
        this.logInfo(`received disconnect topic=${topic}`);
        try {
          await this.ws?.close();
        } catch {
          // ignore
        }
      }
      if (messageId) {
        this.socketCallBackResponse(messageId, { success: true });
      }
      return;
    }

    if (msgType === "CALLBACK") {
      const handler = this.callbackHandlerMap.get(topic);
      if (handler) {
        await handler({ headers: { ...headers }, data: dataStr });
      } else {
        this.logWarn(`unknown callback message topic=${topic}`);
      }
      // NOTE: handler is expected to ack via socketCallBackResponse
      return;
    }

    if (msgType === "EVENT") {
      // Handle with custom event handlers
      if (this.eventHandlers.length > 0) {
        const eventMessage = EventMessage.fromDict(frame);
        for (const handler of this.eventHandlers) {
          try {
            await handler.process(eventMessage);
          } catch (err) {
            this.logError(`event handler error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // Auto-ack event messages
      if (messageId) {
        this.socketCallBackResponse(messageId, { success: true });
      }
      return;
    }

    // Unknown type: ack OK to avoid redelivery
    if (messageId) {
      this.socketCallBackResponse(messageId, { success: true });
    }
  }

  private sendJson(obj: any): void {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  private logInfo(m: string) {
    this.opts.logger?.info?.(m);
  }
  private logWarn(m: string) {
    this.opts.logger?.warn?.(m);
  }
  private logError(m: string) {
    this.opts.logger?.error?.(m);
  }
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getHostIp(): string {
  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      for (const e of entries ?? []) {
        if (e && e.family === "IPv4" && !e.internal) {
          return e.address;
        }
      }
    }
  } catch {
    // ignore
  }
  return "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
