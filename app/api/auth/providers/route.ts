import { googleOAuth } from "@/lib/config";
import { json } from "@/lib/api-helpers";
import { LOGIN_SCOPES } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: which sign-in methods this instance exposes. */
export async function GET() {
  const configured = !!googleOAuth();
  return json({
    email: true,
    google: configured,
    // Gmail permission scopes shown in the consent explanation on the page.
    gmail_access: configured
      ? LOGIN_SCOPES.filter((s) => s.startsWith("https://"))
      : [],
  });
}
