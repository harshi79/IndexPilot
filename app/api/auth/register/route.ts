import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { hashPassword, validateEmail } from "@/lib/auth";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { fail, json } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      display_name?: string;
    };
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    if (!validateEmail(email)) return fail("Enter a valid email address.");
    if (password.length < 8) return fail("Password must be at least 8 characters.");
    const name = (body.display_name || "").trim().slice(0, 60) || null;

    const d = await initDb();
    const exists = await d.get("SELECT id FROM users WHERE email = ?", [email]);
    if (exists) return fail("An account with this email already exists.", 409);

    const ins = await d.run(
      "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
      [email, hashPassword(password), Date.now()]
    );
    await d.run(
      "INSERT INTO profiles (user_id, display_name, appearance, created_at) VALUES (?, ?, ?, ?)",
      [ins.lastInsertRowid, name, JSON.stringify({ mode: "dark" }), Date.now()]
    );
    const token = await createSession(ins.lastInsertRowid);
    const res = json({ ok: true, user: { email } });
    res.cookies.set(SESSION_COOKIE.name, token, SESSION_COOKIE.options);
    return res;
  } catch (e) {
    console.error("register", e);
    return fail("Something went wrong. Try again.", 500);
  }
}
