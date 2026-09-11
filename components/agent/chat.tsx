"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { Markdown } from "../markdown";
import { Spinner, toast } from "../ui";

interface ToolEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  state: "running" | "done";
  ok?: boolean;
  summary?: string;
  error?: string | null;
}

type Block =
  | { type: "text"; text: string }
  | { type: "tool"; tool: ToolEvent };

interface ChatMsg {
  role: "user" | "assistant";
  blocks: Block[];
  model?: string;
  error?: string;
}

interface Conversation {
  id: number;
  title: string;
  last_at: number | null;
  last_preview: string;
}

const SUGGESTIONS = [
  "What needs my attention today?",
  "Draft a reply to the most important email",
  "Clean up the newsletters in my inbox",
  "Who's filling up my inbox the most?",
];

export function AgentChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [modelBadge, setModelBadge] = useState<string>("indexpilot-demo");
  const [providerChoice, setProviderChoice] = useState<string>("");
  const [providers, setProviders] = useState<{ provider: string; has_key: boolean; enabled: boolean }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [cres, pres] = await Promise.all([fetch("/api/agent/conversations"), fetch("/api/me")]);
        const cj = await cres.json();
        setConversations(cj.conversations ?? []);
        const pj = await pres.json();
        setProviders((pj.providers ?? []).map((p: { provider: string; has_key: boolean; enabled: boolean }) => ({
          provider: p.provider,
          has_key: p.has_key,
          enabled: p.enabled,
        })));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const openConversation = useCallback(
    async (id: number | null) => {
      setActiveId(id);
      setMessages([]);
      if (id === null) return;
      try {
        const res = await fetch(`/api/agent/conversations/${id}`);
        const j = await res.json();
        setMessages(
          (j.messages ?? []).map((m: { role: string; content: string; tools: { name: string; summary: string; ok: boolean }[] }) => ({
            role: m.role,
            blocks: [
              ...(m.content
                ? [{ type: "text" as const, text: m.content }]
                : []),
              ...(m.tools ?? []).map<Block>((t) => ({
                type: "tool" as const,
                tool: { id: `h${t.name}`, name: t.name, args: {}, state: "done" as const, ok: t.ok, summary: t.summary },
              })),
            ],
          }))
        );
      } catch {
        /* ignore */
      }
    },
    []
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || streaming) return;
      setInput("");
      const userMsg: ChatMsg = { role: "user", blocks: [{ type: "text", text: msg }] };
      const assistant: ChatMsg = { role: "assistant", blocks: [] };
      setMessages((prev) => [...prev, userMsg, assistant]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: activeId,
            message: msg,
            provider: providerChoice ? { id: providerChoice } : undefined,
          }),
          signal: controller.signal,
        });
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              let ev: Record<string, unknown>;
              try {
                ev = JSON.parse(line.slice(6));
              } catch {
                continue;
              }
              if (ev.type === "conversation" && typeof ev.id === "number") {
                if (!activeId) {
                  setActiveId(ev.id);
                }
                if (typeof ev.model === "string") setModelBadge(ev.model);
              } else if (ev.type === "delta" && typeof ev.text === "string") {
                const text = ev.text;
                setMessages((prev) => {
                  const next = [...prev];
                  const m = next[prev.length - 1];
                  if (!m) return prev;
                  const blocks = [...m.blocks];
                  const last = blocks[blocks.length - 1];
                  if (last && last.type === "text") blocks[blocks.length - 1] = { type: "text", text: last.text + text };
                  else blocks.push({ type: "text", text });
                  next[prev.length - 1] = { ...m, blocks };
                  return next;
                });
              } else if (ev.type === "tool_start" && ev.id) {
                setMessages((prev) => {
                  const next = [...prev];
                  const m = next[prev.length - 1];
                  if (!m) return prev;
                  next[prev.length - 1] = {
                    ...m,
                    blocks: [
                      ...m.blocks,
                      {
                        type: "tool" as const,
                        tool: { id: String(ev.id), name: String(ev.name), args: (ev.args as Record<string, unknown>) ?? {}, state: "running" as const },
                      },
                    ],
                  };
                  return next;
                });
              } else if (ev.type === "tool_done" && ev.id) {
                const doneId = String(ev.id);
                const ok = Boolean(ev.ok);
                const summary = typeof ev.summary === "string" ? ev.summary : "";
                const err = typeof ev.error === "string" ? ev.error : null;
                setMessages((prev) => {
                  const next = [...prev];
                  const m = next[prev.length - 1];
                  if (!m) return prev;
                  next[prev.length - 1] = {
                    ...m,
                    blocks: m.blocks.map((b) =>
                      b.type === "tool" && b.tool.id === doneId
                        ? { type: "tool", tool: { ...b.tool, state: "done" as const, ok, summary, error: err } }
                        : b
                    ),
                  };
                  return next;
                });
              } else if (ev.type === "error" && typeof ev.text === "string") {
                const errText = ev.text;
                setMessages((prev) => {
                  const next = [...prev];
                  const m = next[prev.length - 1];
                  if (!m) return prev;
                  next[prev.length - 1] = { ...m, error: errText };
                  return next;
                });
                toast("error", errText);
              }
            }
          }
        }
        void openConversation(activeId ?? null);
        const cres = await fetch("/api/agent/conversations");
        const cj = await cres.json();
        setConversations(cj.conversations ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          toast("error", (e as Error).message || "Chat failed");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, input, providerChoice, streaming, openConversation]
  );

  const stop = () => abortRef.current?.abort();

  const deleteConversation = async (id: number) => {
    await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  };

  const anyKey = providers.some((p) => p.has_key && p.enabled);
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-[46px] items-center justify-between border-b border-line px-3">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Conversations</span>
          <button className="icon-btn !h-7 !w-7" title="New chat" aria-label="New chat" onClick={() => openConversation(null)}>
            <Plus size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <button className={`nav-item !text-[12.5px] ${activeId === null ? "" : ""}`} data-active={activeId === null && !streaming} onClick={() => openConversation(null)}>
            <Sparkles size={14} className="text-accent" />
            New chat
          </button>
          {conversations.map((c) => (
            <div key={c.id} className="group relative">
              <button className="nav-item w-full !text-[12.5px]" data-active={activeId === c.id} onClick={() => openConversation(c.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.title}</span>
                  <span className="block truncate font-normal text-ink-3">{c.last_preview}</span>
                </span>
              </button>
              <button
                className="icon-btn absolute right-1 top-1/2 !h-6 !w-6 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                title="Delete conversation"
                aria-label="Delete conversation"
                onClick={() => void deleteConversation(c.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
            <Bot size={14} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[10.5px] font-semibold text-ink-2">{modelBadge}</p>
              <p className="text-[10px] text-ink-3">
                {anyKey ? "BYOK provider active" : "Demo brain — add a key in Settings"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="text-[13px] font-semibold text-ink">Copilot</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-accent">
            {anyKey ? "AI" : "demo"}
          </span>
          <span className="flex-1" />
          {providers.length > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
              Provider
              <select
                className="input !w-auto !py-1 text-[11.5px]"
                value={providerChoice}
                onChange={(e) => setProviderChoice(e.target.value)}
                aria-label="AI provider override"
                disabled={streaming}
              >
                <option value="">Auto (saved default)</option>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider} disabled={!p.has_key}>
                    {p.provider}{p.has_key ? "" : " (no key)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-4 py-5">
            {isEmpty ? (
              <div className="fade-up flex flex-col items-center pt-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-accent">
                  <Bot size={22} />
                </span>
                <h2 className="mt-4 text-[18px] font-bold tracking-tight text-ink">Your email chief of staff</h2>
                <p className="mt-1.5 max-w-[400px] text-[13px] leading-relaxed text-ink-3">
                  It reads your inbox, triages what matters, drafts replies you approve, and files the rest.
                  {anyKey
                    ? " Running on your own API keys — nothing routes through us."
                    : " Currently in demo mode: real actions on your demo inbox, canned brain. Add a key in Settings for full intelligence."}
                </p>
                <div className="mt-6 grid w-full max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-[12.5px] font-medium text-ink-2 transition-all hover:-translate-y-px hover:border-line-strong hover:text-ink"
                      onClick={() => void send(s)}
                    >
                      <Sparkles size={12} className="mb-1.5 text-accent" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((m, i) => (
                  <MessageRow key={i} m={m} streaming={streaming && i === messages.length - 1 && m.role === "assistant"} />
                ))}
                {streaming && messages.length > 0 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 1].blocks.length === 0 && (
                  <div className="flex items-center gap-2 text-[12px] text-ink-3">
                    <Spinner size={12} /> Thinking…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
          <div className="mx-auto max-w-[760px]">
            <div className="flex items-end gap-2 rounded-xl border border-line bg-surface-2 p-2 transition-colors focus-within:border-accent">
              <textarea
                className="max-h-[140px] min-h-[38px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
                placeholder="Ask your copilot to triage, draft, or clean up…"
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                aria-label="Message the copilot"
                disabled={streaming}
              />
              {streaming ? (
                <button className="icon-btn !h-8 !w-8 !bg-surface-3" title="Stop" aria-label="Stop" onClick={stop}>
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
                </button>
              ) : (
                <button className="btn btn-primary !h-8 !rounded-lg !px-3 !py-0" disabled={!input.trim()} onClick={() => void send()} aria-label="Send">
                  <Send size={14} />
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 font-mono text-[9.5px] text-ink-3">
              Enter to send · Shift+Enter for a new line · The copilot can read, label, archive, draft, and (with your explicit say-so) send.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ m, streaming }: { m: ChatMsg; streaming: boolean }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">
          {m.blocks
            .filter((b) => b.type === "text")
            .map((b, i) => (
              <p key={i}>{(b as { text: string }).text}</p>
            ))}
        </div>
      </div>
    );
  }
  return (
    <div className="fade-up flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-accent">
        <Bot size={14} />
      </span>
      <div className="min-w-0 flex-1">
        {m.blocks.map((b, i) =>
          b.type === "tool" ? (
            <ToolCard key={i} tool={b.tool} />
          ) : (
            <div key={i} className="pt-0.5">
              <Markdown text={b.text || (streaming ? "…" : "")} />
            </div>
          )
        )}
        {m.error && <p className="mt-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">{m.error}</p>}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolEvent }) {
  const pretty = useMemo(() => tool.name.replace(/_/g, " "), [tool.name]);
  return (
    <div className="my-1.5 flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
      <span className={`mt-0.5 ${tool.state === "running" ? "text-accent" : tool.ok ? "text-success" : "text-danger"}`}>
        {tool.state === "running" ? <Loader2 size={13} className="animate-spin" /> : tool.ok ? <Wrench size={13} /> : <Wrench size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
          <span className="font-mono">{pretty}</span>
          {tool.state === "running" ? (
            <span className="font-mono text-[9.5px] font-normal uppercase text-ink-3">running…</span>
          ) : (
            <span className={`flex items-center gap-1 font-mono text-[9.5px] font-normal uppercase ${tool.ok ? "text-success" : "text-danger"}`}>
              <Check size={10} /> {tool.ok ? "done" : "failed"}
            </span>
          )}
        </p>
        {tool.state === "done" && tool.summary && (
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{tool.summary}</p>
        )}
        {tool.state === "done" && tool.error && (
          <p className="mt-0.5 text-[11px] text-danger">{tool.error}</p>
        )}
      </div>
    </div>
  );
}
