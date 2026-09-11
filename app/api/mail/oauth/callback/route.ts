import { initDb } from "@/lib/db";
import { fail, json } from "@/lib/api-helpers";
import { getGmailProfileEmail, GmailError } from "@/lib/mail/gmail";
import { upsertAccount, syncInbox } from "@/lib/mail/store";
import type { Account } from "@/lib/mail/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Pending {
  userId: number;
  clientId: string;
  clientSecret: string;
  verifier: string;
  redirectUri: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return fail(`Google returned an error: ${error}. Try again.`, 400);
  }
  if (!code || !state) return fail("Missing code or state.", 400);

  const d = await initDb();
  const row = await d.get<{ payload: string }>(
    "SELECT payload FROM pending_oauth WHERE state = ?",
    [state]
  );
  if (!row) return fail("This sign-in session expired. Start the connection again.", 400);
  const pending = JSON.parse(row.payload) as Pending;
  await d.run("DELETE FROM pending_oauth WHERE state = ?", [state]);

  let tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: pending.clientId,
        client_secret: pending.clientSecret,
        code_verifier: pending.verifier,
        grant_type: "authorization_code",
        redirect_uri: pending.redirectUri,
      }),
    });
    tokens = await res.json();
  } catch (e) {
    return fail(`Token exchange failed: ${(e as Error).message}`, 502);
  }
  if (!tokens.access_token) {
    return fail(
      `Google token exchange failed: ${tokens.error_description || tokens.error || "unknown"}`,
      502
    );
  }

  const probe = {
    id: 0, userId: pending.userId, kind: "oauth", provider: "gmail", email: "",
    label: null, access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null,
    token_expiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    client_id: pending.clientId, client_secret: pending.clientSecret,
    extra: "{}", created_at: Date.now(),
  } as Account;

  let email: string;
  try {
    email = await getGmailProfileEmail(probe);
  } catch (e) {
    const msg = e instanceof GmailError ? e.message : (e as Error).message;
    return fail(`Connected, but could not read your address: ${msg}`, 502);
  }

  const id = await upsertAccount(pending.userId, {
    kind: "oauth",
    provider: "gmail",
    email,
    label: "Gmail",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    client_id: pending.clientId,
    client_secret: pending.clientSecret,
  });
  await syncInbox(d, id);

  // Small HTML page that redirects the user back to the app.
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Gmail connected</title>
    <style>body{font-family:system-ui;background:#0b0a09;color:#eae6df;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .box{border:1px solid #262220;border-radius:12px;padding:32px 40px;text-align:center;background:#131110}
    h1{font-size:18px;margin:0 0 8px}p{color:#a49d91;font-size:13px;margin:0}</style>
    </head><body><div class="box">
    <h1>✓ ${email.replace(/</g, "&lt;")} connected</h1>
    <p>Returning you to IndexPilot…</p>
    </div><script>setTimeout(()=>{location.href="/app/inbox"},1200)</script>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
