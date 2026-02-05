import type { DingTalkConfig, DingTalkProbeResult } from "./types.js";
import { createDingTalkClient } from "./client.js";
import { resolveDingTalkCredentials } from "./accounts.js";

export async function probeDingTalk(cfg?: DingTalkConfig): Promise<DingTalkProbeResult> {
  const creds = resolveDingTalkCredentials(cfg);
  if (!creds) {
    return {
      ok: false,
      error: "missing credentials (clientId, clientSecret)",
    };
  }

  try {
    const client = createDingTalkClient(cfg!);

    // Try to get access token as a connectivity test
    const accessToken = await client.getAccessToken();

    if (!accessToken) {
      return {
        ok: false,
        appKey: creds.clientId,
        error: "Failed to get access token",
      };
    }

    return {
      ok: true,
      appKey: creds.clientId,
      robotCode: creds.robotCode,
      connected: true,
    };
  } catch (err) {
    return {
      ok: false,
      appKey: creds.clientId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
