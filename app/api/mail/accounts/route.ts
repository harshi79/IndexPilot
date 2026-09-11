import crypto from "node:crypto";
import { initDb } from "@/lib/db";
import { requestOrigin } from "@/lib/config";
import { requireUser } from "@/lib/session";
import { fail, json, rowToAccount } from "@/lib/api-helpers";
import { getGmailProfileEmail } from "@/lib/mail/gmail";
import { seedDemoAccount, DEMO_EMAIL, DEMO_LABEL } from "@/lib/mail/demo";
import { upsertAccount, syncInbox, type FullAccountRow } from "@/lib/mail/store";
import type { Account } from "@/lib/mail/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET() {
  try {
    const user = await requireUser();
    const d = await initDb();
    const accounts = await d.all<FullAccountRow>(
      "SELECT * FROM accounts WHERE user_id = ? ORDER BY id",
      [user.id]
    );
    return json({
      accounts: accounts.map(rowToAccount),
      demo_available: !accounts.some((a) => a.kind === "demo"),
    });
  } catch (e) {
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      kind?: string;
      access_token?: string;
      client_id?: string;
      client_secret?: string;
    };
    const kind = body.kind || "demo";
    const d = await initDb();

    if (kind === "demo") {
      const id = await upsertAccount(user.id, {
        kind: "demo",
        provider: "gmail",
        email: DEMO_EMAIL,
        label: DEMO_LABEL,
      });
      await seedDemoAccount(id);
      const acc = await d.get<FullAccountRow>("SELECT * FROM accounts WHERE id = ?", [id]);
      return json({ ok: true, account: rowToAccount(acc!), demo: true });
    }

    if (kind === "token") {
      const token = (body.access_token || "").trim();
      if (!token) return fail("Paste a Gmail access token.");
      const probe = {
        id: 0, userId: user.id, kind: "token", provider: "gmail", email: "",
        label: null, access_token: token, refresh_token: null, token_expiry: Date.now() + 30 * 60 * 1000,
        client_id: null, client_secret: null, extra: "{}", created_at: Date.now(),
      } as Account;
      let email: string;
      try {
        email = await getGmailProfileEmail(probe);
      } catch (e) {
        return fail(`Could not verify token: ${(e as Error).message}`);
      }
      const id = await upsertAccount(user.id, {
        kind: "token", provider: "gmail", email, label: "Token account",
        access_token: token, token_expiry: Date.now() + 30 * 60 * 1000,
      });
      await syncInbox(d, id);
      const acc = await d.get<FullAccountRow>("SELECT * FROM accounts WHERE id = ?", [id]);
      return json({ ok: true, account: rowToAccount(acc!) });
    }

    if (kind === "oauth") {
      const clientId = (body.client_id || "").trim();
      const clientSecret = (body.client_secret || "").trim();
      if (!clientId || !clientSecret) return fail("Both a client ID and client secret are required.");
      const verifier = b64url(crypto.randomBytes(32));
      const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
      const state = crypto.randomBytes(24).toString("hex");
      // Use the actual deployment origin unless overridden, so the redirect
      // URI is always correct wherever this instance runs.
      const base = process.env.NEXT_PUBLIC_APP_URL || requestOrigin(req);
      const redirectUri = `${base}/api/mail/oauth/callback`;
      await d.run(
        "INSERT INTO pending_oauth (state, payload, created_at) VALUES (?, ?, ?)",
        [
          state,
          JSON.stringify({ flow: "connect", userId: user.id, clientId, clientSecret, verifier, redirectUri }),
          Date.now(),
        ]
      );
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
      });
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return json({ ok: true, authUrl, redirectUri });
    }

    return fail(`Unknown account kind: ${kind}`);
  } catch (e) {
    console.error("account add", e);
    if ((e as { status?: number }).status === 401) return json({ error: "unauthorized" }, 401);
    return fail((e as Error).message || "Failed to add account.", 500);
  }
}
