import {
  logInboundDrop,
  resolveControlCommandGate,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import type { CoreConfig, DingtalkInboundMessage, ResolvedDingtalkAccount } from "./types.js";
import { getDingtalkRuntime } from "./runtime.js";
import { sendDingtalkTextViaSessionWebhook } from "./send.js";

const CHANNEL_ID = "dingtalk" as const;

async function deliverDingtalkReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string; replyToId?: string };
  sessionWebhook: string;
  accountId: string;
  cfg: CoreConfig;
  atUserId?: string | null;
  statusSink?: (patch: { lastOutboundAt?: number }) => void;
}) {
  const text = params.payload.text?.trim() ?? "";
  const mediaList = params.payload.mediaUrls?.length
    ? params.payload.mediaUrls
    : params.payload.mediaUrl
      ? [params.payload.mediaUrl]
      : [];

  if (!text && mediaList.length === 0) {
    return;
  }

  const mediaBlock = mediaList.length ? mediaList.map((u) => `Attachment: ${u}`).join("\n") : "";
  const combined = text ? (mediaBlock ? `${text}\n\n${mediaBlock}` : text) : mediaBlock;

  const result = await sendDingtalkTextViaSessionWebhook({
    cfg: params.cfg,
    accountId: params.accountId,
    sessionWebhook: params.sessionWebhook,
    text: combined,
    atUserId: params.atUserId,
  });
  if (!result.ok) {
    throw new Error(result.error || "DingTalk send failed");
  }

  params.statusSink?.({ lastOutboundAt: Date.now() });
}

export async function handleDingtalkInbound(params: {
  message: DingtalkInboundMessage;
  account: ResolvedDingtalkAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}) {
  const { message, account, config, runtime, statusSink } = params;
  const core = getDingtalkRuntime();

  const rawBody = message.text?.trim() ?? "";
  if (!rawBody) {
    return;
  }

  statusSink?.({ lastInboundAt: message.timestamp });

  const isGroup = message.isGroup;
  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

  const allowFrom = (account.config.allowFrom ?? []).map(String);
  const groupAllowFrom = (account.config.groupAllowFrom ?? []).map(String);

  const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
    cfg: config as unknown as OpenClawConfig,
    surface: CHANNEL_ID,
  });

  const hasControlCommand = core.channel.text.hasControlCommand(
    rawBody,
    config as unknown as OpenClawConfig,
  );

  const list = isGroup ? groupAllowFrom : allowFrom;
  const senderAllowed = list.includes("*") || list.includes(message.senderId);

  const commandGate = resolveControlCommandGate({
    useAccessGroups: (config as any).commands?.useAccessGroups !== false,
    authorizers: [
      {
        configured: list.length > 0,
        allowed: senderAllowed,
      },
    ],
    allowTextCommands,
    hasControlCommand,
  });

  if (isGroup && commandGate.shouldBlock) {
    logInboundDrop({
      log: (m) => runtime.log?.(m),
      channel: CHANNEL_ID,
      reason: "control command (unauthorized)",
      target: message.senderId,
    });
    return;
  }

  if (!isGroup) {
    if (dmPolicy === "disabled") {
      runtime.log?.(`dingtalk: drop DM sender=${message.senderId} (dmPolicy=disabled)`);
      return;
    }
    if (dmPolicy !== "open") {
      if (!senderAllowed) {
        runtime.log?.(`dingtalk: drop DM sender=${message.senderId} (dmPolicy=${dmPolicy})`);
        return;
      }
    }
  } else {
    if (groupPolicy !== "open") {
      if (!senderAllowed) {
        runtime.log?.(
          `dingtalk: drop group sender=${message.senderId} (groupPolicy=${groupPolicy})`,
        );
        return;
      }
    }
  }

  const mentionRegexes = core.channel.mentions.buildMentionRegexes(config as unknown as OpenClawConfig);
  const wasMentioned = mentionRegexes.length
    ? core.channel.mentions.matchesMentionPatterns(rawBody, mentionRegexes)
    : false;

  // Group isolation by conversationId.
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as unknown as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "dm",
      id: isGroup ? message.conversationId : message.senderId,
    },
  });

  const fromLabel = isGroup
    ? `group:${message.conversationTitle || message.conversationId} - ${message.senderName || message.senderId}`
    : message.senderName || `user:${message.senderId}`;

  const storePath = core.channel.session.resolveStorePath((config as any).session?.store, {
    agentId: route.agentId,
  });

  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(
    config as unknown as OpenClawConfig,
  );

  const body = core.channel.reply.formatAgentEnvelope({
    channel: "DingTalk",
    from: fromLabel,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: isGroup ? `dingtalk:group:${message.conversationId}` : `dingtalk:${message.senderId}`,
    To: `dingtalk:${message.conversationId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: message.senderName,
    SenderId: message.senderId,
    GroupSubject: isGroup ? message.conversationTitle : undefined,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    WasMentioned: isGroup ? wasMentioned : undefined,
    MessageSid: message.messageId,
    Timestamp: message.timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `dingtalk:${message.conversationId}`,
    CommandAuthorized: commandGate.commandAuthorized,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => runtime.error?.(`dingtalk: failed updating session meta: ${String(err)}`),
  });

  if (account.config.showThinking !== false) {
    try {
      await sendDingtalkTextViaSessionWebhook({
        cfg: config,
        accountId: account.accountId,
        sessionWebhook: message.sessionWebhook,
        text: "正在思考...",
        atUserId: isGroup ? message.senderId : null,
      });
    } catch {
      // ignore
    }
  }

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as unknown as OpenClawConfig,
    dispatcherOptions: {
      deliver: async (payload) => {
        await deliverDingtalkReply({
          payload: payload as any,
          sessionWebhook: message.sessionWebhook,
          accountId: account.accountId,
          cfg: config,
          atUserId: isGroup ? message.senderId : null,
          statusSink,
        });
      },
      onError: (err, info) => {
        runtime.error?.(`dingtalk ${info.kind} reply failed: ${String(err)}`);
      },
    },
  });
}
