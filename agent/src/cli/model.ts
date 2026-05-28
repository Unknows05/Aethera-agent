import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, saveConfig } from "../config/index.js";
import { OpenRouterClient } from "../llm/client.js";

const MODEL_CHOICES = [
  { value: "google/gemini-2.0-flash", label: "google/gemini-2.0-flash — ★ Fast & free", hint: "FREE ✅tools" },
  { value: "meta-llama/llama-3.1-8b-instruct", label: "meta-llama/llama-3.1-8b-instruct — Free", hint: "FREE ✅tools" },
  { value: "google/gemma-2-27b-it", label: "google/gemma-2-27b-it — Lightweight", hint: "FREE ✅tools" },
  { value: "mistralai/mistral-7b-instruct", label: "mistralai/mistral-7b-instruct", hint: "FREE ✅tools" },
  { value: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat — ★ Best value", hint: "$0.14/M ✅tools" },
  { value: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini — Fast & cheap", hint: "$0.15/M ✅tools" },
  { value: "cohere/command-r-plus", label: "cohere/command-r-plus — Good RAG", hint: "$?/M ✅tools" },
  { value: "openai/gpt-4o", label: "openai/gpt-4o — Best overall", hint: "$2.50/M ✅tools" },
  { value: "anthropic/claude-3.5-haiku", label: "anthropic/claude-3.5-haiku — Fast reasoning", hint: "$0.80/M ✅tools" },
  { value: "anthropic/claude-sonnet", label: "anthropic/claude-sonnet — Strong reasoning", hint: "$3.00/M ✅tools" },
  { value: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "nvidia/nemotron-3-nano-omni (NO tools)", hint: "FREE ⚠️JSON" },
  { value: "__browse__", label: "Browse all models from OpenRouter...", hint: "fetch live" },
  { value: "__custom__", label: "Type custom model ID...", hint: "" },
];

async function fetchAndPick(client: OpenRouterClient, label: string): Promise<string | null> {
  const s = p.spinner();
  s.start("Fetching models from OpenRouter...");
  try {
    const models = await client.fetchModels();
    const choices = models
      .map((m) => ({
        value: m.id,
        label: `${m.id} ($${(Number(m.pricing.prompt) * 1e6).toFixed(2)}/M)${m.id.includes("free") ? " FREE" : ""}`,
        hint: m.id.includes("free") ? "FREE" : `$${(Number(m.pricing.prompt) * 1e6).toFixed(2)}/M`,
      }))
      .sort((a, b) => (a.hint === "FREE" ? -1 : b.hint === "FREE" ? 1 : 0));
    s.stop(pc.green(`✓ ${choices.length} models loaded`));

    const raw = await p.select({ message: label, options: choices });
    if (p.isCancel(raw)) { p.cancel("Cancelled."); process.exit(0); }
    return raw as string;
  } catch (e) {
    s.stop(pc.red(`✗ Failed to fetch: ${e instanceof Error ? e.message : String(e)}`));
    return null;
  }
}

async function pickModel(client: OpenRouterClient | null, label: string): Promise<string> {
  while (true) {
    const raw = await p.select({ message: label, options: MODEL_CHOICES });
    if (p.isCancel(raw)) { p.cancel("Cancelled."); process.exit(0); }

    let model = raw as string;
    if (model === "__browse__") {
      if (!client) {
        p.log.error("No OpenRouter connection available. Pick from list.");
        continue;
      }
      const fetched = await fetchAndPick(client, label);
      if (fetched) model = fetched;
      else continue;
    } else if (model === "__custom__") {
      const custom = await p.text({ message: "Enter model ID:", validate: (val) => (!val ? "Model ID wajib diisi" : undefined) });
      if (p.isCancel(custom)) process.exit(0);
      model = custom as string;
    }

    if (client) {
      const s = p.spinner();
      s.start(`Testing ${model}...`);
      const test = await client.testModel(model);
      if (test.ok) {
        s.stop(pc.green(`✓ ${model} responded in ${test.latencyMs}ms`));
        return model;
      }
      s.stop(pc.yellow(`⚠ ${model}: ${test.error || "no response"}`));
      const action = await p.select({
        message: "What now?",
        options: [
          { value: "retry", label: "Try again" },
          { value: "change", label: "Pick a different model" },
          { value: "skip", label: "Skip test, continue anyway" },
        ],
      });
      if (action === "retry") continue;
      if (action === "skip") return model;
    } else {
      return model;
    }
  }
}

export async function changeModel(): Promise<void> {
  console.clear();
  p.intro(pc.bgCyan(pc.black("  Aethera — Change Model  ")));

  const cfg = loadConfig();
  if (!cfg.openrouter?.apiKey) {
    p.log.error("No OpenRouter config found. Run 'aethera init' first.");
    p.outro("Done!");
    return;
  }

  const client = new OpenRouterClient({ apiKey: cfg.openrouter.apiKey });

  p.log.step(`Current primary: ${pc.cyan(cfg.openrouter.primary || "none")}`);

  const selected = await pickModel(client, "Select new primary model:");
  cfg.openrouter.primary = selected;
  saveConfig(cfg);

  p.log.success(pc.green(`✓ Primary model changed to ${selected}`));
  p.outro("Done!");
}
