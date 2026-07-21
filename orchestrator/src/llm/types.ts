export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClient {
  readonly modelId: string;
  chat(messages: ChatMessage[]): Promise<string>;
  healthy(): Promise<boolean>;
}
