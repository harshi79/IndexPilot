import crypto from "node:crypto";
import { cookies } from "next/headers";
import { initDb } from "./db";
import { sessionSecret } from "./config";

const COOKIE = "ip_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: number;
  email: string;
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signToken(token: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: number): Promise<string> {
  const d = await initDb();
  const token = randomToken();
  const cookieValue = `${token}.${signToken(token)}`;
  await d.run(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [sha256(token), userId, Date.now() + TTL_MS, Date.now()]
  );
  return cookieValue;
}

export async function destroySession(cookieValue: string): Promise<void> {
  const token = cookieValue.split(".")[0] ?? "";
  if (!token) return;
  const d = await initDb();
  await d.run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
}

/** Verify the signed cookie and resolve the user row (or undefined). */
export async function currentUser(): Promise<SessionUser | undefined> {
  const jar = await cookies();
  const cookieValue = jar.get(COOKIE)?.value;
  if (!cookieValue) return undefined;
  const [token, sig] = cookieValue.split(".");
  if (!token || !sig || sig !== signToken(token)) return undefined;
  const d = await initDb();
  const row = await d.get<{
    token_hash: string;
    user_id: number;
    expires_at: number;
  }>(
    "SELECT token_hash, user_id, expires_at FROM sessions WHERE token_hash = ?",
    [sha256(token)]
  );
  if (!row || row.expires_at < Date.now()) return undefined;
  const user = await d.get<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE id = ?",
    [row.user_id]
  );
  return user;
}

/** Require an authenticated user; throws a 401-friendly error otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return user;
}

export const SESSION_COOKIE = {
  name: COOKIE,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  },
};
