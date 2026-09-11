import type { Db } from "../db";
import type { Account } from "../mail/types";
import {
  accessTokenFor,
  buildMime,
  b64urlEncode,
  createDraftGmail,
  GmailError,
  modifyGmailMessage,
  sendRawGmail,
} from "../mail/gmail";
import type { ToolDef } from "../ai/chat";

export interface AgentCtx {
  userId: number;
  accounts: Account[];
  db: Db;
}

export interface ToolOutcome {
  ok: boolean;
  result?: unknown;
  error?: string;
  summary: string;
}

interface MailRow {
  id: number;
  account_id: number;
  remote_id: string | null;
  subject: string;
  from_name: string;
  from_email: string;
  snippet: string;
  body_text: string | null;
  message_date: number;
  read: number;
  starred: number;
  important: number;
  archived: number;
  trashed: number;
  labels: string;
  account_email: string;
  account_label: string | null;
  account_kind: string;
  account_access_token: string | null;
  account_refresh_token: string | null;
  account_token_expiry: number | null;
  account_client_id: string | null;
  account_client_secret: string | null;
}

const MAIL_SELECT = `
  SELECT m.id, m.account_id, m.remote_id, m.subject, m.from_name, m.from_email,
         m.snippet, m.body_text, m.message_date, m.read, m.starred, m.important,
         m.archived, m.trashed, m.labels,
         a.email AS account_email, a.label AS account_label, a.kind AS account_kind,
         a.access_token AS account_access_token, a.refresh_token AS account_refresh_token,
         a.token_expiry AS account_token_expiry, a.client_id AS account_client_id,
         a.client_secret AS account_client_secret
  FROM messages m JOIN accounts a ON a.id = m.account_id`;

async function findMail(ctx: AgentCtx, id: number): Promise<MailRow | undefined> {
  return ctx.db.get<MailRow>(
    `${MAIL_SELECT} WHERE m.id = ? AND a.user_id = ?`,
    [id, ctx.userId]
  );
}

export async function accountForEmail(ctx: AgentCtx, email?: string): Promise<Account> {
  if (email) {
    const acc = ctx.accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (acc) return acc;
  }
  return (
    ctx.accounts.find((a) => a.kind === "demo") ??
    ctx.accounts[0] ??
    (() => {
      throw new Error("No email account connected. Add one in Settings → Email.");
    })()
  );
}

function rowToSummary(r: MailRow) {
  return {
    id: r.id,
    account: r.account_email,
    subject: r.subject,
    from: r.from_name,
    from_email: r.from_email,
    time: new Date(r.message_date).toISOString(),
    read: !!r.read,
    starred: !!r.starred,
    important: !!r.important,
    archived: !!r.archived,
    labels: safeParse(r.labels),
    snippet: r.snippet,
  };
}

function safeParse(s: string | null): string[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Apply a status/label change to Gmail (best effort) then to the local row. */
async function applyStatusToRemote(r: MailRow, patch: { addLabels: string[]; removeLabels: string[] }): Promise<void> {
  const account = {
    kind: r.account_kind,
    provider: "gmail",
    email: r.account_email,
    label: r.account_label,
    access_token: r.account_access_token,
    refresh_token: r.account_refresh_token,
    token_expiry: r.account_token_expiry,
    client_id: r.account_client_id,
    client_secret: r.account_client_secret,
  } as Account;
  if (account.kind === "demo" || !r.remote_id) return;
  await modifyGmailMessage(account, r.remote_id, patch.addLabels, patch.removeLabels);
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_inbox_overview",
    description:
      "Get a snapshot of an email account: unread/total counts, important items, and the newest unread messages. Start here to understand what needs attention.",
    parameters: {
      type: "object",
      properties: {
        account_email: { type: "string", description: "Account to inspect (optional; defaults to the first account)" },
      },
    },
  },
  {
    name: "search_mail",
    description: "Search email subjects, senders, and snippets by keyword.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword(s) to search for" },
        account_email: { type: "string" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_mail",
    description: "Read the full text of one email by its numeric id (from overview/search results).",
    parameters: {
      type: "object",
      properties: {
        mail_id: { type: "number", description: "The message id" },
      },
      required: ["mail_id"],
    },
  },
  {
    name: "set_status",
    description:
      "Change an email's state: mark read/unread, star/unstar, archive, or trash. Only do what the user asked for.",
    parameters: {
      type: "object",
      properties: {
        mail_id: { type: "number" },
        read: { type: "boolean" },
        starred: { type: "boolean" },
        archived: { type: "boolean" },
        trashed: { type: "boolean" },
      },
      required: ["mail_id"],
    },
  },
  {
    name: "apply_label",
    description: "Add or remove a custom label (e.g. Work, Finance, Travel) on an email.",
    parameters: {
      type: "object",
      properties: {
        mail_id: { type: "number" },
        label: { type: "string" },
        add: { type: "boolean", description: "true to add (default), false to remove" },
      },
      required: ["mail_id", "label"],
    },
  },
  {
    name: "get_senders",
    description: "List the most frequent senders with counts and unread totals.",
    parameters: {
      type: "object",
      properties: {
        account_email: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "create_draft",
    description:
      "Save a reply or new email as a draft. You write the body yourself — put the full email text in `body`. Use mail_id to reply to an existing email.",
    parameters: {
      type: "object",
      properties: {
        mail_id: { type: "number", description: "Email being replied to (optional for new mail)" },
        subject: { type: "string", description: "Reply subject (defaults to 'Re: …')" },
        body: { type: "string", description: "Full email body text" },
        to_email: { type: "string", description: "Recipient for new mail (defaults to the original sender on reply)" },
      },
      required: ["body"],
    },
  },
  {
    name: "send_mail",
    description:
      "SEND a real email. Only call this when the user explicitly asked to send (not to draft). The draft/text must already be agreed with the user.",
    parameters: {
      type: "object",
      properties: {
        to_email: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to_email", "subject", "body"],
    },
  },
  {
    name: "propose_plan",
    description:
      "Build a prioritized action plan for the inbox (what to answer, archive, and follow up on) without executing anything. Present it as suggestions the user can approve.",
    parameters: { type: "object", properties: {} },
  },
];

// ── Executors ─────────────────────────────────────────────────────────────

type Executor = (ctx: AgentCtx, args: Record<string, unknown>) => Promise<ToolOutcome>;

export const executors: Record<string, Executor> = {
  async get_inbox_overview(ctx, args) {
    const acc = await accountForEmail(ctx, args.account_email as string | undefined);
    const base = `FROM messages m JOIN accounts a ON a.id=m.account_id WHERE m.account_id = ? AND a.user_id = ? AND m.trashed = 0`;
    const total = (await ctx.db.get<{ c: number }>(`SELECT COUNT(*) c ${base}`, [acc.id, ctx.userId]))?.c ?? 0;
    const unread = (await ctx.db.get<{ c: number }>(`SELECT COUNT(*) c ${base} AND m.read = 0 AND m.archived = 0`, [acc.id, ctx.userId]))?.c ?? 0;
    const important = (await ctx.db.get<{ c: number }>(`SELECT COUNT(*) c ${base} AND m.important = 1 AND m.read = 0`, [acc.id, ctx.userId]))?.c ?? 0;
    const newest = await ctx.db.all<MailRow>(
      `${MAIL_SELECT} WHERE m.account_id = ? AND a.user_id = ? AND m.read = 0 AND m.archived = 0 AND m.trashed = 0 ORDER BY m.message_date DESC LIMIT 6`,
      [acc.id, ctx.userId]
    );
    return {
      ok: true,
      summary: `Inbox for ${acc.email}: ${total} messages, ${unread} unread, ${important} important unread.`,
      result: {
        account: acc.email,
        total,
        unread,
        important_unread: important,
        newest_unread: newest.map(rowToSummary),
      },
    };
  },

  async search_mail(ctx, args) {
    const acc = await accountForEmail(ctx, args.account_email as string | undefined);
    const limit = Math.min(Number(args.limit ?? 10), 25);
    const q = `%${String(args.query ?? "")}%`;
    const rows = await ctx.db.all<MailRow>(
      `${MAIL_SELECT} WHERE m.account_id = ? AND a.user_id = ? AND m.trashed = 0
       AND (m.subject LIKE ? COLLATE NOCASE OR m.from_name LIKE ? COLLATE NOCASE OR m.snippet LIKE ? COLLATE NOCASE)
       ORDER BY m.message_date DESC LIMIT ?`,
      [acc.id, ctx.userId, q, q, q, limit]
    );
    return {
      ok: true,
      summary: `${rows.length} message(s) matching “${args.query}”.`,
      result: rows.map(rowToSummary),
    };
  },

  async read_mail(ctx, args) {
    const r = await findMail(ctx, Number(args.mail_id));
    if (!r) return { ok: false, error: `Message ${args.mail_id} not found.`, summary: "Not found" };
    await ctx.db.run("UPDATE messages SET read = 1 WHERE id = ?", [r.id]);
    return {
      ok: true,
      summary: `Read “${r.subject}” from ${r.from_name}.`,
      result: { ...rowToSummary(r), body: (r.body_text || "").slice(0, 8000) },
    };
  },

  async set_status(ctx, args) {
    const r = await findMail(ctx, Number(args.mail_id));
    if (!r) return { ok: false, error: `Message ${args.mail_id} not found.`, summary: "Not found" };
    const patches: { col: string; val: number }[] = [];
    const add: string[] = [];
    const remove: string[] = [];
    const setCol = (col: "read" | "starred" | "archived" | "trashed", v: boolean | undefined) => {
      if (v === undefined) return;
      patches.push({ col, val: v ? 1 : 0 });
    };
    setCol("read", args.read as boolean | undefined);
    setCol("starred", args.starred as boolean | undefined);
    setCol("archived", args.archived as boolean | undefined);
    setCol("trashed", args.trashed as boolean | undefined);
    if (args.read === true) remove.push("UNREAD");
    if (args.read === false) add.push("UNREAD");
    if (args.starred === true) add.push("STARRED");
    if (args.starred === false) remove.push("STARRED");
    if (args.archived === true) add.push("ARCHIVED");
    if (args.archived === false) {
      add.push("INBOX");
      remove.push("ARCHIVED");
    }
    if (args.trashed === true) add.push("TRASH");
    if (args.trashed === false) {
      add.push("INBOX");
      remove.push("TRASH");
    }
    try {
      await applyStatusToRemote(r, { addLabels: add, removeLabels: remove });
    } catch (e) {
      return { ok: false, error: `Remote update failed: ${(e as Error).message}`, summary: "Remote failed" };
    }
    if (patches.length) {
      await ctx.db.run(
        `UPDATE messages SET ${patches.map((p) => `${p.col} = ?`).join(", ")} WHERE id = ?`,
        [...patches.map((p) => p.val), r.id]
      );
    }
    const bits = patches.map((p) => (p.val ? p.col : `un${p.col === "trashed" ? "trashed" : p.col}`)).join(", ") || "state";
    return { ok: true, summary: `Updated message ${r.id}: ${bits}.`, result: { id: r.id, subject: r.subject } };
  },

  async apply_label(ctx, args) {
    const r = await findMail(ctx, Number(args.mail_id));
    if (!r) return { ok: false, error: `Message ${args.mail_id} not found.`, summary: "Not found" };
    const label = String(args.label ?? "").trim();
    if (!label) return { ok: false, error: "Label is empty.", summary: "No label" };
    const labels = safeParse(r.labels);
    const add = args.add !== false;
    if (add && !labels.includes(label)) labels.push(label);
    if (!add) {
      const i = labels.indexOf(label);
      if (i >= 0) labels.splice(i, 1);
    }
    await ctx.db.run("UPDATE messages SET labels = ? WHERE id = ?", [JSON.stringify(labels), r.id]);
    return { ok: true, summary: `${add ? "Added" : "Removed"} label “${label}” on “${r.subject}”.`, result: { id: r.id, labels } };
  },

  async get_senders(ctx, args) {
    const acc = await accountForEmail(ctx, args.account_email as string | undefined);
    const limit = Math.min(Number(args.limit ?? 8), 20);
    const rows = await ctx.db.all<{
      from_name: string; from_email: string; total: number; unread: number;
    }>(
      `SELECT m.from_name, m.from_email, COUNT(*) AS total, SUM(CASE WHEN m.read = 0 THEN 1 ELSE 0 END) AS unread
       FROM messages m JOIN accounts a ON a.id=m.account_id
       WHERE m.account_id = ? AND a.user_id = ? AND m.trashed = 0
       GROUP BY m.from_email ORDER BY total DESC LIMIT ?`,
      [acc.id, ctx.userId, limit]
    );
    return { ok: true, summary: `Top senders for ${acc.email}.`, result: rows };
  },

  async create_draft(ctx, args) {
    const acc = await accountForEmail(ctx, args.account_email as string | undefined);
    const body = String(args.body ?? "").trim();
    if (!body) return { ok: false, error: "Draft body is empty.", summary: "Empty draft" };
    let toEmail = (args.to_email as string | undefined) ?? "";
    let toName = "";
    let subject = (args.subject as string | undefined) ?? "";
    let messageId: number | null = args.mail_id ? Number(args.mail_id) : null;
    if (messageId) {
      const src = await findMail(ctx, messageId);
      if (!src) return { ok: false, error: `Message ${args.mail_id} not found.`, summary: "Reply target missing" };
      toEmail = toEmail || src.from_email;
      toName = src.from_name;
      subject = subject || (src.subject.startsWith("Re:") ? src.subject : `Re: ${src.subject}`);
    }
    if (!toEmail) return { ok: false, error: "Recipient missing for a new mail.", summary: "No recipient" };
    const ins = await ctx.db.run(
      `INSERT INTO drafts (user_id, account_id, message_id, to_email, to_name, subject, body, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [ctx.userId, acc.id, messageId, toEmail, toName, subject, body, Date.now()]
    );
    // Best-effort push to a real Gmail account.
    if (acc.kind !== "demo") {
      try {
        const token = await accessTokenFor(acc);
        if (token) await createDraftGmail(acc, b64urlEncode(buildMime({ from: acc.email, to: toEmail, subject, body })));
      } catch {
        /* local draft still saved */
      }
    }
    return {
      ok: true,
      summary: `Draft saved for ${toName || toEmail}: “${subject}”.`,
      result: { draft_id: ins.lastInsertRowid, to: toEmail, subject, body: body.slice(0, 1200) },
    };
  },

  async send_mail(ctx, args) {
    const acc = await accountForEmail(ctx);
    const to = String(args.to_email ?? "");
    const subject = String(args.subject ?? "(no subject)");
    const body = String(args.body ?? "");
    if (!to || !body) return { ok: false, error: "Recipient and body are required.", summary: "Missing fields" };
    if (acc.kind === "demo") {
      const ins = await ctx.db.run(
        `INSERT INTO drafts (user_id, account_id, to_email, subject, body, status, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)`,
        [ctx.userId, acc.id, to, subject, body, Date.now(), Date.now()]
      );
      return { ok: true, summary: `Demo mode: email to ${to} marked as sent (no real delivery).`, result: { id: ins.lastInsertRowid, demo: true } };
    }
    try {
      const res = await sendRawGmail(acc, b64urlEncode(buildMime({ from: acc.email, to, subject, body })));
      await ctx.db.run(
        `INSERT INTO drafts (user_id, account_id, to_email, subject, body, status, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)`,
        [ctx.userId, acc.id, to, subject, body, Date.now(), Date.now()]
      );
      return { ok: true, summary: `Sent to ${to} (${res.id}).`, result: { id: res.id } };
    } catch (e) {
      const msg = e instanceof GmailError ? e.message : (e as Error).message;
      return { ok: false, error: `Send failed: ${msg}`, summary: "Send failed" };
    }
  },

  async propose_plan(ctx) {
    const acc = await accountForEmail(ctx);
    const unread = await ctx.db.all<MailRow>(
      `${MAIL_SELECT} WHERE m.account_id = ? AND a.user_id = ? AND m.read = 0 AND m.archived = 0 AND m.trashed = 0
       ORDER BY m.important DESC, m.message_date DESC LIMIT 20`,
      [acc.id, ctx.userId]
    );
    const plan = unread.map((r, i) => {
      const labels = safeParse(r.labels);
      let action = "reply";
      let why = r.snippet;
      if (labels.includes("News")) {
        action = "archive";
        why = "Newsletter — archive and skip.";
      } else if (labels.includes("Finance")) {
        action = "review";
        why = "Money-related — review, then archive.";
      } else if (/^(re:)/i.test(r.subject) || r.important) {
        action = "reply";
        why = "Active thread or important — reply soon.";
      } else {
        action = "review";
        why = r.snippet;
      }
      return { priority: i + 1, id: r.id, subject: r.subject, from: r.from_name, action, why };
    });
    return { ok: true, summary: `Plan with ${plan.length} suggested actions.`, result: plan };
  },
};

export function toolDefsList(): ToolDef[] {
  return TOOL_DEFS;
}
