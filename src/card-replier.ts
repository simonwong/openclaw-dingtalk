/**
 * Card Replier for DingTalk
 *
 * Based on Python SDK: card_replier.py
 */

import type { DingTalkConfig } from "./types.js";
import {
  createAICard,
  streamAICard,
  finishAICard,
  failAICard,
  getAccessToken,
  type AICardInstance,
  type AICardMessageData,
} from "./ai-card.js";

interface Logger {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
}

/**
 * Card replier for creating and managing DingTalk interactive cards
 */
export class CardReplier {
  protected config: DingTalkConfig;
  protected messageData: AICardMessageData;
  protected log?: Logger;

  constructor(config: DingTalkConfig, messageData: AICardMessageData, log?: Logger) {
    this.config = config;
    this.messageData = messageData;
    this.log = log;
  }

  /**
   * Create and send a card to the conversation
   * @param templateId Card template ID
   * @param cardData Card data parameters
   * @param atUsers Users to @mention (optional)
   */
  async createAndSendCard(
    templateId: string,
    cardData: Record<string, any>,
    atUsers?: string[],
  ): Promise<string | null> {
    try {
      const accessToken = await getAccessToken(this.config);
      const outTrackId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      this.log?.info?.(`[CardReplier] Creating card templateId=${templateId}`);

      // Create card instance
      const createBody: Record<string, any> = {
        cardTemplateId: templateId,
        outTrackId,
        cardData: {
          cardParamMap: cardData,
        },
      };

      const createResp = await fetch("https://api.dingtalk.com/v1.0/card/instances", {
        method: "POST",
        headers: {
          "x-acs-dingtalk-access-token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createBody),
      });

      if (!createResp.ok) {
        const text = await createResp.text();
        this.log?.error?.(`[CardReplier] Create failed: ${createResp.status} ${text}`);
        return null;
      }

      // Deliver card
      const isGroup = this.messageData.conversationType === "2";
      const deliverBody: Record<string, any> = {
        outTrackId,
        userIdType: 1,
      };

      if (isGroup) {
        deliverBody.openSpaceId = `dtv1.card//IM_GROUP.${this.messageData.conversationId}`;
        deliverBody.imGroupOpenDeliverModel = {
          // robotCode is the bot identifier, not the appKey
          robotCode: this.config.robotCode,
          atUserIds: atUsers ? { userIds: atUsers } : undefined,
        };
      } else {
        const userId = this.messageData.senderStaffId || this.messageData.senderId;
        deliverBody.openSpaceId = `dtv1.card//IM_ROBOT.${userId}`;
        deliverBody.imRobotOpenDeliverModel = { spaceType: "IM_ROBOT" };
      }

      const deliverResp = await fetch("https://api.dingtalk.com/v1.0/card/instances/deliver", {
        method: "POST",
        headers: {
          "x-acs-dingtalk-access-token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deliverBody),
      });

      if (!deliverResp.ok) {
        const text = await deliverResp.text();
        this.log?.error?.(`[CardReplier] Deliver failed: ${deliverResp.status} ${text}`);
        return null;
      }

      this.log?.info?.(`[CardReplier] Card sent: ${outTrackId}`);
      return outTrackId;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log?.error?.(`[CardReplier] Error: ${errMsg}`);
      return null;
    }
  }

  /**
   * Create and deliver a card (alias for createAndSendCard)
   */
  async createAndDeliverCard(
    templateId: string,
    cardData: Record<string, any>,
    atUsers?: string[],
  ): Promise<string | null> {
    return this.createAndSendCard(templateId, cardData, atUsers);
  }

  /**
   * Update card data by outTrackId
   */
  async putCardData(outTrackId: string, cardData: Record<string, any>): Promise<boolean> {
    try {
      const accessToken = await getAccessToken(this.config);

      const body = {
        outTrackId,
        cardData: {
          cardParamMap: cardData,
        },
      };

      const resp = await fetch("https://api.dingtalk.com/v1.0/card/instances", {
        method: "PUT",
        headers: {
          "x-acs-dingtalk-access-token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.log?.error?.(`[CardReplier] Update failed: ${resp.status} ${text}`);
        return false;
      }

      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log?.error?.(`[CardReplier] putCardData error: ${errMsg}`);
      return false;
    }
  }
}

/**
 * AI Card replier for streaming AI responses
 */
export class AICardReplier extends CardReplier {
  private card: AICardInstance | null = null;

  /**
   * Start the AI card (create and deliver)
   */
  async start(): Promise<boolean> {
    this.card = await createAICard(this.config, this.messageData, this.log);
    return this.card !== null;
  }

  /**
   * Stream content to the AI card
   * @param content Current accumulated content
   */
  async streaming(content: string): Promise<void> {
    if (!this.card) {
      this.log?.warn?.("[AICardReplier] Card not started, call start() first");
      return;
    }
    await streamAICard(this.card, content, false, this.log);
  }

  /**
   * Finish the AI card with final content
   * @param content Final content
   */
  async finish(content: string): Promise<void> {
    if (!this.card) {
      this.log?.warn?.("[AICardReplier] Card not started, call start() first");
      return;
    }
    await finishAICard(this.card, content, this.log);
  }

  /**
   * Mark the AI card as failed
   * @param errorMessage Error message to display
   */
  async fail(errorMessage: string): Promise<void> {
    if (!this.card) {
      this.log?.warn?.("[AICardReplier] Card not started, call start() first");
      return;
    }
    await failAICard(this.card, errorMessage, this.log);
  }

  /**
   * Get the underlying card instance
   */
  getCard(): AICardInstance | null {
    return this.card;
  }
}
