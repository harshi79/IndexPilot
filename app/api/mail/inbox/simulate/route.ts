import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, rowToMessage, MAIL_COLUMNS, MAIL_FROM } from "@/lib/api-helpers";
import { simulateIncoming } from "@/lib/mail/demo";
import type { FullAccountRow } from "@/lib/mail/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Demo-mode only: deliver a fresh incoming email to a demo account. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const accountId = url.searchParams.get("account");
    const d = await initDb();
    let acc: FullAccountRow | undefined;
    if (accountId) {
      acc = await d.get<FullAccountRow>(
        "SELECT * FROM accounts WHERE user_id = ? AND (id = ? OR email = ?)",
        [user.id, Number(accountId) || -1, accountId]
      );
    } else {
      acc = await d.get<FullAccountRow>(
        "SELECT * FROM accounts WHERE user_id = ? AND kind = 'demo' ORDER BY id LIMIT 1",
        [user.id]
      );
    }
    if (!acc || acc.kind !== "demo") {
      return json({ error: "Simulation is only available on demo accounts." }, 400);
    }
    await simulateIncoming(acc.id);
    const row = await d.get(
      `SELECT ${MAIL_COLUMNS} ${MAIL_FROM} WHERE m.account_id = ? ORDER BY m.message_date DESC LIMIT 1`,
      [acc.id]
    );
    return json({ ok: true, message: rowToMessage(row as never) });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
