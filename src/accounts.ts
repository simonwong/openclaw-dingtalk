import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { DingTalkConfig, ResolvedDingTalkAccount } from "./types.js";

export function resolveDingTalkCredentials(cfg?: DingTalkConfig): {
  clientId: string;
  clientSecret: string;
  robotCode: string;
} | null {
  const clientId = (cfg as any)?.clientId?.trim?.() || "";
  const clientSecret = (cfg as any)?.clientSecret?.trim?.() || "";
  if (!clientId || !clientSecret) return null;

  // In this plugin, robotCode is the same as clientId.
  return {
    clientId,
    clientSecret,
    robotCode: clientId,
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
    clientId: creds?.clientId,
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
