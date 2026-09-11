import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, rowToMessage, MAIL_COLUMNS, MAIL_FROM } from "@/lib/api-helpers";
import { executors } from "@/lib/agent/tools";
import { fetchGmailMessage, parseGmailMessage, upsertGmailMessage } from "@/lib/mail/gmail";
import type { FullAccountRow } from "@/lib/mail/store";
import type { Account } from "@/lib/mail/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwned(d: Awaited<ReturnType<typeof initDb>>, userId: number, id: number) {
  const account = await d.get<FullAccountRow>(
    `SELECT a.* FROM messages m JOIN accounts a ON a.id = m.account_id
     WHERE m.id = ? AND a.user_id = ?`,
    [id, userId]
  );
  if (!account) return null;
  const row = await d.get(
    `SELECT ${MAIL_COLUMNS} ${MAIL_FROM} WHERE m.id = ? AND a.user_id = ?`,
    [id, userId]
  );
  return { row, account };
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const d = await initDb();
    const owned = await loadOwned(d, user.id, Number(id));
    if (!owned || !owned.row) return json({ error: "Message not found." }, 404);

    // Live accounts: refresh the full body from Gmail when possible.
    if (owned.account.kind !== "demo" && owned.row.remote_id) {
      try {
        const full = await fetchGmailMessage(
          owned.account as unknown as Account,
          String(owned.row.remote_id)
        );
        const parsed = parseGmailMessage(full);
        await upsertGmailMessage(owned.account.id, String(owned.row.remote_id), parsed, full.labelIds ?? []);
      } catch {
        /* fall back to cached copy */
      }
    }
    const fresh = await d.get(
      `SELECT ${MAIL_COLUMNS} ${MAIL_FROM} WHERE m.id = ? AND a.user_id = ?`,
      [Number(id), user.id]
    );
    const msg = rowToMessage(fresh as never, true);
    await d.run("UPDATE messages SET read = 1 WHERE id = ?", [Number(id)]);
    return json({ message: msg });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}

type Action =
  | "read" | "unread" | "star" | "unstar"
  | "archive" | "unarchive" | "trash" | "restore" | "label";

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: Action; label?: string; add?: boolean };
    const action = body.action;
    if (!action) return json({ error: "Missing action." }, 400);
    const d = await initDb();
    const owned = await loadOwned(d, user.id, Number(id));
    if (!owned || !owned.row) return json({ error: "Message not found." }, 404);

    const ctxTools = { userId: user.id, accounts: [owned.account as unknown as Account], db: d };
    let outcome;
    switch (action) {
      case "read":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), read: true });
        break;
      case "unread":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), read: false });
        break;
      case "star":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), starred: true });
        break;
      case "unstar":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), starred: false });
        break;
      case "archive":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), archived: true });
        break;
      case "unarchive":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), archived: false });
        break;
      case "trash":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), trashed: true });
        break;
      case "restore":
        outcome = await executors.set_status(ctxTools, { mail_id: Number(id), trashed: false, archived: false });
        break;
      case "label":
        if (!body.label) return json({ error: "Missing label." }, 400);
        outcome = await executors.apply_label(ctxTools, { mail_id: Number(id), label: body.label, add: body.add !== false });
        break;
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
    if (!outcome.ok) return json({ error: outcome.error, ok: false }, 502);

    const fresh = await d.get(
      `SELECT ${MAIL_COLUMNS} ${MAIL_FROM} WHERE m.id = ? AND a.user_id = ?`,
      [Number(id), user.id]
    );
    return json({ ok: true, message: rowToMessage(fresh as never) });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
