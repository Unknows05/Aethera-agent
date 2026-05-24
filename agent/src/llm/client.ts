const OPENROUTER_API = "https://openrouter.ai/api/v1";

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  provider: {
    name: string;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ToolCall {
  name: string;
  arguments: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterClient {
  private apiKey: string;
  private model: string;
  private fallbackModels: string[];
  private temperature: number;
  private maxTokens: number;

  constructor(config: {
    apiKey: string;
    model?: string;
    fallbackModels?: string[];
    temperature?: number;
    maxTokens?: number;
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model || "deepseek/deepseek-chat";
    this.fallbackModels = config.fallbackModels || ["google/gemini-2.0-flash"];
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 512;
  }

  async fetchModels(): Promise<OpenRouterModel[]> {
    const res = await fetch(`${OPENROUTER_API}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.status}`);
    }

    const data = (await res.json()) as OpenRouterModelsResponse;
    return data.data;
  }

  async chat(
    messages: ChatMessage[],
    tools?: Array<{
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }>,
    modelOverride?: string,
  ): Promise<ChatCompletionResponse> {
    const model = modelOverride || this.model;

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/Unknows05/Aethera",
        "X-Title": "Aethera v2",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429 && this.fallbackModels.length > 0) {
        return this.chat(messages, tools, this.fallbackModels[0]);
      }
      throw new Error(`OpenRouter API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<ChatCompletionResponse>;
  }

  async testConnection(): Promise<{ success: boolean; modelCount: number; error?: string }> {
    try {
      const models = await this.fetchModels();
      return { success: true, modelCount: models.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, modelCount: 0, error: msg };
    }
  }

  async testModel(modelId: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://github.com/Unknows05/Aethera",
          "X-Title": "Aethera v2",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply with one word: ok" }],
          max_tokens: 10,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, latencyMs: Date.now() - start, error: `${res.status}: ${text}` };
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
