import {
  BlockStreamingCoalesceSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  ToolPolicySchema,
  requireOpenAllowFrom,
} from "openclaw/plugin-sdk";
import { z } from "zod";

export const DingTalkGroupSchema = z
  .object({
    enabled: z.boolean().optional(),
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    skills: z.array(z.string()).optional(),
    allowFrom: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
  })
  .strict();

export const DingTalkAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),

    markdown: MarkdownConfigSchema,

    // Stream mode
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    clientJsonFile: z.string().optional(),

    robotCode: z.string().optional(),

    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.string()).optional(),

    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groupAllowFrom: z.array(z.string()).optional(),
    groups: z.record(z.string(), DingTalkGroupSchema.optional()).optional(),

    // DMs granular config (optional, kept for consistency with other channels)
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),

    textChunkLimit: z.number().int().positive().optional(),
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),

    // Best-effort local context (not fetched from DingTalk OpenAPI)
    includeRecentMessages: z.number().int().min(0).max(20).optional(),

    debug: z.boolean().optional(),
    showThinking: z.boolean().optional(),
  })
  .strict();

export const DingTalkAccountSchema = DingTalkAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.dingtalk.dmPolicy="open" requires channels.dingtalk.allowFrom to include "*"',
  });
});

export const DingTalkConfigSchema = DingTalkAccountSchemaBase.extend({
  accounts: z.record(z.string(), DingTalkAccountSchema.optional()).optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.dingtalk.dmPolicy="open" requires channels.dingtalk.allowFrom to include "*"',
  });
});
