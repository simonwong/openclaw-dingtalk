import os from "node:os";
import { AckMessage, Headers } from "./frames.js";
import type { StreamInboundEnvelope, StreamOpenConnectionResponse, StreamSubscription } from "./types.js";

const OPEN_CONNECTION_API = "https://api.dingtalk.com/v1.0/gateway/connections/open";

export const TOPIC_ROBOT = "/v1.0/im/bot/messages/get" as const;

export type StreamClientOptions = {
  clientId: string;
  clientSecret: string;
  debug?: boolean;
  userAgent?: string;
};

type Callback = (res: StreamInboundEnvelope) => void | Promise<void>;

export class StreamClient {
  private opts: StreamClientOptions;
  private ws: WebSocket | null = null;
  private stopping = false;
  private callbacks = new Map<string, Callback>();
  private reconnectDelayMs = 3000;

  constructor(opts: StreamClientOptions) {
    this.opts = opts;
  }

  registerCallbackListener(topic: string, cb: Callback) {
    this.callbacks.set(topic, cb);
  }

  async connect(): Promise<void> {
    this.stopping = false;
    // run in background; return when first connection is opened.
    await this.connectOnce();
    void this.reconnectLoop();
  }

  close() {
    this.stopping = true;
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }

  socketCallBackResponse(messageId: string, params: { success: boolean; message?: string }) {
    const ack = new AckMessage();
    ack.code = params.success ? AckMessage.STATUS_OK : AckMessage.STATUS_SYSTEM_EXCEPTION;
    ack.headers.messageId = messageId;
    ack.headers.contentType = Headers.CONTENT_TYPE_APPLICATION_JSON;
    ack.message = params.message ?? (params.success ? "OK" : "ERROR");
    ack.data = { response: ack.message };
    this.sendJson(ack.toDict());
  }

  private async reconnectLoop() {
    while (!this.stopping) {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        try {
          await this.connectOnce();
          this.reconnectDelayMs = 3000;
        } catch {
          // swallow and backoff
          await new Promise((r) => setTimeout(r, this.reconnectDelayMs));
          this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30_000);
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  private async connectOnce(): Promise<void> {
    const connection = await this.openConnection();
    const uri = `${connection.endpoint}?ticket=${encodeURIComponent(connection.ticket)}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(uri);
      this.ws = ws;

      const onOpen = () => {
        ws.removeEventListener("error", onError as any);
        resolve();
      };
      const onError = (ev: any) => {
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(ev);
      };

      ws.addEventListener("open", onOpen as any);
      ws.addEventListener("error", onError as any);

      ws.addEventListener("message", (evt: any) => {
        void this.handleRawMessage(typeof evt.data === "string" ? evt.data : String(evt.data));
      });

      ws.addEventListener("close", () => {
        // allow reconnect loop to pick it up
      });
    });
  }

  private async handleRawMessage(raw: string) {
    let frame: any;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    const type = String(frame?.type ?? "");
    const headers = frame?.headers ?? {};
    const topic = String(headers?.topic ?? "");
    const messageId = String(headers?.messageId ?? "");

    // DingTalk frames store data as JSON string
    const dataStr = typeof frame?.data === "string" ? frame.data : JSON.stringify(frame?.data ?? {});

    if (this.opts.debug) {
      // eslint-disable-next-line no-console
      console.log(`[dingtalk_stream] inbound type=${type} topic=${topic} messageId=${messageId}`);
    }

    if (type === "CALLBACK") {
      const cb = this.callbacks.get(topic);
      if (cb) {
        await cb({ headers: { ...headers }, data: dataStr, raw: frame });
      }
      return;
    }

    // For SYSTEM/EVENT we do nothing but still ack OK if a messageId exists.
    if (messageId) {
      this.socketCallBackResponse(messageId, { success: true });
    }
  }

  private async openConnection(): Promise<StreamOpenConnectionResponse> {
    const subs: StreamSubscription[] = [];
    for (const topic of this.callbacks.keys()) {
      subs.push({ type: "CALLBACK", topic });
    }

    const body = {
      clientId: this.opts.clientId,
      clientSecret: this.opts.clientSecret,
      subscriptions: subs,
      ua: this.opts.userAgent ?? "openclaw-dingtalk/stream-ts",
      localIp: getHostIp(),
    };

    const resp = await fetch(OPEN_CONNECTION_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": this.opts.userAgent ?? "openclaw-dingtalk/stream-ts",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`open_connection failed: ${resp.status} ${t}`);
    }

    const json = (await resp.json()) as any;
    if (!json?.endpoint || !json?.ticket) {
      throw new Error("open_connection missing endpoint/ticket");
    }

    return { endpoint: String(json.endpoint), ticket: String(json.ticket), connectionId: json.connectionId };
  }

  private sendJson(obj: any) {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      this.ws.send(JSON.stringify(obj));
    } catch {
      // ignore
    }
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
