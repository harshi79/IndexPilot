import { initDb } from "@/lib/db";
import { useTurso } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * Liveness probe for Render (and friends).
 * Returns 200 with body "ok" — fast, no auth, no heavy work.
 */
export async function GET() {
  let db: "up" | "down" | "skipped" = "skipped";
  try {
    const d = await initDb();
    await d.get("SELECT 1 AS one");
    db = "up";
  } catch {
    db = "down";
  }
  return new Response("ok", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-IndexPilot": `db=${db};driver=${useTurso() ? "turso" : "local-sqlite"};uptime=${Math.round((Date.now() - startedAt) / 1000)}s`,
    },
  });
}
