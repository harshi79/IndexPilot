import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = await initDb();
    const conv = await d.get<{ id: number; title: string; created_at: number }>(
      "SELECT id, title, created_at FROM conversations WHERE id = ? AND user_id = ?",
      [Number(id), user.id]
    );
    if (!conv) return json({ error: "Conversation not found." }, 404);
    const msgs = await d.all<{
      id: number; role: string; content: string; meta: string; created_at: number;
    }>(
      "SELECT id, role, content, meta, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id",
      [conv.id]
    );
    return json({
      conversation: conv,
      messages: msgs.map((m) => {
        let tools: { name: string; summary: string; ok: boolean }[] = [];
        try {
          const parsed = JSON.parse(m.meta || "[]");
          if (Array.isArray(parsed)) tools = parsed;
        } catch {
          /* ignore */
        }
        return { id: m.id, role: m.role, content: m.content, tools, created_at: m.created_at };
      }),
    });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = await initDb();
    await d.run("DELETE FROM chat_messages WHERE conversation_id = ?", [Number(id)]);
    await d.run("DELETE FROM conversations WHERE id = ? AND user_id = ?", [Number(id), user.id]);
    return json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
