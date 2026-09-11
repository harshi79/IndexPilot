import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, rowToMessage, MAIL_COLUMNS, MAIL_FROM } from "@/lib/api-helpers";
import type { MailView } from "@/lib/mail/types";
import { syncInbox, syncSent, type FullAccountRow } from "@/lib/mail/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VIEW_FILTERS: Record<MailView, string> = {
  inbox: "m.archived = 0 AND m.trashed = 0",
  starred: "m.starred = 1 AND m.trashed = 0",
  sent: `(m.labels LIKE '%\"SENT\"%' OR m.labels LIKE '%\"Sent\"%')`,
  drafts: "1 = 0",
  archive: "m.archived = 1 AND m.trashed = 0",
  trash: "m.trashed = 1",
};

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const accountId = url.searchParams.get("account");
    const view = (url.searchParams.get("view") || "inbox") as MailView;
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);
    const d = await initDb();

    let acc: FullAccountRow | undefined;
    if (accountId) {
      acc = await d.get<FullAccountRow>(
        "SELECT * FROM accounts WHERE user_id = ? AND (id = ? OR email = ?)",
        [user.id, Number(accountId) || -1, accountId]
      );
    } else {
      acc = await d.get<FullAccountRow>(
        "SELECT * FROM accounts WHERE user_id = ? ORDER BY (kind='demo') DESC, id LIMIT 1",
        [user.id]
      );
    }
    if (!acc) {
      return json({ account: null, messages: [], total: 0, unread: 0, hint: "no-account" });
    }

    // Live-sync real accounts so the list reflects Gmail.
    let syncError: string | null = null;
    if (acc.kind !== "demo") {
      if (view === "sent") {
        const r = await syncSent(d, acc.id);
        if (!r.ok) syncError = r.error;
      } else {
        const r = await syncInbox(d, acc.id);
        if (!r.ok) syncError = r.error;
      }
    }

    const where: string[] = [`a.user_id = ?`, VIEW_FILTERS[view] ?? VIEW_FILTERS.inbox];
    const params: (string | number)[] = [user.id];
    if (q) {
      where.push(
        `(m.subject LIKE ? COLLATE NOCASE OR m.from_name LIKE ? COLLATE NOCASE OR m.from_email LIKE ? COLLATE NOCASE OR m.snippet LIKE ? COLLATE NOCASE)`
      );
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    params.push(acc.id);

    const rows = await d.all(
      `SELECT ${MAIL_COLUMNS} ${MAIL_FROM}
       WHERE ${where.join(" AND ")} AND m.account_id = ?
       ORDER BY m.message_date DESC LIMIT ?`,
      [...params, limit]
    );

    // Unread badge for this view (cheap count).
    const unreadRow = await d.get<{ c: number }>(
      `SELECT COUNT(*) c ${MAIL_FROM}
       WHERE a.user_id = ? AND m.account_id = ? AND m.read = 0 AND ${VIEW_FILTERS[view] ?? VIEW_FILTERS.inbox}`,
      [user.id, acc.id]
    );

    return json({
      account: { id: acc.id, email: acc.email, label: acc.label, kind: acc.kind },
      messages: rows.map((r) => rowToMessage(r as never)),
      total: rows.length,
      unread: unreadRow?.c ?? 0,
      syncError,
    });
  } catch (e) {
    console.error("inbox", e);
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
