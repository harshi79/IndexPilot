import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { fail, json } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let body: { email?: string; password?: string };
    try {
      body = (await req.json()) as { email?: string; password?: string };
    } catch {
      return fail("Invalid request.", 400);
    }
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    if (!email || !password) return fail("Email and password are required.");

    const d = await initDb();
    const user = await d.get<{ id: number; password_hash: string | null }>(
      "SELECT id, password_hash FROM users WHERE email = ?",
      [email]
    );
    if (!user || !user.password_hash) {
      return fail(
        user
          ? "This account signs in with Google. Use “Continue with Google”."
          : "Incorrect email or password.",
        401
      );
    }
    if (!verifyPassword(password, user.password_hash)) {
      return fail("Incorrect email or password.", 401);
    }
    const token = await createSession(user.id);
    const res = json({ ok: true });
    res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);
    return res;
  } catch (e) {
    console.error("login", e);
    return fail("Something went wrong. Try again.", 500);
  }
}
