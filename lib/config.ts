import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

let cachedSecret: string | null = null;

/** Stable per-install secret for signing session cookies (overridable via env). */
export function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const file = path.join(process.cwd(), "data", ".session_secret");
  try {
    if (fs.existsSync(file)) {
      cachedSecret = fs.readFileSync(file, "utf8").trim();
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      cachedSecret = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
    }
  } catch {
    cachedSecret = crypto.randomBytes(32).toString("hex");
  }
  return cachedSecret;
}

export function useTurso(): boolean {
  return Boolean(
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN
  );
}

/**
 * Server-side Google OAuth client used for the "Continue with Google" button.
 * When unset, the button is hidden and only email/password auth is offered.
 */
export function googleOAuth(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Public origin of this request, honouring the proxy headers set by hosts
 * (Render sets the protocol; the sandbox preview sets forwarded-host).
 */
export function requestOrigin(req: Request): string {
  const fwdHost = req.headers.get("x-forwarded-host");
  if (fwdHost) {
    const proto =
      (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    return `${proto}://${fwdHost.split(",")[0].trim()}`;
  }
  return new URL(req.url).origin;
}
