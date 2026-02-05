/**
 * DingTalk Stream Message Frames
 *
 * Based on Python SDK: dingtalk-stream-sdk-python
 */

export class Headers {
  static CONTENT_TYPE_APPLICATION_JSON = "application/json";

  messageId?: string;
  contentType?: string;
  topic?: string;
  appId?: string;
  connectionId?: string;
  time?: string;
  eventType?: string;
  eventBornTime?: string;
  eventCorpId?: string;
  eventId?: string;
  extensions: Record<string, any> = {};

  static fromDict(data: Record<string, any>): Headers {
    const h = new Headers();
    h.messageId = data.messageId;
    h.contentType = data.contentType;
    h.topic = data.topic;
    h.appId = data.appId;
    h.connectionId = data.connectionId;
    h.time = data.time;
    h.eventType = data.eventType;
    h.eventBornTime = data.eventBornTime;
    h.eventCorpId = data.eventCorpId;
    h.eventId = data.eventId;
    // Copy remaining fields to extensions
    const knownKeys = new Set([
      "messageId",
      "contentType",
      "topic",
      "appId",
      "connectionId",
      "time",
      "eventType",
      "eventBornTime",
      "eventCorpId",
      "eventId",
    ]);
    for (const [key, value] of Object.entries(data)) {
      if (!knownKeys.has(key)) {
        h.extensions[key] = value;
      }
    }
    return h;
  }

  toDict(): Record<string, any> {
    return {
      ...(this.messageId ? { messageId: this.messageId } : {}),
      ...(this.contentType ? { contentType: this.contentType } : {}),
      ...(this.topic ? { topic: this.topic } : {}),
      ...(this.appId ? { appId: this.appId } : {}),
      ...(this.connectionId ? { connectionId: this.connectionId } : {}),
      ...(this.time ? { time: this.time } : {}),
      ...(this.eventType ? { eventType: this.eventType } : {}),
      ...(this.eventBornTime ? { eventBornTime: this.eventBornTime } : {}),
      ...(this.eventCorpId ? { eventCorpId: this.eventCorpId } : {}),
      ...(this.eventId ? { eventId: this.eventId } : {}),
      ...this.extensions,
    };
  }
}

export class AckMessage {
  static STATUS_OK = 200;
  static STATUS_BAD_REQUEST = 400;
  static STATUS_NOT_IMPLEMENT = 404;
  static STATUS_SYSTEM_EXCEPTION = 500;

  code = AckMessage.STATUS_OK;
  headers = new Headers();
  message = "";
  data: any = {};

  static fromDict(data: Record<string, any>): AckMessage {
    const ack = new AckMessage();
    ack.code = data.code ?? AckMessage.STATUS_OK;
    if (data.headers) {
      ack.headers = Headers.fromDict(data.headers);
    }
    ack.message = data.message ?? "";
    ack.data = data.data ?? {};
    return ack;
  }

  toDict(): Record<string, any> {
    return {
      code: this.code,
      headers: this.headers.toDict(),
      message: this.message,
      data: JSON.stringify(this.data ?? {}),
    };
  }
}

/**
 * Event message from DingTalk Stream
 */
export class EventMessage {
  specVersion?: string;
  type?: string;
  headers: Headers = new Headers();
  data: any = {};

  static fromDict(data: Record<string, any>): EventMessage {
    const msg = new EventMessage();
    msg.specVersion = data.specVersion;
    msg.type = data.type;
    if (data.headers) {
      msg.headers = Headers.fromDict(data.headers);
    }
    // Parse data if it's a JSON string
    if (typeof data.data === "string") {
      try {
        msg.data = JSON.parse(data.data);
      } catch {
        msg.data = data.data;
      }
    } else {
      msg.data = data.data ?? {};
    }
    return msg;
  }

  toDict(): Record<string, any> {
    return {
      specVersion: this.specVersion,
      type: this.type,
      headers: this.headers.toDict(),
      data: this.data,
    };
  }
}

/**
 * Callback message from DingTalk Stream
 */
export class CallbackMessage {
  specVersion?: string;
  type?: string;
  headers: Headers = new Headers();
  data: any = {};

  static fromDict(data: Record<string, any>): CallbackMessage {
    const msg = new CallbackMessage();
    msg.specVersion = data.specVersion;
    msg.type = data.type;
    if (data.headers) {
      msg.headers = Headers.fromDict(data.headers);
    }
    // Parse data if it's a JSON string
    if (typeof data.data === "string") {
      try {
        msg.data = JSON.parse(data.data);
      } catch {
        msg.data = data.data;
      }
    } else {
      msg.data = data.data ?? {};
    }
    return msg;
  }

  toDict(): Record<string, any> {
    return {
      specVersion: this.specVersion,
      type: this.type,
      headers: this.headers.toDict(),
      data: this.data,
    };
  }
}

/**
 * System message from DingTalk Stream
 */
export class SystemMessage {
  static TOPIC_DISCONNECT = "disconnect";
  static TOPIC_PING = "ping";

  specVersion?: string;
  type?: string;
  headers: Headers = new Headers();
  data: any = {};

  static fromDict(data: Record<string, any>): SystemMessage {
    const msg = new SystemMessage();
    msg.specVersion = data.specVersion;
    msg.type = data.type;
    if (data.headers) {
      msg.headers = Headers.fromDict(data.headers);
    }
    // Parse data if it's a JSON string
    if (typeof data.data === "string") {
      try {
        msg.data = JSON.parse(data.data);
      } catch {
        msg.data = data.data;
      }
    } else {
      msg.data = data.data ?? {};
    }
    return msg;
  }

  toDict(): Record<string, any> {
    return {
      specVersion: this.specVersion,
      type: this.type,
      headers: this.headers.toDict(),
      data: this.data,
    };
  }
}
