# OpenClaw DingTalk Channel Plugin

## 项目概述

这是 OpenClaw 框架的钉钉（DingTalk）渠道插件，提供企业级钉钉机器人集成。

- **版本**: 0.2.0
- **包名**: @simonwong/openclaw-dingtalk
- **渠道 ID**: dingtalk

## 开发命令

```bash
npm run typecheck    # TypeScript 类型检查
npm run build        # 编译 TypeScript
```

## 架构模块

```
├── index.ts                    # 插件入口，导出所有公共 API
├── src/
│   ├── channel.ts              # OpenClaw 渠道插件定义（核心）
│   ├── bot.ts                  # 消息解析与处理
│   ├── ai-card.ts              # AI 卡片流式输出
│   ├── card-replier.ts         # 卡片回复器（CardReplier/AICardReplier）
│   ├── card-instance.ts        # 卡片实例类
│   ├── outbound.ts             # 出站消息适配器
│   ├── send.ts                 # SessionWebhook 消息发送
│   ├── openapi-send.ts         # OpenAPI 主动消息
│   ├── media.ts                # 媒体上传/下载
│   ├── monitor.ts              # Stream 连接监控
│   ├── streaming-handler.ts    # 流式响应处理
│   ├── gateway-stream.ts       # Gateway SSE 集成
│   ├── config-schema.ts        # Zod 配置校验
│   ├── types.ts                # TypeScript 类型定义
│   ├── runtime.ts              # 运行时单例
│   ├── session.ts              # 会话管理
│   ├── policy.ts               # 群聊/私聊访问策略
│   ├── targets.ts              # 目标 ID 解析
│   ├── accounts.ts             # 账户解析
│   ├── directory.ts            # 用户/群组目录
│   ├── onboarding.ts           # 机器人引导流程
│   ├── probe.ts                # 连接探测
│   ├── reactions.ts            # 表情反应（存根）
│   ├── richtext.ts             # 富文本解析
│   ├── client.ts               # DingTalk 客户端包装
│   ├── typing.ts               # 输入指示器
│   └── dingtalk_stream/        # Stream SDK
│       ├── frames.ts           # 消息帧类
│       ├── handlers.ts         # 处理器基类
│       ├── stream.ts           # WebSocket 客户端
│       ├── types.ts            # Stream SDK 类型
│       └── index.ts            # SDK 导出
```

## 消息流程

```
钉钉服务器
    ↓ WebSocket (Stream 模式)
DingTalkStreamClient (stream.ts)
    ↓ CALLBACK 消息
handleDingTalkMessage (bot.ts)
    ↓ 解析、策略检查、媒体下载
OpenClaw Agent 系统
    ↓ 生成回复
dingtalkOutbound (outbound.ts)
    ↓ SessionWebhook 或 OpenAPI
钉钉服务器
```

## 关键模式约定

### 消息发送

1. **SessionWebhook**: 临时 webhook URL，用于回复消息，有时效限制
2. **OpenAPI**: 主动消息发送，需要 accessToken，功能更完整

### AI 卡片流式输出

```typescript
const card = await createAICard(config, messageData, log);
await streamAICard(card, "部分内容...");
await finishAICard(card, "完整内容");
```

### 配置层级

- 全局: `channels.dingtalk`
- 群组: `channels.dingtalk.groups.{groupId}`
- 用户: `channels.dingtalk.dms.{userId}`

### 访问策略

- `dmPolicy`: "open" | "pairing" | "allowlist"
- `groupPolicy`: "open" | "allowlist" | "disabled"

## 钉钉 API 约束

1. **SessionWebhook 时效**: webhook URL 有过期时间，需要在有效期内使用
2. **消息编辑**: 钉钉不支持通过 bot API 编辑已发消息
3. **表情反应**: 钉钉 bot API 不支持表情反应
4. **群聊 @**: 群聊中需要 @机器人 才能触发（可配置）
5. **媒体上传**: 需要 oapi access token，最大 20MB
6. **AI 卡片模板**: 使用官方模板 ID `382e4302-551d-4880-bf29-a30acfab2e71.schema`

## 文件标记格式

发送文件使用特殊标记：
```
[DINGTALK_FILE]{"path": "/path/to/file.pdf", "name": "报告.pdf"}[/DINGTALK_FILE]
```

## 环境变量

无硬编码环境变量，所有配置通过 OpenClaw 配置系统管理。

## 依赖

- `openclaw`: OpenClaw 框架
- `ws`: WebSocket 客户端
- `zod`: 配置验证
