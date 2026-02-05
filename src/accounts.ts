import { readFileSync } from "node:fs";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import type { CoreConfig, DingTalkAccountConfig, ResolvedDingtalkAccount } from "./types.js";

function listConfiguredAccountIds(cfg: CoreConfig): string[] {
  const accounts = cfg.channels?.dingtalk?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  const ids = new Set<string>();
  for (const key of Object.keys(accounts)) {
    if (!key) {
      continue;
    }
    ids.add(normalizeAccountId(key));
  }
  return [...ids];
}

export function listDingtalkAccountIds(cfg: CoreConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return [...ids].sort((a: string, b: string) => a.localeCompare(b));
}

export function resolveDefaultDingtalkAccountId(cfg: CoreConfig): string {
  const ids = listDingtalkAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): DingTalkAccountConfig | undefined {
  const accounts = cfg.channels?.dingtalk?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  const direct = accounts[accountId] as DingTalkAccountConfig | undefined;
  if (direct) {
    return direct;
  }
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
  return matchKey ? (accounts[matchKey] as DingTalkAccountConfig | undefined) : undefined;
}

function mergeAccountConfig(cfg: CoreConfig, accountId: string): DingTalkAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.dingtalk ?? {}) as DingTalkAccountConfig & {
    accounts?: unknown;
  };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

function tryReadJsonFile(path?: string): unknown {
  if (!path) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveCreds(merged: DingTalkAccountConfig): { clientId: string; clientSecret: string } {
  const fromFile = tryReadJsonFile(merged.clientJsonFile) as
    | { clientId?: unknown; clientSecret?: unknown }
    | null;

  const fileClientId = typeof fromFile?.clientId === "string" ? fromFile.clientId.trim() : "";
  const fileClientSecret =
    typeof fromFile?.clientSecret === "string" ? fromFile.clientSecret.trim() : "";

  // Inline wins when explicitly set, otherwise fall back to file.
  const clientId = merged.clientId?.trim() || fileClientId;
  const clientSecret = merged.clientSecret?.trim() || fileClientSecret;

  return { clientId: clientId ?? "", clientSecret: clientSecret ?? "" };
}

export function resolveDingtalkAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedDingtalkAccount {
  const normalized = normalizeAccountId(params.accountId);
  const hasExplicitAccountId = Boolean(params.accountId?.trim());

  const baseEnabled = params.cfg.channels?.dingtalk?.enabled !== false;

  const resolve = (accountId: string): ResolvedDingtalkAccount => {
    const merged = mergeAccountConfig(params.cfg, accountId);
    const enabled = baseEnabled && merged.enabled !== false;

    const creds = resolveCreds(merged);

    return {
      accountId,
      enabled,
      name: merged.name?.trim() || undefined,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      config: merged,
    };
  };

  const primary = resolve(normalized);
  if (hasExplicitAccountId) {
    return primary;
  }
  if (primary.clientId && primary.clientSecret) {
    return primary;
  }

  const fallbackId = resolveDefaultDingtalkAccountId(params.cfg);
  if (fallbackId === primary.accountId) {
    return primary;
  }
  const fallback = resolve(fallbackId);
  if (fallback.clientId && fallback.clientSecret) {
    return fallback;
  }
  return primary;
}
