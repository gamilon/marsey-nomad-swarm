export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class OllamaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: "json",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama chat failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const content = data.message?.content;
    if (!content) {
      throw new Error("Ollama returned empty message content");
    }
    return content;
  }

  async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
