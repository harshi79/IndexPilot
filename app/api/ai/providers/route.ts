import { initDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, maskSecret } from "@/lib/api-helpers";
import { PROVIDERS, PROVIDER_IDS, providerMeta, fetchLiveModels, type ProviderId } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProviderRow {
  provider: string;
  api_key: string;
  base_url: string | null;
  default_model: string | null;
  enabled: number;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const liveProvider = url.searchParams.get("provider") as ProviderId | null;
    const wantLive = url.searchParams.get("live") === "1" && liveProvider && PROVIDER_IDS.includes(liveProvider);
    const d = await initDb();
    const rows = await d.all<ProviderRow>(
      "SELECT provider, api_key, base_url, default_model, enabled FROM providers WHERE user_id = ?",
      [user.id]
    );
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    let liveModels: { id: string; name: string; tags: string[]; note?: string }[] | null = null;
    if (wantLive) {
      const row = byProvider.get(liveProvider!);
      if (row?.api_key) {
        liveModels = await fetchLiveModels(liveProvider!, row.api_key, row.base_url ?? undefined);
      }
    }

    return json({
      providers: PROVIDER_IDS.map((id) => {
        const meta = providerMeta(id)!;
        const row = byProvider.get(id);
        return {
          id,
          name: meta.name,
          protocol: meta.protocol,
          keyUrl: meta.keyUrl,
          models: liveProvider === id && liveModels ? liveModels : meta.models,
          has_key: Boolean(row?.api_key),
          api_key_masked: maskSecret(row?.api_key),
          base_url: row?.base_url ?? null,
          default_model: row?.default_model ?? null,
          enabled: row ? !!row.enabled : true,
        };
      }),
    });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      provider?: string;
      api_key?: string;
      base_url?: string | null;
      default_model?: string | null;
      enabled?: boolean;
    };
    const id = body.provider as ProviderId;
    if (!id || !PROVIDER_IDS.includes(id)) return json({ error: "Unknown provider." }, 400);
    const d = await initDb();
    const key = (body.api_key || "").trim();
    if (key) {
      await d.run(
        `INSERT INTO providers (user_id, provider, api_key, base_url, default_model, enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, provider) DO UPDATE SET
           api_key = excluded.api_key,
           base_url = excluded.base_url,
           default_model = COALESCE(excluded.default_model, providers.default_model),
           enabled = excluded.enabled`,
        [user.id, id, key, body.base_url?.trim() || null, body.default_model ?? null, body.enabled === false ? 0 : 1]
      );
    } else if (body.default_model !== undefined || body.enabled !== undefined) {
      await d.run(
        "UPDATE providers SET base_url = COALESCE(?, base_url), default_model = COALESCE(?, default_model), enabled = ? WHERE user_id = ? AND provider = ?",
        [body.base_url?.trim() || null, body.default_model ?? null, body.enabled === false ? 0 : 1, user.id, id]
      );
    } else {
      return json({ error: "Nothing to save." }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { provider?: string };
    const id = body.provider as ProviderId;
    if (!id || !PROVIDER_IDS.includes(id)) return json({ error: "Unknown provider." }, 400);
    const d = await initDb();
    await d.run("DELETE FROM providers WHERE user_id = ? AND provider = ?", [user.id, id]);
    return json({ ok: true });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return json({ error: (e as Error).message }, 500);
  }
}
