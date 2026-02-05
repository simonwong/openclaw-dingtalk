import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  setAccountEnabledInConfigSection,
  type ChannelAccountSnapshot,
  type ChannelPlugin,
  type ChannelStatusIssue,
} from "openclaw/plugin-sdk";
import { DingTalkConfigSchema } from "./config-schema.js";
import {
  listDingtalkAccountIds,
  resolveDefaultDingtalkAccountId,
  resolveDingtalkAccount,
} from "./accounts.js";
import type { CoreConfig, ResolvedDingtalkAccount } from "./types.js";
import { monitorDingtalkStreamProvider } from "./stream.js";
import { sendDingtalkTextToConversation } from "./send.js";
import { getDingtalkRuntime } from "./runtime.js";

const meta = {
  id: "dingtalk",
  label: "DingTalk",
  selectionLabel: "DingTalk (Stream)",
  detailLabel: "DingTalk Bot",
  docsPath: "/channels/dingtalk",
  docsLabel: "dingtalk",
  blurb: "DingTalk bot via Stream mode (WebSocket).",
  aliases: ["ding", "dd"],
  order: 40,
  quickstartAllowFrom: true,
};

const normalizeAllowEntry = (entry: string) => entry.replace(/^(dingtalk|ding|dd):/i, "").trim();

export const dingtalkPlugin: ChannelPlugin<ResolvedDingtalkAccount> = {
  id: "dingtalk",
  meta,
  pairing: {
    idLabel: "dingtalkUserId",
    normalizeAllowEntry,
    notifyApproval: async ({ id }) => {
      console.log(`[dingtalk] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.dingtalk"] },
  configSchema: buildChannelConfigSchema(DingTalkConfigSchema),
  config: {
    listAccountIds: (cfg) => listDingtalkAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) => resolveDingtalkAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultDingtalkAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "dingtalk",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "dingtalk",
        accountId,
        clearBaseFields: ["clientId", "clientSecret", "robotCode", "name"],
      }),
    isConfigured: (account) => Boolean(account.clientId?.trim() && account.clientSecret?.trim()),
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.clientId?.trim() && account.clientSecret?.trim()),
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveDingtalkAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []).map(String),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => (entry === "*" ? entry : normalizeAllowEntry(entry)))
        .map((entry) => (entry === "*" ? entry : entry.toLowerCase())),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean((cfg as any).channels?.dingtalk?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.dingtalk.accounts.${resolvedAccountId}.`
        : "channels.dingtalk.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("dingtalk"),
        normalizeEntry: normalizeAllowEntry,
      };
    },
  },
  messaging: {
    normalizeTarget: (raw: string) => raw.replace(/^(dingtalk|ding|dd):/i, "").trim() || undefined,
    targetResolver: {
      looksLikeId: (_raw, normalized) => {
        const v = (normalized ?? "").trim();
        return Boolean(v);
      },
      hint: "<conversationId>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    chunker: (text, limit) => getDingtalkRuntime().channel.text.chunkMarkdownText(text, limit),
    sendText: async ({ to, text, accountId }) => {
      const cfg = getDingtalkRuntime().config.loadConfig() as unknown as CoreConfig;
      const result = await sendDingtalkTextToConversation({
        cfg,
        accountId: accountId ?? undefined,
        conversationId: to,
        text,
      });
      if (!result.ok) {
        throw new Error(result.error || "DingTalk send failed");
      }
      return { channel: "dingtalk" } as any;
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const combined = mediaUrl ? `${text}\n\nAttachment: ${mediaUrl}` : text;
      const cfg = getDingtalkRuntime().config.loadConfig() as unknown as CoreConfig;
      const result = await sendDingtalkTextToConversation({
        cfg,
        accountId: accountId ?? undefined,
        conversationId: to,
        text: combined,
      });
      if (!result.ok) {
        throw new Error(result.error || "DingTalk send failed");
      }
      return { channel: "dingtalk" } as any;
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) => {
      const issues: ChannelStatusIssue[] = [];
      for (const account of accounts) {
        if (!account.configured) {
          issues.push({
            channel: "dingtalk",
            accountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
            kind: "config",
            message: "DingTalk clientId/clientSecret not configured",
          });
        }
      }
      return issues;
    },
    buildChannelSummary: async ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      mode: "stream",
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.clientId?.trim() && account.clientSecret?.trim()),
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: (runtime as any)?.lastInboundAt ?? null,
      lastOutboundAt: (runtime as any)?.lastOutboundAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const { account, log, setStatus, abortSignal, cfg } = ctx;
      if (!account.clientId || !account.clientSecret) {
        throw new Error("DingTalk clientId/clientSecret not configured");
      }
      log?.info(`[${account.accountId}] starting DingTalk Stream client`);
      setStatus({ accountId: account.accountId, running: true, lastStartAt: Date.now() });

      try {
        const { stop } = await monitorDingtalkStreamProvider({
          accountId: account.accountId,
          config: cfg as CoreConfig,
          abortSignal,
          statusSink: (patch) => setStatus({ accountId: account.accountId, ...patch } as any),
        });
        return { stop };
      } catch (err) {
        setStatus({
          accountId: account.accountId,
          running: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  },
};
