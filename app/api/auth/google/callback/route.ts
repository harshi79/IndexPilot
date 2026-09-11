import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { googleOAuth, requestOrigin } from "@/lib/config";
import {
  exchangeAuthorizationCode,
  verifyIdToken,
  hasGmailScope,
} from "@/lib/google-oauth";
import { upsertAccount, syncInbox } from "@/lib/mail/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_TTL_MS = 15 * 60 * 1000;

interface PendingLogin {
  flow: "login";
  verifier: string;
  redirectUri: string;
  nonce: string;
}

function redirectBack(origin: string, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/auth?error=${code}`, origin));
}

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const cfg = googleOAuth();
  if (!cfg) return redirectBack(origin, "google_not_configured");

  const url = new URL(req.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    console.warn("google login error:", oauthError, url.searchParams.get("error_description"));
    return redirectBack(
      origin,
      oauthError === "access_denied" ? "google_denied" : "google_error"
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectBack(origin, "google_missing");

  const d = await initDb();
  const row = await d.get<{ payload: string; created_at: number }>(
    "SELECT payload, created_at FROM pending_oauth WHERE state = ?",
    [state]
  );
  if (!row) return redirectBack(origin, "google_expired");
  await d.run("DELETE FROM pending_oauth WHERE state = ?", [state]);

  let pending: PendingLogin;
  try {
    pending = JSON.parse(row.payload) as PendingLogin;
  } catch {
    return redirectBack(origin, "google_expired");
  }
  if (pending.flow !== "login") return redirectBack(origin, "google_expired");
  if (Date.now() - row.created_at > STATE_TTL_MS) {
    return redirectBack(origin, "google_expired");
  }

  // 1) Exchange the authorization code.
  let tokens: Awaited<ReturnType<typeof exchangeAuthorizationCode>>;
  try {
    tokens = await exchangeAuthorizationCode({
      code,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      codeVerifier: pending.verifier,
      redirectUri: pending.redirectUri,
    });
  } catch (e) {
    console.error("google token exchange", e);
    return redirectBack(origin, "google_token");
  }

  // 2) Verify the ID token (audience + expiry) and read the verified email.
  if (!tokens.id_token) return redirectBack(origin, "google_token");
  let claims;
  try {
    claims = await verifyIdToken(tokens.id_token, cfg.clientId);
  } catch (e) {
    console.error("google id token", e);
    return redirectBack(origin, "google_token");
  }
  if (!claims.email) return redirectBack(origin, "google_noemail");
  if (claims.email_verified === false || claims.email_verified === "false") {
    return redirectBack(origin, "google_unverified");
  }
  const email = claims.email.toLowerCase();
  const sub = claims.sub;
  const displayName = (claims.name || "").trim().slice(0, 60) || null;

  // 3) Find or create the local user (link by Google sub, then verified email).
  let userId: number;
  const bySub = sub
    ? await d.get<{ id: number }>("SELECT id FROM users WHERE google_sub = ?", [sub])
    : undefined;
  const existing =
    bySub ?? (await d.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]));

  if (existing) {
    userId = existing.id;
    if (sub) {
      await d.run("UPDATE users SET google_sub = ? WHERE id = ?", [sub, userId]);
    }
    const profile = await d.get<{ display_name: string | null }>(
      "SELECT display_name FROM profiles WHERE user_id = ?",
      [userId]
    );
    if (profile && !profile.display_name && displayName) {
      await d.run("UPDATE profiles SET display_name = ? WHERE user_id = ?", [
        displayName,
        userId,
      ]);
    }
  } else {
    const ins = await d.run(
      "INSERT INTO users (email, password_hash, google_sub, created_at) VALUES (?, NULL, ?, ?)",
      [email, sub, Date.now()]
    );
    userId = ins.lastInsertRowid;
    await d.run(
      "INSERT INTO profiles (user_id, display_name, appearance, created_at) VALUES (?, ?, ?, ?)",
      [userId, displayName, JSON.stringify({ mode: "dark" }), Date.now()]
    );
  }

  // 4) If Gmail permissions were granted, connect (or refresh) the inbox.
  if (hasGmailScope(tokens.scope)) {
    try {
      const accountId = await upsertAccount(userId, {
        kind: "oauth",
        provider: "gmail",
        email,
        label: "Gmail",
        access_token: tokens.access_token,
        ...(tokens.refresh_token
          ? { refresh_token: tokens.refresh_token }
          : {}),
        ...(tokens.expires_in
          ? { token_expiry: Date.now() + tokens.expires_in * 1000 }
          : {}),
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      });
      await syncInbox(d, accountId);
    } catch (e) {
      // Sign-in still succeeds; inbox can be re-connected from Settings.
      console.error("google gmail connect", e);
    }
  }

  // 5) Start the session and land in the app.
  const cookie = await createSession(userId);
  const res = NextResponse.redirect(new URL("/app/inbox", origin));
  res.cookies.set(SESSION_COOKIE.name, cookie, SESSION_COOKIE.options);
  return res;
}
