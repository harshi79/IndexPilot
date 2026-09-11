import { initDb } from "../db";
import type { Account } from "./types";

const GMAIL = "https://gmail.googleapis.com/gmail/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GmailError extends Error {
  constructor(
    message: string,
    public status?: number,
    public detail?: string
  ) {
    super(message);
  }
}

export function b64urlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function b64urlDecode(input: string): string {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Return a valid access token for the account, refreshing when possible. */
export async function accessTokenFor(account: Account): Promise<string | null> {
  if (account.kind === "demo") return null;
  if (
    account.access_token &&
    account.token_expiry &&
    account.token_expiry > Date.now() + 60_000
  ) {
    return account.access_token;
  }
  if (!account.refresh_token || !account.client_id || !account.client_secret) {
    return account.access_token; // may be expired — callers surface the error
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
      client_id: account.client_id,
      client_secret: account.client_secret,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new GmailError(
      `Token refresh failed: ${data.error_description || data.error || res.status}`,
      res.status
    );
  }
  const d = await initDb();
  await d.run(
    "UPDATE accounts SET access_token = ?, token_expiry = ? WHERE id = ?",
    [data.access_token, Date.now() + (data.expires_in ?? 3600) * 1000, account.id]
  );
  return data.access_token;
}

async function greq(
  account: Account,
  path: string,
  init: RequestInit = {},
  params?: Record<string, string>
): Promise<unknown> {
  const token = await accessTokenFor(account);
  if (!token) throw new GmailError("No credentials for this account");
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${GMAIL}${path}${qs}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = data as { error?: { message?: string } };
    throw new GmailError(
      err?.error?.message || `Gmail API error ${res.status}`,
      res.status
    );
  }
  return data;
}

export interface GMessageMeta {
  id: string;
  threadId?: string;
  labelIds?: string[];
  historyId?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: GMessageMeta["payload"][];
  };
}

export async function listGmailMessages(
  account: Account,
  opts: { max?: number; query?: string; pageToken?: string } = {}
): Promise<{ messages: GMessageMeta[]; nextPageToken?: string; resultSize: number }> {
  const data = (await greq(account, "/users/me/messages", {}, {
    maxResults: String(opts.max ?? 50),
    q: opts.query ?? "newer_than_30d",
    format: "metadata",
    metadataHeaders: "Subject,From,To,Date",
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
  })) as { messages: GMessageMeta[]; nextPageToken?: string; resultSize?: number };
  return { messages: data.messages ?? [], nextPageToken: data.nextPageToken, resultSize: data.resultSize ?? 0 };
}

export async function fetchGmailMessage(account: Account, id: string): Promise<GMessageMeta> {
  const data = (await greq(account, `/users/me/messages/${encodeURIComponent(id)}`, {}, {
    format: "full",
  })) as GMessageMeta;
  return data;
}

export async function modifyGmailMessage(
  account: Account,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  await greq(account, `/users/me/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function sendRawGmail(account: Account, rawB64: string): Promise<{ id: string }> {
  const data = (await greq(account, "/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: rawB64 }),
  })) as { id: string };
  return data;
}

export async function createDraftGmail(account: Account, rawB64: string): Promise<{ id: string }> {
  const data = (await greq(account, "/users/me/drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw: rawB64 } }),
  })) as { id: string };
  return data;
}

export async function getGmailProfileEmail(account: Account): Promise<string> {
  const data = (await greq(account, "/users/getProfile")) as { email: string };
  return data.email;
}

export function buildMime(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}): string {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Date: ${new Date().toUTCString()}`,
  ];
  if (opts.inReplyTo) headers.push(`References: ${opts.inReplyTo}`, `In-Reply-To: ${opts.inReplyTo}`);
  headers.push("MIME-Version: 1.0", 'Content-Type: text/plain; charset=utf-8');
  return `${headers.join("\n")}\r\n\r\n${opts.body}\r\n`;
}

// ── Message parsing ───────────────────────────────────────────────────────

interface Parsed {
  subject: string;
  fromName: string;
  fromEmail: string;
  toEmails: string[];
  bodyText: string;
  bodyHtml: string;
  date: number;
}

function parseFrom(value: string): { name: string; email: string } {
  const m = value.match(/"([^"]*)"\s*<([^>]+)>/);
  if (m) return { name: m[1] || m[2], email: m[2] };
  const bare = value.match(/<([^>]+)>/);
  if (bare) return { name: bare[1], email: bare[1] };
  return { name: value || "Unknown", email: value };
}

function walkParts(payload: GMessageMeta["payload"], acc: { text: string; html: string; headers: { name: string; value: string }[] }) {
  const p = payload;
  if (!p) return;
  if (p.headers) acc.headers.push(...p.headers);
  if (p.mimeType?.startsWith("text/plain") && p.body?.data) {
    acc.text += b64urlDecode(p.body.data);
  }
  if (p.mimeType?.startsWith("text/html") && p.body?.data) {
    acc.html += b64urlDecode(p.body.data);
  }
  p.parts?.forEach((sub) => walkParts(sub, acc));
}

export function parseGmailMessage(msg: GMessageMeta): Parsed {
  const acc: { text: string; html: string; headers: { name: string; value: string }[] } = {
    text: "",
    html: "",
    headers: [],
  };
  walkParts(msg.payload, acc);
  const header = (name: string) =>
    acc.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const from = parseFrom(header("From"));
  const toEmails = (header("To") + " " + header("Cc"))
    .split(/[,;]/)
    .map((s) => s.replace(/<([^>]+)>/, "$1").trim())
    .filter(Boolean);
  const date = header("Date") ? Date.parse(header("Date")) : Date.now();

  return {
    subject: header("Subject") || "(no subject)",
    fromName: from.name,
    fromEmail: from.email,
    toEmails,
    bodyText: acc.text,
    bodyHtml: acc.html,
    date: Number.isFinite(date) ? date : Date.now(),
  };
}

export function snippetFrom(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

export async function upsertGmailMessage(
  accountId: number,
  remoteId: string,
  parsed: Parsed,
  labelIds: string[]
): Promise<void> {
  const d = await initDb();
  const important = labelIds.includes("IMPORTANT");
  const labels = labelIds
    .filter((l) => !["INBOX", "UNREAD", "READ", "STARRED", "IMPORTANT", "CATEGORY_UPDATES", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"].includes(l))
    .slice(0, 8);
  await d.run(
    `INSERT INTO messages (account_id, remote_id, subject, from_name, from_email, to_json, snippet, body_text, body_html, message_date, read, starred, important, labels, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
     ON CONFLICT (account_id, remote_id) DO UPDATE SET
       subject = excluded.subject,
       from_name = excluded.from_name,
       from_email = excluded.from_email,
       to_json = excluded.to_json,
       snippet = excluded.snippet,
       message_date = excluded.message_date,
       important = excluded.important,
       labels = excluded.labels`,
    [
      accountId,
      remoteId,
      parsed.subject,
      parsed.fromName,
      parsed.fromEmail,
      JSON.stringify(parsed.toEmails),
      snippetFrom(parsed.bodyText),
      parsed.bodyText.slice(0, 200_000),
      parsed.bodyHtml.slice(0, 400_000),
      parsed.date,
      labelIds.includes("STARRED") ? 1 : 0,
      important ? 1 : 0,
      JSON.stringify(labels),
      Date.now(),
    ]
  );
}
