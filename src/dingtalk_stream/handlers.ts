/**
 * DingTalk Stream Handlers
 *
 * Based on Python SDK: dingtalk-stream-sdk-python
 */

import type { Headers, EventMessage, SystemMessage } from "./frames.js";

/**
 * Result returned by handlers
 */
export interface HandlerResult {
  success: boolean;
  message?: string;
  data?: any;
}

/**
 * Base handler for callback messages
 */
export abstract class CallbackHandler {
  /**
   * Called before the stream client starts
   */
  preStart(): void {
    // Override in subclass if needed
  }

  /**
   * Process a callback message
   * @param headers Message headers
   * @param data Parsed message data
   * @returns Handler result
   */
  abstract process(headers: Headers, data: any): Promise<HandlerResult>;
}

/**
 * Base handler for event messages
 */
export abstract class EventHandler {
  /**
   * Called before the stream client starts
   */
  preStart(): void {
    // Override in subclass if needed
  }

  /**
   * Process an event message
   * @param event The event message
   * @returns Handler result
   */
  abstract process(event: EventMessage): Promise<HandlerResult>;
}

/**
 * Base handler for system messages
 */
export abstract class SystemHandler {
  /**
   * Called before the stream client starts
   */
  preStart(): void {
    // Override in subclass if needed
  }

  /**
   * Process a system message
   * @param message The system message
   * @returns Handler result
   */
  abstract process(message: SystemMessage): Promise<HandlerResult>;
}

/**
 * Chatbot message data structure
 */
export interface ChatbotMessageData {
  conversationId: string;
  chatbotCorpId?: string;
  chatbotUserId?: string;
  msgId?: string;
  senderNick?: string;
  isAdmin?: boolean;
  senderStaffId?: string;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
  createAt?: number;
  senderCorpId?: string;
  conversationType?: "1" | "2"; // 1=单聊, 2=群聊
  senderId?: string;
  content?: string;
  msgtype?: string;
  text?: { content?: string };
  isInAtList?: boolean;
  atUsers?: Array<{ dingtalkId?: string; staffId?: string }>;
  robotCode?: string;
}

/**
 * Reply options for chatbot
 */
export interface ChatbotReplyOptions {
  atSenderInTitle?: boolean;
}

/**
 * Chatbot handler - specialized callback handler for robot messages
 */
export abstract class ChatbotHandler extends CallbackHandler {
  protected sessionWebhook?: string;
  protected robotCode?: string;

  async process(headers: Headers, data: any): Promise<HandlerResult> {
    const msgData = data as ChatbotMessageData;
    this.sessionWebhook = msgData.sessionWebhook;
    this.robotCode = msgData.robotCode;

    return this.processMessage(headers, msgData);
  }

  /**
   * Process the chatbot message
   * @param headers Message headers
   * @param message Parsed chatbot message data
   */
  abstract processMessage(headers: Headers, message: ChatbotMessageData): Promise<HandlerResult>;

  /**
   * Reply with plain text
   */
  async replyText(content: string, options?: ChatbotReplyOptions): Promise<boolean> {
    if (!this.sessionWebhook) {
      return false;
    }

    try {
      const body: Record<string, any> = {
        msgtype: "text",
        text: { content },
      };

      if (options?.atSenderInTitle) {
        body.at = { isAtAll: false };
      }

      const response = await fetch(this.sessionWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Reply with markdown
   */
  async replyMarkdown(title: string, text: string, options?: ChatbotReplyOptions): Promise<boolean> {
    if (!this.sessionWebhook) {
      return false;
    }

    try {
      const body: Record<string, any> = {
        msgtype: "markdown",
        markdown: { title, text },
      };

      if (options?.atSenderInTitle) {
        body.at = { isAtAll: false };
      }

      const response = await fetch(this.sessionWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Reply with action card
   */
  async replyCard(
    title: string,
    text: string,
    buttons?: Array<{ title: string; actionURL: string }>,
    options?: ChatbotReplyOptions,
  ): Promise<boolean> {
    if (!this.sessionWebhook) {
      return false;
    }

    try {
      const body: Record<string, any> = {
        msgtype: "actionCard",
        actionCard: {
          title,
          text,
          btnOrientation: "0",
        },
      };

      if (buttons && buttons.length > 0) {
        body.actionCard.btns = buttons;
      }

      if (options?.atSenderInTitle) {
        body.at = { isAtAll: false };
      }

      const response = await fetch(this.sessionWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
