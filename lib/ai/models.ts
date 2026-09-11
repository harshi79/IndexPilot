export type ProviderId = "openai" | "gemini" | "openrouter" | "groq" | "nvidia";

export interface ModelInfo {
  id: string;
  name: string;
  tags: ("free" | "free tier" | "paid" | "fast" | "strong")[];
  note?: string;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  short: string;
  baseUrl: string;
  protocol: "openai" | "gemini";
  keyUrl: string;
  models: ModelInfo[];
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    short: "oai",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-5.1", name: "GPT-5.1", tags: ["strong"], note: "Best reasoning" },
      { id: "gpt-5.1-mini", name: "GPT-5.1 mini", tags: ["fast"], note: "Fast, cheap" },
      { id: "gpt-4.1", name: "GPT-4.1", tags: ["strong"] },
      { id: "gpt-4o-mini", name: "GPT-4o mini", tags: ["fast"] },
    ],
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    short: "gem",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    protocol: "gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tags: ["strong"] },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tags: ["fast", "free tier"] },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", tags: ["fast", "free tier"] },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", tags: ["fast", "free tier"] },
    ],
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    short: "oai",
    baseUrl: "https://openrouter.ai/api/v1",
    protocol: "openai",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", tags: ["strong"] },
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", tags: ["fast"] },
      { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", tags: ["fast"] },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", tags: ["free"] },
      { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (free)", tags: ["free"] },
      { id: "qwen/qwen3-235b-a22b:free", name: "Qwen3 235B", tags: ["free"] },
    ],
  },
  groq: {
    id: "groq",
    name: "Groq",
    short: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    protocol: "openai",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", tags: ["fast", "free tier"] },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", tags: ["fast", "free tier"] },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout", tags: ["fast"] },
      { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 70B", tags: ["strong"] },
    ],
  },
  nvidia: {
    id: "nvidia",
    name: "NVIDIA NIM",
    short: "nv",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    protocol: "openai",
    keyUrl: "https://build.nvidia.com/api-keys",
    models: [
      { id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B", tags: ["fast", "free"] , note: "Free credits"},
      { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B", tags: ["fast", "free"], note: "Free credits" },
      { id: "nvidia/llama-3.3-nemotron-super-49b", name: "Nemotron Super 49B", tags: ["strong", "free"], note: "Free credits" },
      { id: "mistralai/mixtral-8x7b-instruct-v01", name: "Mixtral 8x7B", tags: ["fast"] },
    ],
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function providerMeta(id: string): ProviderMeta | undefined {
  return PROVIDERS[id as ProviderId];
}

/** Fetch live model lists (OpenAI-compatible /models endpoint). */
export async function fetchLiveModels(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string
): Promise<ModelInfo[]> {
  const meta = PROVIDERS[provider];
  const base = (baseUrl || meta.baseUrl).replace(/\/+$/, "");
  try {
    const res =
      meta.protocol === "openai"
        ? await fetch(`${base}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
        : await fetch(`${base}/models`, {
            headers: { "x-goog-api-key": apiKey },
          });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] };
    const ids = (data.data ?? data.models ?? []).map((m) => m.id ?? m.name).filter((v): v is string => Boolean(v));
    const known = new Map(meta.models.map((m) => [m.id, m]));
    const live: ModelInfo[] = ids
      .filter((id) => !/\/|^models\//.test(String(id)) || meta.id === "openrouter")
      .map((id) => {
        const s = String(id);
        const knownModel = known.get(s);
        if (knownModel) return knownModel;
        const tags: ModelInfo["tags"] = s.includes(":free") || /free/i.test(s)
          ? ["free"]
          : ["paid"];
        return { id: s, name: s, tags };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    return live.length > 0 ? live : meta.models;
  } catch {
    return meta.models;
  }
}
