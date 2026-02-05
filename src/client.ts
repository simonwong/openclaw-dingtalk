import { DingTalkStreamClient } from "./dingtalk_stream/index.js";
import type { DingTalkConfig } from "./types.js";
import { resolveDingTalkCredentials } from "./accounts.js";

let cachedClient: DingTalkStreamClient | null = null;
let cachedConfig: { clientId: string; clientSecret: string } | null = null;

export function createDingTalkClient(cfg: DingTalkConfig): DingTalkStreamClient {
  const creds = resolveDingTalkCredentials(cfg);
  if (!creds) {
    throw new Error("DingTalk credentials not configured (clientId, clientSecret required)");
  }

  if (
    cachedClient &&
    cachedConfig &&
    cachedConfig.clientId === creds.clientId &&
    cachedConfig.clientSecret === creds.clientSecret
  ) {
    return cachedClient;
  }

  const client = new DingTalkStreamClient({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    debug: Boolean((cfg as any).debug),
  });

  cachedClient = client;
  cachedConfig = { clientId: creds.clientId, clientSecret: creds.clientSecret };

  return client;
}

export function clearClientCache() {
  if (cachedClient) {
    try {
      cachedClient.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
  cachedClient = null;
  cachedConfig = null;
}

export async function getAccessToken(cfg: DingTalkConfig): Promise<string> {
  const client = createDingTalkClient(cfg);
  return await client.getAccessToken();
}
