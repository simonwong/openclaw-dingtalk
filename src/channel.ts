import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { ResolvedDingTalkAccount, DingTalkConfig } from "./types.js";
import { resolveDingTalkAccount, resolveDingTalkCredentials } from "./accounts.js";
import { dingtalkOutbound } from "./outbound.js";
import { probeDingTalk } from "./probe.js";
import { resolveDingTalkGroupToolPolicy } from "./policy.js";
import { normalizeDingTalkTarget, looksLikeDingTalkId } from "./targets.js";
import {
  listDingTalkDirectoryPeers,
  listDingTalkDirectoryGroups,
  listDingTalkDirectoryPeersLive,
  listDingTalkDirectoryGroupsLive,
} from "./directory.js";
import { dingtalkOnboardingAdapter } from "./onboarding.js";

const meta = {
  id: "dingtalk",
  label: "DingTalk",
  selectionLabel: "DingTalk (钉钉)",
  docsPath: "/channels/dingtalk",
  docsLabel: "dingtalk",
  blurb: "钉钉/DingTalk enterprise messaging.",
  aliases: ["dingding"],
  order: 70,
};

export const dingtalkPlugin: ChannelPlugin<ResolvedDingTalkAccount> = {
  id: "dingtalk",
  meta: {
    ...meta,
  },
  pairing: {
    idLabel: "dingtalkUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(dingtalk|user|staff):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const dingtalkCfg = cfg.channels?.dingtalk as DingTalkConfig | undefined;
      const clientId = (dingtalkCfg as any)?.clientId;
      const clientSecret = (dingtalkCfg as any)?.clientSecret;
      if (!clientId || !clientSecret) {
        return;
      }
      try {
        const { sendTextViaOpenAPI } = await import("./openapi-send.js");
        const staffId = String(id).replace(/^(dingtalk|user|staff):/i, "");
        await sendTextViaOpenAPI({
          config: dingtalkCfg,
          target: { kind: "user", id: staffId },
          content: "Your pairing request has been approved. You can now send messages to the bot.",
        });
      } catch {
        // Proactive send not available; silently ignore
      }
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    threads: false, // DingTalk has limited thread support
    media: true,
    reactions: false, // DingTalk doesn't support reactions via bot API
    edit: false, // DingTalk doesn't support message editing via sessionWebhook
    reply: true,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- DingTalk targeting: messages are sent via sessionWebhook to the current conversation.",
      "- DingTalk supports text, markdown, and ActionCard message types.",
    ],
  },
  groups: {
    resolveToolPolicy: resolveDingTalkGroupToolPolicy,
    resolveRequireMention: ({ cfg }) => {
      const dingtalkCfg = cfg.channels?.dingtalk as DingTalkConfig | undefined;
      return dingtalkCfg?.groupPolicy !== "open";
    },
  },
  reload: { configPrefixes: ["channels.dingtalk"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        clientId: { type: "string" },
        clientSecret: { type: "string" },
        connectionMode: { type: "string", enum: ["stream", "webhook"] },
        webhookPath: { type: "string" },
        webhookPort: { type: "integer", minimum: 1 },
        dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
        allowFrom: { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } },
        groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
        groupAllowFrom: { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } },
        groupSessionScope: { type: "string", enum: ["per-group", "per-user"] },
        historyLimit: { type: "integer", minimum: 0 },
        dmHistoryLimit: { type: "integer", minimum: 0 },
        textChunkLimit: { type: "integer", minimum: 1 },
        chunkMode: { type: "string", enum: ["length", "newline"] },
        mediaMaxMb: { type: "number", minimum: 0 },
        renderMode: { type: "string", enum: ["auto", "raw", "card"] },
        cooldownMs: { type: "integer", minimum: 0 },
        aiCardMode: { type: "string", enum: ["enabled", "disabled"] },
        sessionTimeout: { type: "integer", minimum: 0 },
        enableMediaUpload: { type: "boolean" },
        systemPrompt: { type: "string" },
        gatewayToken: { type: "string" },
        gatewayPassword: { type: "string" },
        gatewayPort: { type: "integer", minimum: 1 },
        debug: { type: "boolean" },
      },
    },
    uiHints: {
      enabled: { label: "Enable DingTalk" },
      clientId: { label: "Client ID", sensitive: false },
      clientSecret: { label: "Client Secret", sensitive: true },
      dmPolicy: { label: "DM Policy" },
      groupPolicy: { label: "Group Policy" },
      aiCardMode: { label: "AI Card Mode" },
      sessionTimeout: { label: "Session Timeout (ms)" },
      gatewayToken: { label: "Gateway Token", sensitive: true },
      gatewayPassword: { label: "Gateway Password", sensitive: true },
    },
  },
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg) => resolveDingTalkAccount({ cfg }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) => ({
      ...(cfg as any),
      channels: {
        ...((cfg as any).channels ?? {}),
        dingtalk: {
          ...(((cfg as any).channels ?? {}).dingtalk ?? {}),
          enabled,
        },
      },
    }),
    deleteAccount: ({ cfg }) => {
      const next = { ...(cfg as any) } as any;
      const nextChannels = { ...(((cfg as any).channels ?? {}) as any) };
      delete (nextChannels as Record<string, unknown>).dingtalk;
      if (Object.keys(nextChannels).length > 0) {
        next.channels = nextChannels;
      } else {
        delete next.channels;
      }
      return next as OpenClawConfig;
    },
    isConfigured: (_account, cfg) =>
      Boolean(resolveDingTalkCredentials(cfg.channels?.dingtalk as DingTalkConfig | undefined)),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: ({ cfg }) =>
      ((cfg.channels?.dingtalk as DingTalkConfig | undefined)?.allowFrom ?? []).map(String),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    collectWarnings: ({ cfg }) => {
      const dingtalkCfg = cfg.channels?.dingtalk as DingTalkConfig | undefined;
      const defaultGroupPolicy = (cfg.channels as Record<string, { groupPolicy?: string }> | undefined)?.defaults?.groupPolicy;
      const groupPolicy = dingtalkCfg?.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- DingTalk groups: groupPolicy="open" allows any member to trigger (mention-gated). Set channels.dingtalk.groupPolicy="allowlist" + channels.dingtalk.groupAllowFrom to restrict senders.`,
      ];
    },
    resolveDmPolicy: ({ cfg }) => {
      const dingtalkCfg = cfg.channels?.dingtalk as DingTalkConfig | undefined;
      return {
        policy: dingtalkCfg?.dmPolicy || "pairing",
        allowFrom: (dingtalkCfg?.allowFrom ?? []).map(String),
        policyPath: "channels.dingtalk.dmPolicy",
        allowFromPath: "channels.dingtalk.allowFrom",
        approveHint: "使用 /allow dingtalk:<userId> 批准用户",
        normalizeEntry: (raw: string) => raw.replace(/^(dingtalk|user|staff):/i, ""),
      };
    },
  },
  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg }) => ({
      ...(cfg as any),
      channels: {
        ...((cfg as any).channels ?? {}),
        dingtalk: {
          ...(((cfg as any).channels ?? {}).dingtalk ?? {}),
          enabled: true,
        },
      },
    }),
  },
  onboarding: dingtalkOnboardingAdapter,
  messaging: {
    normalizeTarget: normalizeDingTalkTarget,
    targetResolver: {
      looksLikeId: looksLikeDingTalkId,
      hint: "<conversationId|user:staffId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, query, limit }) =>
      listDingTalkDirectoryPeers({ cfg, query, limit }),
    listGroups: async ({ cfg, query, limit }) =>
      listDingTalkDirectoryGroups({ cfg, query, limit }),
    listPeersLive: async ({ cfg, query, limit }) =>
      listDingTalkDirectoryPeersLive({ cfg, query, limit }),
    listGroupsLive: async ({ cfg, query, limit }) =>
      listDingTalkDirectoryGroupsLive({ cfg, query, limit }),
  },
  outbound: dingtalkOutbound,
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      port: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      port: snapshot.port ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ cfg }) =>
      await probeDingTalk(cfg.channels?.dingtalk as DingTalkConfig | undefined),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      port: runtime?.port ?? null,
      probe,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorDingTalkProvider } = await import("./monitor.js");
      const dingtalkCfg = ctx.cfg.channels?.dingtalk as DingTalkConfig | undefined;
      const port = dingtalkCfg?.webhookPort ?? null;
      ctx.setStatus({ accountId: ctx.accountId, port });
      ctx.log?.info(`starting dingtalk provider (mode: ${dingtalkCfg?.connectionMode ?? "stream"})`);

      return monitorDingTalkProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
      });
    },
  },
};
