import { initDb, type Db, type Param } from "../db";
import type { Account } from "./types";
import { listGmailMessages, parseGmailMessage, fetchGmailMessage, upsertGmailMessage } from "./gmail";

export interface FullAccountRow {
  id: number; user_id: number; kind: string; provider: string; email: string;
  label: string | null; access_token: string | null; refresh_token: string | null;
  token_expiry: number | null; client_id: string | null; client_secret: string | null;
  extra: string; created_at: number;
}

export async function upsertAccount(
  userId: number,
  acc: Partial<Account> & { kind: string; provider: string; email: string }
): Promise<number> {
  const d = await initDb();
  const existing = await d.get<{ id: number }>(
    "SELECT id FROM accounts WHERE user_id = ? AND email = ?",
    [userId, acc.email]
  );
  if (existing) {
    const sets: string[] = [];
    const params: Param[] = [];
    const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v as Param); };
    set("label", acc.label ?? null);
    if (acc.access_token !== undefined) set("access_token", acc.access_token);
    if (acc.refresh_token !== undefined) set("refresh_token", acc.refresh_token);
    if (acc.token_expiry !== undefined) set("token_expiry", acc.token_expiry);
    if (acc.client_id !== undefined) set("client_id", acc.client_id);
    if (acc.client_secret !== undefined) set("client_secret", acc.client_secret);
    if (acc.kind !== undefined) set("kind", acc.kind);
    params.push(existing.id);
    await d.run(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`, params);
    return existing.id;
  }
  const ins = await d.run(
    `INSERT INTO accounts (user_id, kind, provider, email, label, access_token, refresh_token, token_expiry, client_id, client_secret, extra, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
    [
      userId, acc.kind, acc.provider, acc.email, acc.label ?? null,
      acc.access_token ?? null, acc.refresh_token ?? null, acc.token_expiry ?? null,
      acc.client_id ?? null, acc.client_secret ?? null, Date.now(),
    ]
  );
  return ins.lastInsertRowid;
}

/** Fetch + cache the inbox for a live (non-demo) account. */
export async function syncInbox(d: Db, accountId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const acc = (await d.get<FullAccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]));
  if (!acc || acc.kind === "demo") return { ok: true };
  try {
    const full = acc as unknown as Account;
    const { messages } = await listGmailMessages(full, { max: 50, query: "newer_than_30d" });
    for (const msg of messages.slice(0, 50)) {
      try {
        const fullMsg = await fetchGmailMessage(full, msg.id);
        const parsed = parseGmailMessage(fullMsg);
        await upsertGmailMessage(accountId, msg.id, parsed, fullMsg.labelIds ?? []);
      } catch {
        /* skip individual failures */
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Fetch + cache SENT messages for a live account. */
export async function syncSent(d: Db, accountId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const acc = (await d.get<FullAccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]));
  if (!acc || acc.kind === "demo") return { ok: true };
  try {
    const full = acc as unknown as Account;
    const { messages } = await listGmailMessages(full, { max: 30, query: "label:SENT" });
    for (const msg of messages.slice(0, 30)) {
      try {
        const fullMsg = await fetchGmailMessage(full, msg.id);
        const parsed = parseGmailMessage(fullMsg);
        await upsertGmailMessage(accountId, msg.id, parsed, fullMsg.labelIds ?? ["SENT"]);
      } catch {
        /* skip */
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
