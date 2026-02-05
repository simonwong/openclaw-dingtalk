export type StreamSubscription = { type: "CALLBACK" | "EVENT"; topic: string };

export type OpenConnectionResponse = {
  endpoint: string;
  ticket: string;
  connectionId?: string;
};

export type Headers = {
  messageId?: string;
  topic?: string;
  [k: string]: any;
};

export type CallbackListenerResult = {
  headers: Headers;
  data: string; // JSON string (payload)
};

export type RawFrame = {
  specVersion?: string;
  type?: "SYSTEM" | "EVENT" | "CALLBACK" | string;
  headers?: Record<string, any>;
  data?: any; // usually JSON string
  [k: string]: any;
};

export type AckParams = { success: boolean; error?: string; message?: string };
