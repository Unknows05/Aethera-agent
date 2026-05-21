# 4 — LLM Module (OpenRouter)

Client untuk OpenRouter API dengan support 200+ model, function calling, dan auto-fallback.

## File

```
src/llm/client.ts
```

## Design

```ts
export class OpenRouterClient {
  constructor(private config: {
    apiKey: string;
    model?: string;          // default: deepseek/deepseek-chat
    fallbackModels?: string[]; // default: [google/gemini-2.0-flash]
    temperature?: number;
    maxTokens?: number;
  }) {}
}
```

## Key Features

### 1. Dynamic Model Fetch

```ts
async fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${this.config.apiKey}` },
  });
  const { data } = await res.json();
  return data; // 200+ models with pricing, context length
}
```

### 2. Chat Completion + Function Calling

```ts
async chat(
  messages: Message[],
  tools?: ToolDefinition[],
  retries = 0,
): Promise<LLMResponse> {
  const model = retries > 0
    ? this.config.fallbackModels[retries - 1] || this.config.model
    : this.config.model;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: this.config.temperature,
    max_tokens: this.config.maxTokens,
  };
  if (tools) body.tools = tools;

  const res = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  // Handle 429 (rate limit) → auto fallback
  if (res.status === 429 && retries < this.config.fallbackModels.length) {
    await sleep(1000);
    return this.chat(messages, tools, retries + 1);
  }

  return res.json();
}
```

### 3. Multi-tier Routing

| Tier | Model | Cost | Use Case |
|------|-------|------|----------|
| **Hunter** | `deepseek/deepseek-chat` | $0.14/M | Primary trading decisions |
| **Healer** | `google/gemini-2.0-flash` | Free | Position management |
| **Curator** | `anthropic/claude-3-haiku` | $0.25/M | Skill curation (if configured) |

### 4. Test Connection

```ts
async testConnection(): Promise<{ success: boolean; modelCount?: number; error?: string }> {
  try {
    const models = await this.fetchModels();
    return { success: true, modelCount: models.length };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
```

## Key Gotchas
- **OpenRouter headers**: Wajib kirim `Authorization: Bearer <api_key>`
- **429 handling**: Rate limit → sleep 1s → fallback model
- **Tool calls**: Parse dari `response.choices[0].message.tool_calls`
- **No streaming**: Gunakan response penuh untuk simplicity
