export type MailView = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash";

export interface MailMessage {
  id: number;
  accountId: number;
  accountEmail: string;
  accountLabel: string | null;
  remoteId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  toEmails: string[];
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  date: number;
  read: boolean;
  starred: boolean;
  important: boolean;
  archived: boolean;
  trashed: boolean;
  labels: string[];
}

export interface NewMailInput {
  remoteId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  toEmails: string[];
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  date: number;
  read?: boolean;
  starred?: boolean;
  important?: boolean;
  archived?: boolean;
  trashed?: boolean;
  labels?: string[];
}

export interface Draft {
  id: number;
  accountId: number;
  message_id: number | null;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  body: string | null;
  status: "draft" | "sent";
  created_at: number;
  sent_at: number | null;
}

export type AccountKind = "demo" | "token" | "oauth";

export interface Account {
  id: number;
  userId: number;
  kind: AccountKind;
  provider: string;
  email: string;
  label: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  client_id: string | null;
  client_secret: string | null;
  extra: string;
  created_at: number;
}

export interface SyncedMessage extends NewMailInput {
  remoteId: string;
}
