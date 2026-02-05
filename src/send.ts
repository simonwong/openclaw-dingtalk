import axios from "axios";
import type { CoreConfig } from "./types.js";
import { resolveDingtalkAccount } from "./accounts.js";
import { getSessionWebhook, getDingTalkAccessToken } from "./stream.js";

export async function sendDingtalkTextToConversation(params: {
  cfg: CoreConfig;
  accountId?: string;
  conversationId: string;
  text: string;
  atUserId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const account = resolveDingtalkAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.clientId || !account.clientSecret) {
    return { ok: false, error: "DingTalk clientId/clientSecret not configured" };
  }

  const sessionWebhook = getSessionWebhook({
    accountId: account.accountId,
    conversationId: params.conversationId,
  });
  if (!sessionWebhook) {
    return {
      ok: false,
      error:
        `Unknown sessionWebhook for conversationId=${params.conversationId}. ` +
        `Send a message in that chat first to establish a stream context.`,
    };
  }

  return sendDingtalkTextViaSessionWebhook({
    cfg: params.cfg,
    accountId: account.accountId,
    sessionWebhook,
    text: params.text,
    atUserId: params.atUserId,
  });
}

export async function sendDingtalkTextViaSessionWebhook(params: {
  cfg: CoreConfig;
  accountId?: string;
  sessionWebhook: string;
  text: string;
  atUserId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const account = resolveDingtalkAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.clientId || !account.clientSecret) {
    return { ok: false, error: "DingTalk clientId/clientSecret not configured" };
  }

  try {
    const accessToken = await getDingTalkAccessToken({
      clientId: account.clientId,
      clientSecret: account.clientSecret,
    });

    const body: any = {
      msgtype: "text",
      text: { content: params.text },
    };
    if (params.atUserId) {
      body.at = { atUserIds: [params.atUserId], isAtAll: false };
    }

    const resp = await axios.post(params.sessionWebhook, body, {
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": accessToken,
      },
      timeout: 30_000,
    });

    if (resp.status >= 200 && resp.status < 300) {
      return { ok: true };
    }
    return { ok: false, error: `HTTP ${resp.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
