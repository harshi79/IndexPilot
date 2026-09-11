import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete all user data (accounts, mail cache, drafts, chat, keys, profile). */
export async function POST() {
  let user: { id: number };
  try {
    user = await requireUser();
  } catch {
    return json({ error: "unauthorized" }, 401);
  }
  const d = await initDb();
  const accountIds = await d.all<{ id: number }>(
    "SELECT id FROM accounts WHERE user_id = ?",
    [user.id]
  );
  for (const a of accountIds) {
    await d.run("DELETE FROM messages WHERE account_id = ?", [a.id]);
    await d.run("DELETE FROM drafts WHERE account_id = ?", [a.id]);
  }
  await d.run("DELETE FROM accounts WHERE user_id = ?", [user.id]);
  const convs = await d.all<{ id: number }>(
    "SELECT id FROM conversations WHERE user_id = ?",
    [user.id]
  );
  for (const c of convs) await d.run("DELETE FROM chat_messages WHERE conversation_id = ?", [c.id]);
  await d.run("DELETE FROM conversations WHERE user_id = ?", [user.id]);
  await d.run("DELETE FROM providers WHERE user_id = ?", [user.id]);
  await d.run("DELETE FROM profiles WHERE user_id = ?", [user.id]);
  await d.run(
    "INSERT INTO profiles (user_id, display_name, appearance, created_at) VALUES (?, NULL, '{}', ?)",
    [user.id, Date.now()]
  );
  return json({ ok: true });
}
