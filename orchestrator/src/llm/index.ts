import { OllamaClient } from "./ollama.js";
import type { LlmClient } from "./types.js";

export type { ChatMessage, LlmClient } from "./types.js";
export { OllamaClient } from "./ollama.js";

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
}

/** Resolve LLM settings from env. Prefer LLM_*; fall back to OLLAMA_* aliases. */
export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? "ollama").toLowerCase();
  const baseUrl =
    env.LLM_BASE_URL ?? env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const model = env.LLM_MODEL ?? env.OLLAMA_MODEL ?? "llama3.1:8b";
  return { provider, baseUrl, model };
}

export function createLlmClient(config: LlmConfig = resolveLlmConfig()): LlmClient {
  switch (config.provider) {
    case "ollama":
      return new OllamaClient(config.baseUrl, config.model);
    default:
      throw new Error(
        `Unsupported LLM_PROVIDER="${config.provider}". Supported: ollama`,
      );
  }
}
