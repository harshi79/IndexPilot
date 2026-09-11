import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      display_name?: string | null;
      appearance?: Record<string, unknown>;
    };
    const d = await initDb();
    if (body.display_name !== undefined) {
      const name = (body.display_name || "").trim().slice(0, 60) || null;
      await d.run(
        `INSERT INTO profiles (user_id, display_name, appearance, created_at) VALUES (?, ?, '{}', ?)
         ON CONFLICT (user_id) DO UPDATE SET display_name = excluded.display_name`,
        [user.id, name, Date.now()]
      );
    }
    if (body.appearance !== undefined && typeof body.appearance === "object") {
      await d.run(
        `INSERT INTO profiles (user_id, display_name, appearance, created_at) VALUES (?, NULL, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET appearance = excluded.appearance`,
        [user.id, JSON.stringify(body.appearance), Date.now()]
      );
    }
    return json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
