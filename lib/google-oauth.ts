import crypto from "node:crypto";

export const CONSENT_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

/**
 * One consent screen for both authentication and Gmail access.
 * - openid / email / profile  → prove who the user is (sign in / register)
 * - gmail.modify / gmail.send → read, label, draft and send mail
 */
export const LOGIN_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

export function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  token_type?: string;
}

export async function exchangeAuthorizationCode(p: {
  code: string;
  clientId: string;
  clientSecret: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: p.code,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      code_verifier: p.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: p.redirectUri,
    }),
  });
  const data = (await res.json()) as GoogleTokens & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  return data;
}

export interface GoogleIdClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  aud: string;
  exp: number | string;
}

/**
 * Validate the ID token via Google's tokeninfo endpoint and check the audience
 * is THIS application's client ID (prevents token-substitution attacks).
 */
export async function verifyIdToken(
  idToken: string,
  expectedAudience: string
): Promise<GoogleIdClaims> {
  const res = await fetch(
    `${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`
  );
  const claims = (await res.json()) as GoogleIdClaims & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || claims.error) {
    throw new Error(claims.error_description || claims.error || "invalid id_token");
  }
  if (claims.aud !== expectedAudience) {
    throw new Error("id_token audience does not match this application");
  }
  if (Number(claims.exp) * 1000 < Date.now()) {
    throw new Error("id_token expired");
  }
  return claims;
}

/** True if the granted scope string includes Gmail read/modify access. */
export function hasGmailScope(grantedScope: string | undefined): boolean {
  if (!grantedScope) return false;
  const scopes = grantedScope.split(/\s+/);
  return scopes.includes("https://www.googleapis.com/auth/gmail.modify");
}
