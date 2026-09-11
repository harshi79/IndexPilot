import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download everything the app stores about this user as JSON. */
export async function GET() {
  let user: { id: number; email: string };
  try {
    user = await requireUser();
  } catch {
    return new Response("unauthorized", { status: 401 });
  }
  const d = await initDb();
  const [accounts, messages, drafts, conversations, chatMessages, providers] = await Promise.all([
    d.all("SELECT id, kind, provider, email, label, extra, created_at FROM accounts WHERE user_id = ?", [user.id]),
    d.all(
      "SELECT m.* FROM messages m JOIN accounts a ON a.id=m.account_id WHERE a.user_id = ?",
      [user.id]
    ),
    d.all("SELECT * FROM drafts WHERE user_id = ?", [user.id]),
    d.all("SELECT * FROM conversations WHERE user_id = ?", [user.id]),
    d.all(
      "SELECT cm.* FROM chat_messages cm JOIN conversations c ON c.id=cm.conversation_id WHERE c.user_id = ?",
      [user.id]
    ),
    d.all("SELECT provider, base_url, default_model, enabled FROM providers WHERE user_id = ?", [user.id]),
  ]);
  const payload = {
    exported_at: new Date().toISOString(),
    app: "IndexPilot",
    email: user.email,
    accounts,
    messages,
    drafts,
    conversations,
    chat_messages: chatMessages,
    ai_providers: providers,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="indexpilot-export-${user.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
