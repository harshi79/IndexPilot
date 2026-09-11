import { NextResponse } from "next/server";
import type { MailMessage, Account, Draft } from "./mail/types";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

interface MessageRow {
  id: number;
  remote_id: string | null;
  subject: string;
  from_name: string;
  from_email: string;
  to_json: string;
  snippet: string;
  body_text: string | null;
  body_html: string | null;
  message_date: number;
  read: number;
  starred: number;
  important: number;
  archived: number;
  trashed: number;
  labels: string;
  account_email: string;
  account_label: string | null;
  account_id: number;
}

function parseArr(s: string | null): string[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function rowToMessage(r: MessageRow, withBody = false): MailMessage {
  return {
    id: r.id,
    accountId: r.account_id,
    accountEmail: r.account_email,
    accountLabel: r.account_label,
    remoteId: r.remote_id ?? "",
    subject: r.subject ?? "",
    fromName: r.from_name ?? "",
    fromEmail: r.from_email ?? "",
    toEmails: parseArr(r.to_json),
    snippet: r.snippet ?? "",
    bodyText: withBody ? r.body_text ?? "" : undefined,
    bodyHtml: withBody ? r.body_html ?? undefined : undefined,
    date: r.message_date ?? 0,
    read: !!r.read,
    starred: !!r.starred,
    important: !!r.important,
    archived: !!r.archived,
    trashed: !!r.trashed,
    labels: parseArr(r.labels),
  };
}

export function rowToAccount(r: {
  id: number;
  user_id: number;
  kind: string;
  provider: string;
  email: string;
  label: string | null;
  created_at: number;
}): Account {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind as Account["kind"],
    provider: r.provider,
    email: r.email,
    label: r.label,
    access_token: null,
    refresh_token: null,
    token_expiry: null,
    client_id: null,
    client_secret: null,
    extra: "{}",
    created_at: r.created_at,
  };
}

export function rowToDraft(r: {
  id: number;
  account_id: number;
  message_id: number | null;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  created_at: number;
  sent_at: number | null;
}): Draft {
  return {
    id: r.id,
    accountId: r.account_id,
    message_id: r.message_id,
    to_email: r.to_email,
    to_name: r.to_name,
    subject: r.subject,
    body: r.body,
    status: r.status as Draft["status"],
    created_at: r.created_at,
    sent_at: r.sent_at,
  };
}

export const MAIL_COLUMNS = `
  m.id, m.remote_id, m.subject, m.from_name, m.from_email, m.to_json, m.snippet,
  m.body_text, m.body_html, m.message_date, m.read, m.starred, m.important,
  m.archived, m.trashed, m.labels, a.email AS account_email, a.label AS account_label,
  m.account_id
`;

export const MAIL_FROM = `FROM messages m JOIN accounts a ON a.id = m.account_id`;
