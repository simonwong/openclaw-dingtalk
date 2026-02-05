export class Headers {
  static CONTENT_TYPE_APPLICATION_JSON = "application/json";

  appId?: string;
  connectionId?: string;
  contentType?: string;
  messageId?: string;
  time?: string;
  topic?: string;
  extensions: Record<string, any> = {};

  toDict(): Record<string, any> {
    return {
      ...(this.appId ? { appId: this.appId } : {}),
      ...(this.connectionId ? { connectionId: this.connectionId } : {}),
      ...(this.contentType ? { contentType: this.contentType } : {}),
      ...(this.messageId ? { messageId: this.messageId } : {}),
      ...(this.topic ? { topic: this.topic } : {}),
      ...(this.time ? { time: String(this.time) } : {}),
      ...this.extensions,
    };
  }

  static fromDict(d: Record<string, any>): Headers {
    const h = new Headers();
    for (const [k, v] of Object.entries(d ?? {})) {
      if (k === "appId") h.appId = String(v);
      else if (k === "connectionId") h.connectionId = String(v);
      else if (k === "contentType") h.contentType = String(v);
      else if (k === "messageId") h.messageId = String(v);
      else if (k === "topic") h.topic = String(v);
      else if (k === "time") h.time = String(v);
      else h.extensions[k] = v;
    }
    return h;
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

  toDict(): Record<string, any> {
    return {
      code: this.code,
      headers: this.headers.toDict(),
      message: this.message,
      data: JSON.stringify(this.data ?? {}),
    };
  }
}
