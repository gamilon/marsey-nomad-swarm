import { OllamaClient } from "./ollama.js";
import type { LlmClient } from "./types.js";

export type { ChatMessage, ChatOptions, LlmClient } from "./types.js";
export { LlmAbortedError, LlmTimeoutError, OllamaClient } from "./ollama.js";

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

/** Resolve LLM settings from env. Prefer LLM_*; fall back to OLLAMA_* aliases. */
export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? "ollama").toLowerCase();
  const baseUrl =
    env.LLM_BASE_URL ?? env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const model = env.LLM_MODEL ?? env.OLLAMA_MODEL ?? "llama3.1:8b";
  const timeoutMs = Math.max(1_000, Number(env.LLM_TIMEOUT_MS ?? "120000"));
  const maxRetries = Math.max(0, Number(env.LLM_MAX_RETRIES ?? "1"));
  return { provider, baseUrl, model, timeoutMs, maxRetries };
}

export function createLlmClient(config: LlmConfig = resolveLlmConfig()): LlmClient {
  switch (config.provider) {
    case "ollama":
      return new OllamaClient(
        config.baseUrl,
        config.model,
        config.timeoutMs,
        config.maxRetries,
      );
    default:
      throw new Error(
        `Unsupported LLM_PROVIDER="${config.provider}". Supported: ollama`,
      );
  }
}
