import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json } from "@/lib/api-helpers";
import type { FullAccountRow } from "@/lib/mail/store";
import type { Account } from "@/lib/mail/types";
import { executors } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a draft from the compose modal. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      account?: number;
      to_email?: string;
      to_name?: string;
      subject?: string;
      body?: string;
      message_id?: number;
    };
    const to = (body.to_email || "").trim();
    const text = (body.body || "").trim();
    if (!to || !text) return json({ error: "Recipient and body are required." }, 400);
    const d = await initDb();
    const acc = await d.get<FullAccountRow>(
      "SELECT * FROM accounts WHERE user_id = ? AND (id = ? OR email = ?)",
      [user.id, body.account ?? -1, String(body.account ?? "")]
    );
    if (!acc) return json({ error: "Pick an account first (Settings → Email)." }, 400);
    const outcome = await executors.create_draft(
      { userId: user.id, accounts: [acc as unknown as Account], db: d },
      {
        to_email: to,
        subject: body.subject || "(no subject)",
        body: text,
        mail_id: body.message_id ?? undefined,
      }
    );
    if (!outcome.ok) return json({ error: outcome.error }, 400);
    const res = outcome.result as { draft_id: number };
    return json({ ok: true, draft_id: res.draft_id });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
