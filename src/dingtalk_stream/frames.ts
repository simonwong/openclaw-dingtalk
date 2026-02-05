export class Headers {
  static CONTENT_TYPE_APPLICATION_JSON = "application/json";

  messageId?: string;
  contentType?: string;
  topic?: string;
  extensions: Record<string, any> = {};

  toDict(): Record<string, any> {
    return {
      ...(this.messageId ? { messageId: this.messageId } : {}),
      ...(this.contentType ? { contentType: this.contentType } : {}),
      ...(this.topic ? { topic: this.topic } : {}),
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

  toDict(): Record<string, any> {
    return {
      code: this.code,
      headers: this.headers.toDict(),
      message: this.message,
      data: JSON.stringify(this.data ?? {}),
    };
  }
}
