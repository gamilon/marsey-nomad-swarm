export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  signal?: AbortSignal;
}

export interface LlmClient {
  readonly modelId: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  healthy(options?: ChatOptions): Promise<boolean>;
}
