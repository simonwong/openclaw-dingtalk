export type StreamSubscription = { type: "CALLBACK" | "EVENT"; topic: string };

export type StreamOpenConnectionResponse = {
  endpoint: string;
  ticket: string;
  connectionId?: string;
};

export type StreamFrame = {
  specVersion?: string;
  type?: string;
  headers?: Record<string, any>;
  data?: any;
  [k: string]: any;
};

export type StreamInboundEnvelope = {
  headers: {
    messageId?: string;
    topic?: string;
    [k: string]: any;
  };
  data: string; // raw data string from frame.data
  raw: any; // full parsed frame
};
