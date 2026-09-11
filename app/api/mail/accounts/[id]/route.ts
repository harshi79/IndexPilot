import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fail, json } from "@/lib/api-helpers";
import type { FullAccountRow } from "@/lib/mail/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { label?: string };
    const d = await initDb();
    const acc = await d.get<FullAccountRow>(
      "SELECT * FROM accounts WHERE id = ? AND user_id = ?",
      [Number(id), user.id]
    );
    if (!acc) return fail("Account not found.", 404);
    if (body.label !== undefined) {
      await d.run("UPDATE accounts SET label = ? WHERE id = ?", [String(body.label).slice(0, 40) || null, acc.id]);
    }
    return json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return fail((e as Error).message || "Failed to update account.", 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = await initDb();
    const acc = await d.get<{ id: number }>(
      "SELECT id FROM accounts WHERE id = ? AND user_id = ?",
      [Number(id), user.id]
    );
    if (!acc) return fail("Account not found.", 404);
    await d.run("DELETE FROM drafts WHERE account_id = ?", [acc.id]);
    await d.run("DELETE FROM messages WHERE account_id = ?", [acc.id]);
    await d.run("DELETE FROM accounts WHERE id = ?", [acc.id]);
    return json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return fail((e as Error).message || "Failed to remove account.", 500);
  }
}
