export type DingTalkGroupConfig = {
  enabled?: boolean;
  requireMention?: boolean;
  allowFrom?: string[];
  skills?: string[];
  systemPrompt?: string;
  tools?: unknown;
};

export type DingTalkAccountConfig = {
  name?: string;
  enabled?: boolean;

  // Stream mode credentials
  // Option A: inline
  clientId?: string; // appKey
  clientSecret?: string; // appSecret
  // Option B: read from a JSON file: {"clientId":"...","clientSecret":"..."}
  clientJsonFile?: string;

  // Optional robotCode (needed for media download API)
  robotCode?: string;

  // Security/policy.
  dmPolicy?: "disabled" | "pairing" | "open";
  allowFrom?: string[];
  groupPolicy?: "allowlist" | "open";
  groupAllowFrom?: string[];
  groups?: Record<string, DingTalkGroupConfig | undefined>;

  // Reply behavior.
  textChunkLimit?: number;
  blockStreaming?: boolean;
  blockStreamingCoalesce?: unknown;

  debug?: boolean;
  showThinking?: boolean;
};

export type CoreConfig = {
  channels?: {
    defaults?: {
      groupPolicy?: "allowlist" | "open";
    };
    dingtalk?: DingTalkAccountConfig & {
      enabled?: boolean;
      accounts?: Record<string, DingTalkAccountConfig | undefined>;
    };
  };
};

export type ResolvedDingtalkAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;

  clientId: string;
  clientSecret: string;

  config: DingTalkAccountConfig;
};

export type DingtalkInboundMessage = {
  messageId: string;
  timestamp: number;

  isGroup: boolean;
  conversationId: string;
  conversationTitle?: string;

  senderId: string;
  senderName?: string;

  text: string;

  // DingTalk stream provides sessionWebhook for replies
  sessionWebhook: string;

  // Optional: media download code
  downloadCode?: string;
  msgtype?: string;
};
