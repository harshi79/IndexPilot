import type { Db } from "../db";
import { streamChat, type ChatMessage, type ToolCall } from "../ai/chat";
import { providerMeta, type ProviderId } from "../ai/models";
import { executors, toolDefsList, type AgentCtx, type ToolOutcome } from "./tools";
import { buildSystemPrompt } from "./system";
import type { Account } from "../mail/types";

export interface AgentEvent {
  type: "delta" | "tool_start" | "tool_done" | "done" | "error";
  text?: string;
  call?: ToolCall;
  outcome?: ToolOutcome;
}

export interface ProviderChoice {
  id: ProviderId;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface RunInput {
  userId: number;
  user: { name: string | null; email: string };
  accounts: Account[];
  history: ChatMessage[];
  userText: string;
  provider: ProviderChoice | null;
  signal?: AbortSignal;
}

function trimHistory(history: ChatMessage[]): ChatMessage[] {
  const last = history.slice(-12);
  return last.map((m) => ({ ...m, content: m.content.slice(0, 6000) }));
}

async function llmPath(input: RunInput, emit: (e: AgentEvent) => void, ctx: AgentCtx): Promise<string> {
  const meta = providerMeta(input.provider!.id)!;
  const system = buildSystemPrompt(input.user, input.accounts);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...trimHistory(input.history),
    { role: "user", content: input.userText },
  ];
  let finalText = "";
  for (let round = 0; round < 6; round++) {
    const result = await streamChat(
      {
        provider: meta,
        apiKey: input.provider!.apiKey,
        model: input.provider!.model,
        baseUrl: input.provider!.baseUrl,
        messages,
        tools: toolDefsList(),
        signal: input.signal,
      },
      {
        onDelta: (t) => emit({ type: "delta", text: t }),
        onToolCall: () => {},
      }
    );
    if (result.assistant.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: result.assistant.content,
        tool_calls: result.assistant.toolCalls,
      });
      for (const call of result.assistant.toolCalls) {
        emit({ type: "tool_start", call });
        let outcome: ToolOutcome;
        const fn = executors[call.name];
        if (!fn) {
          outcome = { ok: false, error: `Unknown tool: ${call.name}`, summary: "Unknown tool" };
        } else {
          try {
            outcome = await fn(ctx, call.args);
          } catch (e) {
            outcome = { ok: false, error: (e as Error).message, summary: "Tool error" };
          }
        }
        emit({ type: "tool_done", call, outcome });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(outcome.ok ? outcome.result ?? outcome.summary : outcome.error),
        });
      }
      continue;
    }
    finalText += result.assistant.content;
    break;
  }
  return finalText;
}

// ── Demo brain: fully offline, works with zero credentials ───────────────

interface Overview {
  account: string;
  total: number;
  unread: number;
  important_unread: number;
  newest_unread: {
    id: number; subject: string; from: string; from_email: string;
    time: string; important: boolean; labels: string[]; snippet: string;
  }[];
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function draftBodyFor(subject: string, fromName: string): { subject: string; body: string } {
  const first = fromName.split(" ")[0];
  const s = subject.toLowerCase();
  let body: string;
  if (/sign-off|approve|confirm|ok to/.test(s)) {
    body = `Hi ${first},\n\nConfirmed — approved on my end. Go ahead and lock it in today. If legal pushes back on anything, send it my way and I'll turn it around same-day.\n\nThanks,\nAlex`;
  } else if (/invoice|payment|due|bill/.test(s)) {
    body = `Hi ${first},\n\nGot it — the invoice is scheduled for payment on the due date. I'll flag anything if the amount looks off, but everything checks out on our side.\n\nThanks,\nAlex`;
  } else if (/flight|hotel|trip|ticket/.test(s)) {
    body = `Hi ${first},\n\nNoted on the change. The new time works for me — no action needed from my side.\n\nThanks,\nAlex`;
  } else if (/dinner|lunch|weekend|party|trip/.test(s)) {
    body = `Hey ${first},\n\nThursday works — I'm in. See you then!\n\nAlex`;
  } else if (/urgent|renew|domain/.test(s)) {
    body = `Hi ${first},\n\nOn it — I've renewed (will confirm once the confirmation comes through). No further action needed on your end.\n\nThanks,\nAlex`;
  } else {
    body = `Hi ${first},\n\nThanks for the note — reviewing this now and will get back to you shortly with a decision.\n\nThanks,\nAlex`;
  }
  return {
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    body,
  };
}

async function demoBrain(input: RunInput, emit: (e: AgentEvent) => void, ctx: AgentCtx): Promise<string> {
  const text = input.userText.toLowerCase();
  const ovRaw = await executors.get_inbox_overview(ctx, {});
  const ov = ovRaw.result as Overview;

  let reply = "";
  let extraActions: { call: ToolCall; outcome: ToolOutcome }[] = [];

  const listLines = (items: Overview["newest_unread"], n: number) =>
    items.slice(0, n).map(
      (m, i) =>
        `${i + 1}. **${m.subject}** — ${m.from} (${relTime(m.time)})${m.important ? " · important" : ""}`
    );

  if (/(draft|reply|respond|answer|write back)/.test(text)) {
    const target = ov.newest_unread.find((m) => m.important && !/newsletter|digest|statement/.test(m.subject.toLowerCase())) ?? ov.newest_unread[0];
    if (target) {
      const { subject, body } = draftBodyFor(target.subject, target.from);
      const outcome = await executors.create_draft(ctx, { mail_id: target.id, body, subject });
      extraActions.push({
        call: { id: "demo-draft", name: "create_draft", args: { mail_id: target.id, subject } },
        outcome,
      });
      reply = `Here's a draft replying to **${target.from}** on “${target.subject}” (${relTime(target.time)}):\n\n---\n${body}\n---\n\nSaved to Drafts — open it to tweak the tone or hit send. Want me to adjust anything (shorter, warmer, firmer)?`;
    } else {
      reply = `Nothing unread worth replying to right now — your inbox is clear. Tell me who you'd like to email and I'll draft it.`;
    }
  } else if (/(clean|organiz|archive|triage|declutter|batch)/.test(text)) {
    const plan = (await executors.propose_plan(ctx, {})).result as {
      id: number; subject: string; action: string;
    }[];
    const archiveTargets = plan.filter((p) => p.action === "archive").slice(0, 4);
    for (const t of archiveTargets) {
      extraActions.push({
        call: { id: `demo-arch-${t.id}`, name: "set_status", args: { mail_id: t.id, archived: true } },
        outcome: await executors.set_status(ctx, { mail_id: t.id, archived: true }),
      });
    }
    const financeTargets = ov.newest_unread.filter((m) => m.labels.includes("Finance")).slice(0, 2);
    for (const t of financeTargets) {
      extraActions.push({
        call: { id: `demo-fin-${t.id}`, name: "apply_label", args: { mail_id: t.id, label: "Needs payment check" } },
        outcome: await executors.apply_label(ctx, { mail_id: t.id, label: "Needs payment check" }),
      });
    }
    reply = `Here's your inbox after a quick triage pass on ${ov.account}:\n\n• Archived ${archiveTargets.length} newsletter/digest item(s) — they're in Archive if you want them back.\n• Tagged ${financeTargets.length} finance email(s) for payment review.\n• Left everything in Work/Personal threads untouched — those need your actual reply.\n\nUnread now: ${Math.max(0, ov.unread - archiveTargets.length)}. Want me to draft replies for the top threads?`;
  } else if (/(attention|urgent|important|priority|what should|focus|today)/.test(text)) {
    const plan = (await executors.propose_plan(ctx, {})).result as {
      priority: number; subject: string; from: string; action: string; why: string;
    }[];
    const top = plan.slice(0, 5);
    reply = `What needs you, in priority order:\n\n${top
      .map((p, i) => `${i + 1}. **${p.subject}** — ${p.from}\n   Suggested: *${p.action}* — ${p.why}`)
      .join("\n")}\n\nTop move: handle #1 while it's fresh. I can draft that reply now if you say the word.`;
  } else if (/(sender|who|most|frequent|noisy)/.test(text)) {
    const senders = (await executors.get_senders(ctx, { limit: 6 })).result as {
      from_name: string; total: number; unread: number;
    }[];
    reply = `Who's filling ${ov.account}:\n\n${senders
      .map((s, i) => `${i + 1}. ${s.from_name} — ${s.total} emails (${s.unread} unread)`)
      .join("\n")}\n\nIf any of those feel noisy, I can auto-archive their newsletters in one pass.`;
  } else if (/(search|find|look for)/.test(text)) {
    const q = input.userText.replace(/\b(search|find|look for|look up|for|the|about)\b/gi, "").trim().slice(0, 60);
    if (q) {
      const res = await executors.search_mail(ctx, { query: q, limit: 6 });
      const rows = (res.result ?? []) as { subject: string; from: string; time: string }[];
      reply = rows.length
        ? `Found ${rows.length} match(es) for “${q}”:\n\n${rows
            .map((r, i) => `${i + 1}. **${r.subject}** — ${r.from} (${relTime(r.time)})`)
            .join("\n")}\n\nWant me to open one, draft a reply, or file them under a label?`
        : `No matches for “${q}”. Try a different keyword — sender names work well too.`;
    }
  } else if (/^(hi|hey|hello|yo|sup)\b/.test(text) && text.length < 40) {
    reply = `Hey. ${ov.unread} unread in ${ov.account}, ${ov.important_unread} of them important. I can give you a rundown, draft replies, or clean up the noise — what are we doing?`;
  } else {
    const top = ov.newest_unread.slice(0, 4);
    reply = `Here's the state of play in ${ov.account}:\n\n**${ov.total} emails · ${ov.unread} unread · ${ov.important_unread} important**\n\n${listLines(top, 4)}\n\nTry me with:\n• “What needs my attention today?”\n• “Draft a reply to the most important one”\n• “Clean up the newsletters”\n• “Find emails about launch”`;
  }

  // Simulate a light stream so the UI behaves identically in demo mode.
  for (const piece of reply.match(/[\s\S]{1,24}/g) ?? []) {
    emit({ type: "delta", text: piece });
    await new Promise((r) => setTimeout(r, 4));
  }
  for (const a of extraActions) {
    emit({ type: "tool_start", call: a.call });
    emit({ type: "tool_done", call: a.call, outcome: a.outcome });
  }
  return reply;
}

export async function runAgent(input: RunInput, emit: (e: AgentEvent) => void): Promise<string> {
  const ctx: AgentCtx = {
    userId: input.userId,
    accounts: input.accounts,
    db: (await import("../db")).db(),
  };
  try {
    if (input.provider) {
      const text = await llmPath(input, emit, ctx);
      if (text) emit({ type: "delta", text: "" }); // marker: stream finished cleanly
      return text;
    }
    return await demoBrain(input, emit, ctx);
  } catch (e) {
    const msg = (e as Error).message || "Agent error";
    emit({ type: "error", text: msg });
    throw e;
  }
}
