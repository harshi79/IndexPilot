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
