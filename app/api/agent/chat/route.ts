import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getUserById } from "@/lib/auth";
import { runAgent, type AgentEvent, type ProviderChoice } from "@/lib/agent/loop";
import { PROVIDER_IDS, type ProviderId } from "@/lib/ai/models";
import type { Account } from "@/lib/mail/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface HistoryRow {
  role: string;
  content: string;
}

interface StoredAccount {
  id: number; user_id: number; kind: string; provider: string; email: string;
  label: string | null; access_token: string | null; refresh_token: string | null;
  token_expiry: number | null; client_id: string | null; client_secret: string | null;
  extra: string; created_at: number;
}

async function resolveProvider(
  userId: number,
  requested?: { id?: string; model?: string }
): Promise<ProviderChoice | null> {
  const d = await initDb();
  let profileDefault: { provider?: string; model?: string } = {};
  try {
    const p = await d.get<{ appearance: string }>("SELECT appearance FROM profiles WHERE user_id = ?", [userId]);
    const parsed = JSON.parse(p?.appearance || "{}");
    profileDefault = parsed.agent ?? {};
  } catch {
    /* ignore */
  }
  const wantId = (requested?.id || profileDefault.provider || "") as string;
  const rows = await d.all<{
    provider: string; api_key: string; base_url: string | null; default_model: string | null; enabled: number;
  }>(
    "SELECT provider, api_key, base_url, default_model, enabled FROM providers WHERE user_id = ? AND enabled = 1",
    [userId]
  );
  let row = rows.find((r) => r.provider === wantId);
  if (!row && rows.length > 0) row = rows[0];
  if (!row || !row.api_key) return null;
  if (!PROVIDER_IDS.includes(row.provider as ProviderId)) return null;
  return {
    id: row.provider as ProviderId,
    apiKey: row.api_key,
    baseUrl: row.base_url ?? undefined,
    model: requested?.model || profileDefault.model || row.default_model || "auto",
  };
}

function sse(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: Request) {
  let userId: number;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    return new Response(sse({ type: "error", text: "Not signed in." }), {
      headers: { "Content-Type": "text/event-stream" },
      status: 401,
    });
  }

  let body: { conversation_id?: number; message?: string; provider?: { id?: string; model?: string } };
  try {
    body = await req.json();
  } catch {
    return new Response(sse({ type: "error", text: "Invalid request." }), {
      headers: { "Content-Type": "text/event-stream" },
      status: 400,
    });
  }
  const message = (body.message || "").trim();
  if (!message) {
    return new Response(sse({ type: "error", text: "Message is empty." }), {
      headers: { "Content-Type": "text/event-stream" },
      status: 400,
    });
  }

  const d = await initDb();
  const full = await getUserById(userId);
  const accountsRows = await d.all<StoredAccount>(
    "SELECT * FROM accounts WHERE user_id = ? ORDER BY id",
    [userId]
  );

  let conversationId = body.conversation_id;
  if (!conversationId) {
    const title = message.length > 42 ? `${message.slice(0, 42)}…` : message;
    const ins = await d.run(
      "INSERT INTO conversations (user_id, title, created_at) VALUES (?, ?, ?)",
      [userId, title, Date.now()]
    );
    conversationId = ins.lastInsertRowid;
  } else {
    const exists = await d.get("SELECT id FROM conversations WHERE id = ? AND user_id = ?", [
      conversationId,
      userId,
    ]);
    if (!exists) conversationId = undefined;
  }
  if (!conversationId) {
    const ins = await d.run(
      "INSERT INTO conversations (user_id, title, created_at) VALUES (?, ?, ?)",
      [userId, message.slice(0, 42), Date.now()]
    );
    conversationId = ins.lastInsertRowid;
  }

  const history = await d.all<HistoryRow>(
    "SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 12",
    [conversationId]
  );
  const historyRev = history.reverse();

  await d.run(
    "INSERT INTO chat_messages (conversation_id, role, content, meta, created_at) VALUES (?, 'user', ?, '[]', ?)",
    [conversationId, message, Date.now()]
  );

  const provider = await resolveProvider(userId, body.provider);
  const toolEvents: { name: string; summary: string; ok: boolean }[] = [];
  let assistantText = "";

  const encoder = new TextEncoder();
  const aborter = new AbortController();
  if (req.signal) {
    if (req.signal.aborted) aborter.abort();
    else req.signal.addEventListener("abort", () => aborter.abort(), { once: true });
  }
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(sse(obj)));
        } catch {
          /* closed */
        }
      };
      send({ type: "conversation", id: conversationId, model: provider ? provider.model : "indexpilot-demo" });
      const emit = (e: AgentEvent) => {
        if (e.type === "delta" && e.text) {
          assistantText += e.text;
          send({ type: "delta", text: e.text });
        } else if (e.type === "tool_start" && e.call) {
          send({ type: "tool_start", id: e.call.id, name: e.call.name, args: e.call.args });
        } else if (e.type === "tool_done" && e.call && e.outcome) {
          toolEvents.push({ name: e.call.name, summary: e.outcome.summary, ok: e.outcome.ok });
          send({
            type: "tool_done",
            id: e.call.id,
            name: e.call.name,
            ok: e.outcome.ok,
            summary: e.outcome.summary,
            error: e.outcome.error ?? null,
          });
        } else if (e.type === "error") {
          send({ type: "error", text: e.text });
        }
      };

      let modelLabel = provider ? provider.model : "indexpilot-demo";
      try {
        const text = await runAgent(
          {
            userId,
            user: { name: full?.display_name ?? null, email: full?.email ?? "" },
            accounts: accountsRows as unknown as Account[],
            history: historyRev.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
            userText: message,
            provider,
            signal: aborter.signal,
          },
          emit
        );
        if (text && !assistantText) {
          assistantText = text;
          send({ type: "delta", text });
        }
        modelLabel = provider ? `${provider.id}/${provider.model}` : "indexpilot-demo";
      } catch {
        /* error event already emitted */
      }

      await d.run(
        "INSERT INTO chat_messages (conversation_id, role, content, meta, created_at) VALUES (?, 'assistant', ?, ?, ?)",
        [conversationId, assistantText || "(no response)", JSON.stringify(toolEvents), Date.now()]
      );
      send({ type: "done", content: assistantText, model: modelLabel });
      controller.close();
    },
    cancel() {
      aborter.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
