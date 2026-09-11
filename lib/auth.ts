import crypto from "node:crypto";
import { initDb } from "./db";

export interface PublicUser {
  id: number;
  email: string;
  display_name: string | null;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function getUserById(id: number): Promise<PublicUser | undefined> {
  const d = await initDb();
  const u = await d.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = ?", [id]);
  if (!u) return undefined;
  const p = await d.get<{ display_name: string | null }>(
    "SELECT display_name FROM profiles WHERE user_id = ?",
    [id]
  );
  return { id: u.id, email: u.email, display_name: p?.display_name ?? null };
}
