import type { ChatMessage, ChatOptions, LlmClient } from "./types.js";

export class LlmTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
    this.name = "LlmTimeoutError";
  }
}

export class LlmAbortedError extends Error {
  constructor(message = "LLM request aborted") {
    super(message);
    this.name = "LlmAbortedError";
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof LlmAbortedError) {
    return true;
  }
  if (err instanceof Error && err.name === "AbortError") {
    return true;
  }
  // Node fetch sometimes wraps aborts as TypeError with an AbortError cause.
  const cause = err instanceof Error ? err.cause : undefined;
  return cause instanceof Error && cause.name === "AbortError";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LlmAbortedError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new LlmAbortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class OllamaClient implements LlmClient {
  readonly modelId: string;

  constructor(
    private readonly baseUrl: string,
    model: string,
    private readonly timeoutMs: number = 120_000,
    private readonly maxRetries: number = 1,
  ) {
    this.modelId = model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const attempts = Math.max(1, this.maxRetries + 1);
    let lastErr: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.chatOnce(messages, options.signal);
      } catch (err) {
        lastErr = err;
        if (isAbortError(err) || err instanceof LlmTimeoutError) {
          throw err;
        }
        if (attempt >= attempts) {
          break;
        }
        await sleep(250 * attempt, options.signal);
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new Error(`LLM chat failed: ${String(lastErr)}`);
  }

  private async chatOnce(
    messages: ChatMessage[],
    outerSignal?: AbortSignal,
  ): Promise<string> {
    if (outerSignal?.aborted) {
      throw new LlmAbortedError();
    }

    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const onOuterAbort = (): void => controller.abort();
    outerSignal?.addEventListener("abort", onOuterAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelId,
          messages,
          stream: false,
          format: "json",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`LLM chat failed (${res.status}): ${body}`);
      }

      const data = (await res.json()) as {
        message?: { content?: string };
      };
      const content = data.message?.content;
      if (!content) {
        throw new Error("LLM returned empty message content");
      }
      return content;
    } catch (err) {
      if (isAbortError(err)) {
        if (outerSignal?.aborted) {
          throw new LlmAbortedError();
        }
        throw new LlmTimeoutError(this.timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }
  }

  async healthy(options: ChatOptions = {}): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5_000));
      const onOuterAbort = (): void => controller.abort();
      options.signal?.addEventListener("abort", onOuterAbort, { once: true });
      try {
        const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/tags`, {
          signal: controller.signal,
        });
        return res.ok;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onOuterAbort);
      }
    } catch {
      return false;
    }
  }
}
