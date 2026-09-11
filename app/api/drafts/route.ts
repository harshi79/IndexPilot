import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, rowToDraft } from "@/lib/api-helpers";
import type { FullAccountRow } from "@/lib/mail/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DraftRow {
  id: number; account_id: number; message_id: number | null; to_email: string | null;
  to_name: string | null; subject: string | null; body: string | null; status: string;
  created_at: number; sent_at: number | null; account_email: string; account_label: string | null;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const accountId = url.searchParams.get("account");
    const view = url.searchParams.get("view") === "sent" ? "sent" : "drafts";
    const status = view === "sent" ? "sent" : "draft";
    const d = await initDb();
    const where: string[] = ["a.user_id = ?", `dr.status = '${status}'`];
    const params: (string | number)[] = [user.id];
    if (accountId) {
      where.push("(a.id = ? OR a.email = ?)");
      params.push(Number(accountId) || -1, accountId);
    }
    const rows = await d.all<DraftRow>(
      `SELECT dr.id, dr.account_id, dr.message_id, dr.to_email, dr.to_name, dr.subject,
              substr(dr.body, 1, 240) AS body, dr.status, dr.created_at, dr.sent_at,
              a.email AS account_email, a.label AS account_label
       FROM drafts dr JOIN accounts a ON a.id = dr.account_id
       WHERE ${where.join(" AND ")}
       ORDER BY dr.created_at DESC LIMIT 100`,
      params
    );
    return json({
      drafts: rows.map((r) => ({ ...rowToDraft(r), accountEmail: r.account_email, accountLabel: r.account_label })),
    });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
