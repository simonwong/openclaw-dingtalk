/**
 * Card Instance Classes for DingTalk
 *
 * Based on Python SDK: card_instance.py
 */

import type { DingTalkConfig } from "./types.js";
import { getAccessToken, AICardStatus, type AICardStatusType } from "./ai-card.js";

interface Logger {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
}

const DINGTALK_API = "https://api.dingtalk.com";

/**
 * Base card instance
 */
export abstract class CardInstance {
  protected config: DingTalkConfig;
  protected outTrackId: string;
  protected log?: Logger;

  constructor(config: DingTalkConfig, outTrackId: string, log?: Logger) {
    this.config = config;
    this.outTrackId = outTrackId;
    this.log = log;
  }

  /**
   * Update card data
   */
  protected async updateCard(cardParamMap: Record<string, any>): Promise<boolean> {
    try {
      const accessToken = await getAccessToken(this.config);

      const body = {
        outTrackId: this.outTrackId,
        cardData: {
          cardParamMap,
        },
      };

      const resp = await fetch(`${DINGTALK_API}/v1.0/card/instances`, {
        method: "PUT",
        headers: {
          "x-acs-dingtalk-access-token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.log?.error?.(`[CardInstance] Update failed: ${resp.status} ${text}`);
        return false;
      }

      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log?.error?.(`[CardInstance] Update error: ${errMsg}`);
      return false;
    }
  }

  getOutTrackId(): string {
    return this.outTrackId;
  }
}

/**
 * Markdown card instance
 */
export class MarkdownCardInstance extends CardInstance {
  /**
   * Update markdown content
   */
  async setMarkdown(content: string, title?: string): Promise<boolean> {
    const params: Record<string, any> = {
      msgContent: content,
    };
    if (title) {
      params.title = title;
    }
    return this.updateCard(params);
  }
}

/**
 * Markdown card with buttons
 */
export class MarkdownButtonCardInstance extends CardInstance {
  /**
   * Update markdown content with buttons
   */
  async setMarkdownWithButtons(
    content: string,
    buttons: Array<{ title: string; actionURL: string }>,
    title?: string,
  ): Promise<boolean> {
    const params: Record<string, any> = {
      msgContent: content,
      btns: JSON.stringify(buttons),
    };
    if (title) {
      params.title = title;
    }
    return this.updateCard(params);
  }
}

/**
 * AI Markdown card instance with streaming support
 */
export class AIMarkdownCardInstance extends CardInstance {
  private accessToken: string | null = null;
  private inputingStarted = false;

  /**
   * Get or refresh access token
   */
  private async getToken(): Promise<string> {
    if (!this.accessToken) {
      this.accessToken = await getAccessToken(this.config);
    }
    return this.accessToken;
  }

  /**
   * Start AI streaming (switch to INPUTING status)
   */
  async aiStart(): Promise<boolean> {
    try {
      const token = await this.getToken();

      const statusBody = {
        outTrackId: this.outTrackId,
        cardData: {
          cardParamMap: {
            flowStatus: AICardStatus.INPUTING,
            msgContent: "",
            staticMsgContent: "",
            sys_full_json_obj: JSON.stringify({
              order: ["msgContent"],
            }),
          },
        },
      };

      this.log?.info?.(`[AIMarkdownCardInstance] Starting INPUTING for ${this.outTrackId}`);

      const resp = await fetch(`${DINGTALK_API}/v1.0/card/instances`, {
        method: "PUT",
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(statusBody),
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.log?.error?.(`[AIMarkdownCardInstance] INPUTING failed: ${resp.status} ${text}`);
        return false;
      }

      this.inputingStarted = true;
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log?.error?.(`[AIMarkdownCardInstance] aiStart error: ${errMsg}`);
      return false;
    }
  }

  /**
   * Stream content update
   * @param content Current accumulated content
   * @param isFinalize Whether this is the final update
   */
  async aiStreaming(content: string, isFinalize = false): Promise<boolean> {
    if (!this.inputingStarted) {
      const started = await this.aiStart();
      if (!started) return false;
    }

    try {
      const token = await this.getToken();

      const body = {
        outTrackId: this.outTrackId,
        guid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        key: "msgContent",
        content,
        isFull: true,
        isFinalize,
        isError: false,
      };

      const resp = await fetch(`${DINGTALK_API}/v1.0/card/streaming`, {
        method: "PUT",
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.log?.error?.(`[AIMarkdownCardInstance] Streaming failed: ${resp.status} ${text}`);
        return false;
      }

      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log?.error?.(`[AIMarkdownCardInstance] aiStreaming error: ${errMsg}`);
      return false;
    }
  }

  /**
   * Finish streaming with final content
   */
  async aiFinish(content: string): Promise<boolean> {
    // Send final streaming update
    await this.aiStreaming(content, true);

    // Update status to FINISHED
    try {
      const token = await this.getToken();

      const body = {
        outTrackId: this.outTrackId,
        cardData: {
          cardParamMap: {
            flowStatus: AICardStatus.FINISHED,
            msgContent: content,
            staticMsgContent: "",
            sys_full_json_obj: JSON.stringify({
              order: ["msgContent"],
            }),
          },
        },
      };

      const resp = await fetch(`${DINGTALK_API}/v1.0/card/instances`, {
        method: "PUT",
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.log?.error?.(`[AIMarkdownCardInstance] FINISHED failed: ${resp.status} ${text}`);
        return false;
      }

      this.log?.info?.(`[AIMarkdownCardInstance] Finished ${this.outTrackId}`);
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log?.error?.(`[AIMarkdownCardInstance] aiFinish error: ${errMsg}`);
      return false;
    }
  }

  /**
   * Mark card as failed
   */
  async aiFail(errorMessage: string): Promise<boolean> {
    try {
      const token = await this.getToken();

      const body = {
        outTrackId: this.outTrackId,
        cardData: {
          cardParamMap: {
            flowStatus: AICardStatus.FAILED,
            msgContent: `Error: ${errorMessage}`,
            staticMsgContent: "",
            sys_full_json_obj: JSON.stringify({
              order: ["msgContent"],
            }),
          },
        },
      };

      const resp = await fetch(`${DINGTALK_API}/v1.0/card/instances`, {
        method: "PUT",
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        this.log?.error?.(`[AIMarkdownCardInstance] FAILED update failed: ${resp.status} ${text}`);
        return false;
      }

      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log?.error?.(`[AIMarkdownCardInstance] aiFail error: ${errMsg}`);
      return false;
    }
  }
}
