import type { ProviderMeta } from "./models";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onToolCall: (call: ToolCall) => void;
}

export interface ChatResult {
  assistant: { content: string; toolCalls: ToolCall[] };
  finishReason: string;
}

interface Opts {
  provider: ProviderMeta;
  apiKey: string;
  model: string;
  baseUrl?: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  signal?: AbortSignal;
}

async function readSse(
  res: Response,
  onData: (json: any) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        onData(JSON.parse(payload));
      } catch {
        /* partial/keepalive line — ignore */
      }
    }
  }
}

function fail(res: Response, text: string): Error {
  let detail = text.slice(0, 500);
  try {
    const j = JSON.parse(text);
    detail = j?.error?.message || j?.error?.status || j?.message || text.slice(0, 500);
  } catch {
    /* keep raw */
  }
  return new Error(`Provider error ${res.status}: ${detail}`);
}

async function streamOpenAICompatible(o: Opts, ev: StreamHandlers): Promise<ChatResult> {
  const base = (o.baseUrl || o.provider.baseUrl).replace(/\/+$/, "");
  const body: Record<string, unknown> = {
    model: o.model,
    messages: o.messages.map((m) => {
      if (m.role === "tool")
        return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
      if (m.role === "assistant" && m.tool_calls?.length)
        return { role: "assistant", content: m.content || null, tool_calls: m.tool_calls };
      return { role: m.role, content: m.content };
    }),
    stream: true,
  };
  if (o.tools.length) body.tools = o.tools;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${o.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: o.signal,
  });
  if (!res.ok) throw fail(res, await res.text());

  const toolCalls: ToolCall[] = [];
  const byIndex = new Map<number, { id: string; name: string; args: string }>();
  let content = "";
  let finishReason = "stop";

  await readSse(res, (chunk) => {
    const choice = chunk?.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta;
    if (!delta) return;
    if (delta.content) {
      content += delta.content;
      ev.onDelta(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0;
        const acc = byIndex.get(i) ?? { id: "", name: "", args: "" };
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name += tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
        byIndex.set(i, acc);
      }
    }
  });

  for (const [i, acc] of [...byIndex.entries()].sort((a, b) => a[0] - b[0])) {
    if (!acc.name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(acc.args || "{}");
    } catch {
      args = { _raw: acc.args };
    }
    const call: ToolCall = { id: acc.id || `call_${i}_${Math.random().toString(36).slice(2, 8)}`, name: acc.name, args };
    toolCalls.push(call);
    ev.onToolCall(call);
  }
  return { assistant: { content, toolCalls }, finishReason };
}

async function streamGemini(o: Opts, ev: StreamHandlers): Promise<ChatResult> {
  const base = (o.baseUrl || o.provider.baseUrl).replace(/\/+$/, "");
  const sys = o.messages.find((m) => m.role === "system")?.content ?? "";
  const contents: any[] = [];
  for (const m of o.messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name, response: { content: m.content } } }],
      });
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      contents.push({
        role: "model",
        parts: m.tool_calls.map((tc) => ({
          functionCall: { name: tc.name, args: tc.args },
        })),
      });
    } else {
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
    }
  }
  const body: Record<string, unknown> = { contents, generationConfig: { temperature: 0.4 } };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (o.tools.length) {
    body.tools = [
      {
        functionDeclarations: o.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  const url = `${base}/models/${encodeURIComponent(o.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(o.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: o.signal,
  });
  if (!res.ok) throw fail(res, await res.text());

  const toolCalls: ToolCall[] = [];
  let content = "";
  let finishReason = "stop";

  await readSse(res, (chunk) => {
    const cand = chunk?.candidates?.[0];
    if (!cand) return;
    if (cand.finishReason) finishReason = cand.finishReason.toLowerCase();
    for (const part of cand?.content?.parts ?? []) {
      if (typeof part?.text === "string" && part.text) {
        content += part.text;
        ev.onDelta(part.text);
      }
      if (part?.functionCall?.name) {
        const call: ToolCall = {
          id: `gcall_${toolCalls.length}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
        };
        toolCalls.push(call);
        ev.onToolCall(call);
      }
    }
  });

  return { assistant: { content, toolCalls }, finishReason };
}

export async function streamChat(o: Opts, ev: StreamHandlers): Promise<ChatResult> {
  if (o.provider.protocol === "gemini") return streamGemini(o, ev);
  return streamOpenAICompatible(o, ev);
}
