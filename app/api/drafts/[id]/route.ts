import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, rowToDraft } from "@/lib/api-helpers";
import type { FullAccountRow } from "@/lib/mail/store";
import type { Account } from "@/lib/mail/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

interface DraftRow {
  id: number; account_id: number; message_id: number | null; to_email: string | null;
  to_name: string | null; subject: string | null; body: string | null; status: string;
  created_at: number; sent_at: number | null;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = await initDb();
    const row = await d.get<DraftRow>(
      "SELECT * FROM drafts WHERE id = ? AND user_id = ?",
      [Number(id), user.id]
    );
    if (!row) return json({ error: "Draft not found." }, 404);
    return json({ draft: rowToDraft(row) });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { subject?: string; body?: string; to_email?: string };
    const d = await initDb();
    const row = await d.get<DraftRow>(
      "SELECT * FROM drafts WHERE id = ? AND user_id = ?",
      [Number(id), user.id]
    );
    if (!row) return json({ error: "Draft not found." }, 404);
    if (body.subject !== undefined) await d.run("UPDATE drafts SET subject = ? WHERE id = ?", [body.subject, row.id]);
    if (body.body !== undefined) await d.run("UPDATE drafts SET body = ? WHERE id = ?", [body.body, row.id]);
    if (body.to_email !== undefined) await d.run("UPDATE drafts SET to_email = ? WHERE id = ?", [body.to_email, row.id]);
    const fresh = await d.get<DraftRow>("SELECT * FROM drafts WHERE id = ?", [row.id]);
    return json({ ok: true, draft: rowToDraft(fresh!) });
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
    await d.run("DELETE FROM drafts WHERE id = ? AND user_id = ?", [Number(id), user.id]);
    return json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}

/** Send this draft (demo accounts simulate delivery; live accounts call Gmail). */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = await initDb();
    const row = await d.get<DraftRow>(
      "SELECT * FROM drafts WHERE id = ? AND user_id = ?",
      [Number(id), user.id]
    );
    if (!row) return json({ error: "Draft not found." }, 404);
    if (!row.to_email || !row.body) return json({ error: "Draft is missing a recipient or body." }, 400);

    const account = await d.get<FullAccountRow>(
      "SELECT * FROM accounts WHERE id = ? AND user_id = ?",
      [row.account_id, user.id]
    );
    if (!account) return json({ error: "Account no longer exists." }, 404);

    if (account.kind === "demo") {
      await d.run("UPDATE drafts SET status = 'sent', sent_at = ? WHERE id = ?", [Date.now(), row.id]);
      return json({ ok: true, message: "Sent (demo — no real delivery)." });
    }

    const { buildMime, b64urlEncode, sendRawGmail } = await import("@/lib/mail/gmail");
    try {
      const res = await sendRawGmail(
        account as unknown as Account,
        b64urlEncode(
          buildMime({
            from: account.email,
            to: row.to_email,
            subject: row.subject || "(no subject)",
            body: row.body,
          })
        )
      );
      await d.run("UPDATE drafts SET status = 'sent', sent_at = ? WHERE id = ?", [Date.now(), row.id]);
      return json({ ok: true, message: `Sent to ${row.to_email} (${res.id}).` });
    } catch (e) {
      return json({ error: (e as Error).message, ok: false }, 502);
    }
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
