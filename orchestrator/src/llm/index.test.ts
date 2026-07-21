import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLlmClient, resolveLlmConfig } from "./index.js";
import { OllamaClient } from "./ollama.js";

describe("resolveLlmConfig", () => {
  it("defaults to ollama with localhost", () => {
    assert.deepEqual(resolveLlmConfig({}), {
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "llama3.1:8b",
    });
  });

  it("prefers LLM_* over OLLAMA_* aliases", () => {
    assert.deepEqual(
      resolveLlmConfig({
        LLM_PROVIDER: "ollama",
        LLM_BASE_URL: "http://llm:11434",
        LLM_MODEL: "mistral",
        OLLAMA_HOST: "http://ignored:1",
        OLLAMA_MODEL: "ignored",
      }),
      {
        provider: "ollama",
        baseUrl: "http://llm:11434",
        model: "mistral",
      },
    );
  });

  it("falls back to OLLAMA_* aliases", () => {
    assert.deepEqual(
      resolveLlmConfig({
        OLLAMA_HOST: "http://172.17.0.1:11434",
        OLLAMA_MODEL: "llama3.1:8b",
      }),
      {
        provider: "ollama",
        baseUrl: "http://172.17.0.1:11434",
        model: "llama3.1:8b",
      },
    );
  });
});

describe("createLlmClient", () => {
  it("returns an OllamaClient for ollama", () => {
    const client = createLlmClient({
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "llama3.1:8b",
    });
    assert.ok(client instanceof OllamaClient);
    assert.equal(client.modelId, "llama3.1:8b");
  });

  it("rejects unknown providers", () => {
    assert.throws(
      () =>
        createLlmClient({
          provider: "openai",
          baseUrl: "https://api.openai.com",
          model: "gpt-4o",
        }),
      /Unsupported LLM_PROVIDER/,
    );
  });
});
