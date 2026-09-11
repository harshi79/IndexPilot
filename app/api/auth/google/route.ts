import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { initDb } from "@/lib/db";
import { appUrl, googleOAuth, requestOrigin } from "@/lib/config";
import { CONSENT_URL, LOGIN_SCOPES, pkce } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kicks off "Sign in with Google": builds a PKCE-protected consent URL that
 * authenticates the user AND requests Gmail permissions in one screen.
 */
export async function GET(req: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL
    ? appUrl()
    : requestOrigin(req);

  const cfg = googleOAuth();
  if (!cfg) {
    return NextResponse.redirect(
      new URL("/auth?error=google_not_configured", origin)
    );
  }

  const d = await initDb();
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(24).toString("hex");
  const nonce = crypto.randomBytes(20).toString("hex");
  const redirectUri = `${origin}/api/auth/google/callback`;

  await d.run(
    "INSERT INTO pending_oauth (state, payload, created_at) VALUES (?, ?, ?)",
    [
      state,
      JSON.stringify({ flow: "login", verifier, redirectUri, nonce }),
      Date.now(),
    ]
  );

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: LOGIN_SCOPES.join(" "),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });

  return NextResponse.redirect(`${CONSENT_URL}?${params.toString()}`, {
    status: 302,
  });
}
