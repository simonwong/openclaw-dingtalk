import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { DingTalkConfig, ResolvedDingTalkAccount } from "./types.js";

export function resolveDingTalkCredentials(cfg?: DingTalkConfig): {
  clientId: string;
  clientSecret: string;
  robotCode: string;
} | null {
  // New config names
  const clientId = (cfg as any)?.clientId?.trim?.() || "";
  const clientSecret = (cfg as any)?.clientSecret?.trim?.() || "";

  // Legacy names (backward compatible)
  const legacyId = cfg?.appKey?.trim() || "";
  const legacySecret = cfg?.appSecret?.trim() || "";

  const id = clientId || legacyId;
  const secret = clientSecret || legacySecret;
  if (!id || !secret) return null;

  // In this plugin, robotCode is the same as clientId.
  return {
    clientId: id,
    clientSecret: secret,
    robotCode: id,
  };
}

export function resolveDingTalkRobotCode(cfg?: DingTalkConfig): string {
  return resolveDingTalkCredentials(cfg)?.robotCode || "";
}

export function resolveDingTalkClientId(cfg?: DingTalkConfig): string {
  return resolveDingTalkCredentials(cfg)?.clientId || "";
}

export function resolveDingTalkAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedDingTalkAccount {
  const dingtalkCfg = params.cfg.channels?.dingtalk as DingTalkConfig | undefined;
  const enabled = dingtalkCfg?.enabled !== false;
  const creds = resolveDingTalkCredentials(dingtalkCfg);

  return {
    accountId: params.accountId?.trim() || DEFAULT_ACCOUNT_ID,
    enabled,
    configured: Boolean(creds),
    appKey: creds?.clientId,
    robotCode: creds?.robotCode,
  };
}

export function listDingTalkAccountIds(_cfg: OpenClawConfig): string[] {
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultDingTalkAccountId(_cfg: OpenClawConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function listEnabledDingTalkAccounts(cfg: OpenClawConfig): ResolvedDingTalkAccount[] {
  return listDingTalkAccountIds(cfg)
    .map((accountId) => resolveDingTalkAccount({ cfg, accountId }))
    .filter((account) => account.enabled && account.configured);
}
