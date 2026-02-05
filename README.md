# openclaw-dingtalk

DingTalk (钉钉) channel plugin for OpenClaw.

## Mode

This plugin uses **DingTalk Stream mode** (persistent WebSocket) to receive messages.
No public IP / inbound webhook exposure required.

## What works (v0 Stream)

- Registers a `dingtalk` channel plugin.
- Receives bot messages via Stream (`dingtalk-stream` SDK, `TOPIC_ROBOT`).
- Group isolation: each `conversationId` is routed as a distinct OpenClaw group peer/session.
- Replies in the same chat using the `sessionWebhook` carried by inbound events.
- Basic allowFrom / groupAllowFrom gating.

## Important limitation

Outbound sends to a `conversationId` require a cached `sessionWebhook`.
So you must have at least one inbound message in that chat after the gateway starts.

## Credentials via JSON file (recommended)

Create a file like:

`/root/.openclaw/credentials/dingtalk-client.json`

```json
{
  "clientId": "<appKey>",
  "clientSecret": "<appSecret>"
}
```

Then configure:

```jsonc
{
  "channels": {
    "dingtalk": {
      "enabled": true,

      // 推荐：用单独的 JSON 文件存放密钥
      "clientJsonFile": "/root/.openclaw/credentials/dingtalk-client.json",

      "dmPolicy": "pairing",
      "allowFrom": ["*"],

      "groupPolicy": "allowlist",
      "groupAllowFrom": ["<staffIdA>", "<staffIdB>"],

      "debug": false,
      "showThinking": true
    }
  }
}
```

## Local install

```bash
openclaw plugins install -l /common-projects/openclaw-dingtalk
openclaw plugins enable dingtalk
openclaw gateway restart
```
