import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/session";
import { json } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE.name)?.value ?? "");
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE.name, "", { ...SESSION_COOKIE.options, maxAge: 0 });
  return res;
}
