import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConvRow {
  id: number;
  title: string;
  created_at: number;
  last_at: number | null;
  last_preview: string | null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const d = await initDb();
    const rows = await d.all<ConvRow>(
      `SELECT c.id, c.title, c.created_at,
              (SELECT MAX(cm.created_at) FROM chat_messages cm WHERE cm.conversation_id = c.id) AS last_at,
              (SELECT cm.content FROM chat_messages cm WHERE cm.conversation_id = c.id ORDER BY cm.id DESC LIMIT 1) AS last_preview
       FROM conversations c WHERE c.user_id = ? ORDER BY COALESCE(last_at, c.created_at) DESC LIMIT 50`,
      [user.id]
    );
    return json({
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        created_at: r.created_at,
        last_at: r.last_at,
        last_preview: (r.last_preview ?? "").slice(0, 120),
      })),
    });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
