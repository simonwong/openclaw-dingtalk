import axios from "axios";
import { StreamClient as DWClient, TOPIC_ROBOT } from "./dingtalk_stream/index.js";
import type { CoreConfig, DingtalkInboundMessage } from "./types.js";
import { resolveDingtalkAccount } from "./accounts.js";
import { handleDingtalkInbound } from "./inbound.js";
import { getDingtalkRuntime } from "./runtime.js";

const sessionWebhookByConversation = new Map<string, string>();

export function getSessionWebhook(params: { accountId: string; conversationId: string }): string | null {
  return sessionWebhookByConversation.get(`${params.accountId}:${params.conversationId}`) ?? null;
}

const accessTokenCache = new Map<string, { token: string; expiryMs: number }>();

export async function getDingTalkAccessToken(params: { clientId: string; clientSecret: string }): Promise<string> {
  const now = Date.now();
  const key = params.clientId;
  const cached = accessTokenCache.get(key);
  if (cached && cached.expiryMs > now + 60_000) {
    return cached.token;
  }

  const resp = await axios.post("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    appKey: params.clientId,
    appSecret: params.clientSecret,
  });

  const token = String(resp.data?.accessToken ?? "");
  const expireIn = Number(resp.data?.expireIn ?? 0);
  if (!token) {
    throw new Error("Failed to obtain DingTalk accessToken");
  }

  accessTokenCache.set(key, { token, expiryMs: now + expireIn * 1000 });
  return token;
}

function extractInboundFromStreamPayload(data: any): DingtalkInboundMessage | null {
  const text =
    typeof data?.text?.content === "string"
      ? data.text.content
      : typeof data?.content?.text === "string"
        ? data.content.text
        : typeof data?.content === "string"
          ? data.content
          : "";

  const sessionWebhook = String(data?.sessionWebhook ?? "");
  const senderId = String(data?.senderStaffId ?? data?.senderId ?? "");
  const senderName = typeof data?.senderNick === "string" ? data.senderNick : undefined;
  const conversationId = String(data?.conversationId ?? data?.chatId ?? data?.cid ?? "");

  if (!sessionWebhook || !senderId || !conversationId) {
    return null;
  }

  const convType = data?.conversationType;
  const isDirect = convType === 1 || convType === "1";
  const isGroup = !isDirect;

  // Media download code can appear at data.content.downloadCode
  const downloadCode =
    typeof data?.content?.downloadCode === "string" ? data.content.downloadCode : undefined;

  return {
    messageId: String(data?.msgId ?? `${conversationId}:${Date.now()}`),
    timestamp: Number(data?.createAt ?? Date.now()),
    isGroup,
    conversationId,
    conversationTitle: typeof data?.conversationTitle === "string" ? data.conversationTitle : undefined,
    senderId,
    senderName,
    text: String(text ?? "").trim(),
    sessionWebhook,
    downloadCode,
    msgtype: typeof data?.msgtype === "string" ? data.msgtype : undefined,
  };
}

export async function monitorDingtalkStreamProvider(opts: {
  accountId?: string;
  config: CoreConfig;
  abortSignal?: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<{ stop: () => void }> {
  const core = getDingtalkRuntime();
  const cfg = opts.config;
  const account = resolveDingtalkAccount({ cfg, accountId: opts.accountId });

  if (!account.clientId || !account.clientSecret) {
    throw new Error("DingTalk clientId/clientSecret not configured");
  }

  const logger = core.logging.getChildLogger({ channel: "dingtalk", accountId: account.accountId });

  const client = new DWClient({
    clientId: account.clientId,
    clientSecret: account.clientSecret,
    debug: Boolean(account.config.debug),
  } as any);

  client.registerCallbackListener(TOPIC_ROBOT, async (res: any) => {
    const messageId = res?.headers?.messageId;
    try {
      const payload = JSON.parse(res.data);
      const inbound = extractInboundFromStreamPayload(payload);
      if (!inbound || !inbound.text) {
        if (messageId) {
          client.socketCallBackResponse(messageId, { success: true });
        }
        return;
      }

      if (account.config.debug) {
        logger.info(
          `[dingtalk:${account.accountId}] inbound kind=${inbound.isGroup ? "group" : "dm"} conversationId=${inbound.conversationId} title=${inbound.conversationTitle ?? ""} sender=${inbound.senderId} msgtype=${inbound.msgtype ?? ""}`,
        );
      }

      // Store sessionWebhook for later outbound to conversation.
      sessionWebhookByConversation.set(`${account.accountId}:${inbound.conversationId}`, inbound.sessionWebhook);

      opts.statusSink?.({ lastInboundAt: inbound.timestamp });

      await handleDingtalkInbound({
        message: inbound,
        account,
        config: cfg,
        runtime: {
          log: (m: string) => logger.info(m),
          error: (m: string) => logger.error(m),
          exit: () => {
            throw new Error("Runtime exit not available");
          },
        },
        statusSink: opts.statusSink,
      });

      if (messageId) {
        client.socketCallBackResponse(messageId, { success: true });
      }
    } catch (err) {
      logger.error(`[dingtalk] stream message handling error: ${err instanceof Error ? err.message : String(err)}`);
      if (messageId) {
        client.socketCallBackResponse(messageId, { success: false });
      }
    }
  });

  await client.connect();
  logger.info(`[dingtalk:${account.accountId}] stream connected`);

  let stopped = false;
  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    try {
      // dingtalk-stream SDK doesn't expose a standard close in typings; best-effort.
      (client as any)?.close?.();
      (client as any)?.socket?.close?.();
    } catch {
      // ignore
    }
  };

  if (opts.abortSignal) {
    opts.abortSignal.addEventListener("abort", stop, { once: true });
  }

  // Warm up token (optional), also validates creds.
  try {
    await getDingTalkAccessToken({ clientId: account.clientId, clientSecret: account.clientSecret });
  } catch (e) {
    logger.warn(`[dingtalk:${account.accountId}] accessToken probe failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { stop };
}

export async function callDingtalkApi<T>(params: {
  clientId: string;
  clientSecret: string;
  method: "GET" | "POST";
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
}): Promise<T> {
  const token = await getDingTalkAccessToken({ clientId: params.clientId, clientSecret: params.clientSecret });
  const resp = await axios({
    method: params.method,
    url: params.url,
    data: params.data,
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
      ...(params.headers ?? {}),
    },
  });
  return resp.data as T;
}
