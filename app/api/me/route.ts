import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getUserById } from "@/lib/auth";
import { json, maskSecret, rowToAccount } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AccountRow {
  id: number; user_id: number; kind: string; provider: string; email: string;
  label: string | null; created_at: number;
}

export async function GET() {
  try {
    const user = await requireUser();
    const d = await initDb();
    const full = await getUserById(user.id);
    const profile = await d.get<{ display_name: string | null; appearance: string }>(
      "SELECT display_name, appearance FROM profiles WHERE user_id = ?",
      [user.id]
    );
    const accounts = await d.all<AccountRow>(
      "SELECT id, user_id, kind, provider, email, label, created_at FROM accounts WHERE user_id = ? ORDER BY id",
      [user.id]
    );
    const providers = await d.all<{
      provider: string; api_key: string; base_url: string | null; default_model: string | null; enabled: number;
    }>(
      "SELECT provider, api_key, base_url, default_model, enabled FROM providers WHERE user_id = ?",
      [user.id]
    );
    let appearance: Record<string, unknown> = {};
    try {
      appearance = JSON.parse(profile?.appearance || "{}");
    } catch {
      /* ignore */
    }
    return json({
      user: {
        id: user.id,
        email: user.email,
        display_name: profile?.display_name ?? full?.display_name ?? null,
      },
      appearance,
      accounts: accounts.map(rowToAccount),
      providers: providers.map((p) => ({
        provider: p.provider,
        api_key_masked: maskSecret(p.api_key),
        has_key: Boolean(p.api_key),
        base_url: p.base_url,
        default_model: p.default_model,
        enabled: !!p.enabled,
      })),
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    if (status === 401) return json({ error: "unauthorized" }, 401);
    throw e;
  }
}
