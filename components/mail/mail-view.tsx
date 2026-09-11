"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Inbox as InboxIcon,
  MailPlus,
  RefreshCw,
  Search,
  Send,
  Star,
  Tag,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { MailMessage } from "@/lib/mail/types";
import { useApp } from "../shell";
import { Avatar, EmptyState, Spinner, fmtTime, timeAgo, toast } from "../ui";

type View = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash";

const VIEW_TITLES: Record<View, string> = {
  inbox: "Inbox",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  trash: "Trash",
};

interface DraftItem {
  id: number;
  accountId: number;
  message_id: number | null;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  created_at: number;
  sent_at: number | null;
  accountEmail: string;
  accountLabel: string | null;
}

export function MailView({ view }: { view: View }) {
  const { activeAccount, activeAccountId, refresh } = useApp();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState<MailMessage | null>(null);
  const [openDraft, setOpenDraft] = useState<DraftItem | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [composer, setComposer] = useState<{ to: string; subject: string; body: string; replyTo?: MailMessage; draftId?: number } | null>(null);
  const [labelMenu, setLabelMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!activeAccountId) {
        setMessages([]);
        setDrafts([]);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      if (activeAccount?.kind !== "demo") setSyncing(true);
      setError(null);
      try {
        if (view === "drafts") {
          const res = await fetch(`/api/drafts?account=${activeAccountId}&view=drafts`);
          const j = await res.json();
          setDrafts(j.drafts ?? []);
        } else if (view === "sent" && activeAccount?.kind === "demo") {
          const res = await fetch(`/api/drafts?account=${activeAccountId}&view=sent`);
          const j = await res.json();
          setDrafts(j.drafts ?? []);
          setMessages([]);
        } else {
          const res = await fetch(`/api/mail/inbox?account=${activeAccountId}&view=${view}&q=${encodeURIComponent(debounced)}`);
          const j = await res.json();
          if (j.error) setError(j.error);
          setMessages(j.messages ?? []);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [activeAccountId, activeAccount?.kind, view, debounced]
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setQuery("");
    setSelectedId(null);
    setOpen(null);
    setChecked(new Set());
  }, [view]);

  useEffect(() => {
    setSelectedId(null);
    setOpen(null);
    setChecked(new Set());
    void load();
  }, [load]);

  // Poll for fresh mail every 25s (inbox only).
  useEffect(() => {
    if (view !== "inbox") return;
    const t = setInterval(() => void load(true), 25000);
    return () => clearInterval(t);
  }, [view, load]);

  const act = useCallback(
    async (id: number, action: string, label?: string) => {
      const prev = messages;
      const idx = prev.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const m = prev[idx];
        const next = [...prev];
        next[idx] = {
          ...m,
          read: action === "unread" ? false : action === "read" ? true : m.read,
          starred: action === "star" ? true : action === "unstar" ? false : m.starred,
          archived: action === "archive" ? true : action === "unarchive" ? false : m.archived,
          trashed: action === "trash" ? true : action === "restore" ? false : m.trashed,
        };
        setMessages(next);
        if (open?.id === id) setOpen(next[idx]);
      }
      try {
        const res = await fetch(`/api/mail/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, label, add: true }),
        });
        const j = await res.json();
        if (!res.ok) {
          setError(j.error || "Action failed");
          toast("error", j.error || "Action failed");
        }
      } catch (e) {
        setMessages(prev);
        toast("error", (e as Error).message);
      }
    },
    [messages, open]
  );

  const bulkAct = useCallback(
    async (action: string, label?: string) => {
      const ids = [...checked];
      setChecked(new Set());
      for (const id of ids) await act(id, action, label);
      toast("success", `${ids.length} message${ids.length > 1 ? "s" : ""} updated`);
    },
    [checked, act]
  );

  const simulate = useCallback(async () => {
    try {
      const res = await fetch(`/api/mail/inbox/simulate?account=${activeAccountId}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        toast("error", j.error || "Simulation failed");
        return;
      }
      toast("success", `New mail from ${j.message.fromName}`);
      void load(true);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [activeAccountId, load]);

  // Keyboard: j/k move, a archive, s star, e reply, r mark read.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (composer || !messages.length) return;
      const i = messages.findIndex((m) => m.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const ni = Math.min(messages.length - 1, i + 1);
        selectRow(messages[Math.max(0, ni)]);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const ni = Math.max(0, i <= 0 ? 0 : i - 1);
        selectRow(messages[ni]);
      } else if (e.key === "a" && selectedId) void act(selectedId, "archive");
      else if (e.key === "s" && selectedId) void act(selectedId, messages[i]?.starred ? "unstar" : "star");
      else if (e.key === "e" && open) openComposer({ to: open.fromEmail, toName: open.fromName, subject: open.subject.startsWith("Re:") ? open.subject : `Re: ${open.subject}`, body: "", replyTo: open });
      else if (e.key === "r" && selectedId && messages[i] && !messages[i].read) void act(selectedId, "read");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedId, open, composer, act]);

  const selectRow = (m: MailMessage) => {
    setSelectedId(m.id);
    void (async () => {
      try {
        const res = await fetch(`/api/mail/${m.id}`);
        const j = await res.json();
        if (res.ok && j.message) {
          setOpen(j.message);
          if (!m.read) {
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
          }
        }
      } catch {
        /* reader will show cached snippet */
      }
    })();
  };

  const openComposer = (c: { to: string; toName?: string; subject: string; body: string; replyTo?: MailMessage; draftId?: number }) => {
    setComposer({ ...c, draftId: c.draftId });
  };

  const isDemo = activeAccount?.kind === "demo";
  const shown: (MailMessage | DraftItem)[] = view === "drafts" || (view === "sent" && isDemo) ? drafts : messages;

  return (
    <div className="flex h-full min-h-0">
      {/* List pane */}
      <div className={`flex min-w-0 flex-col border-r border-line md:w-[380px] md:shrink-0 ${open || openDraft ? "hidden md:flex" : "flex"} w-full`}>
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line px-3">
          <h1 className="text-[14px] font-semibold text-ink">{VIEW_TITLES[view]}</h1>
          {!loading && (
            <span className="font-mono text-[10.5px] text-ink-3">{shown.length}</span>
          )}
          <div className="flex-1" />
          {syncing && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-ink-3">
              <RefreshCw size={11} className="animate-spin" /> sync
            </span>
          )}
          {isDemo && view === "inbox" && (
            <button className="btn btn-secondary !px-2 !py-1 text-[11.5px]" onClick={simulate} title="Deliver a new sample email">
              <MailPlus size={13} />
              Simulate
            </button>
          )}
          <button className="icon-btn !h-7 !w-7" title="Refresh" aria-label="Refresh" onClick={() => void load()}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {view !== "drafts" && view !== "sent" && (
          <div className="shrink-0 border-b border-line p-2">
            <label className="relative block">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                className="input !py-1.5 !pl-8 text-[12.5px]"
                placeholder="Search subject or sender…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search mail"
              />
            </label>
          </div>
        )}

        {checked.size > 0 && (
          <div className="flex shrink-0 items-center gap-1 border-b border-line bg-accent-soft/60 px-2 py-1.5">
            <span className="mr-1 font-mono text-[10.5px] font-semibold text-accent">{checked.size}</span>
            <button className="icon-btn !h-7 !w-7" title="Archive" onClick={() => void bulkAct("archive")}><Archive size={13} /></button>
            <button className="icon-btn !h-7 !w-7" title="Trash" onClick={() => void bulkAct("trash")}><Trash2 size={13} /></button>
            <button className="icon-btn !h-7 !w-7" title="Mark read" onClick={() => void bulkAct("read")}><Check size={13} /></button>
            <span className="flex-1" />
            <button className="icon-btn !h-7 !w-7" title="Clear selection" onClick={() => setChecked(new Set())}><X size={13} /></button>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-ink-3"><Spinner size={16} /></div>
          ) : error ? (
            <div className="p-4 text-[12.5px] text-danger">{error}</div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={view === "inbox" ? <InboxIcon size={20} /> : view === "drafts" ? <FolderInput size={20} /> : <InboxIcon size={20} />}
              title={view === "inbox" ? "Inbox zero — nice." : view === "drafts" ? "No drafts" : "Nothing here"}
              hint={
                !activeAccount
                  ? "Connect a Gmail account (or use the demo inbox) in Settings to start."
                  : view === "inbox"
                    ? isDemo
                      ? "Hit “Simulate” to deliver a fresh email, or ask the Copilot what needs attention."
                      : "No messages in this folder right now."
                    : undefined
              }
            >
              {!activeAccount && (
                <a href="/app/settings?tab=email" className="btn btn-primary">Connect an account</a>
              )}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line" role="list">
              {shown.map((item) =>
                "remoteId" in item ? (
                  <MailRow
                    key={item.id}
                    m={item}
                    selected={selectedId === item.id}
                    checked={checked.has(item.id)}
                    view={view}
                    onSelect={() => selectRow(item)}
                    onCheck={() =>
                      setChecked((prev) => {
                        const n = new Set(prev);
                        if (n.has(item.id)) n.delete(item.id);
                        else n.add(item.id);
                        return n;
                      })
                    }
                    onStar={(e) => {
                      e.stopPropagation();
                      void act(item.id, item.starred ? "unstar" : "star");
                    }}
                  />
                ) : (
                  <DraftRow
                    key={item.id}
                    d={item}
                    selected={selectedId === item.id}
                    onSelect={() => {
                      setSelectedId(item.id);
                      setOpenDraft(item);
                    }}
                    sent={item.status === "sent"}
                  />
                )
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Reader pane */}
      <div className={`min-w-0 flex-1 flex-col ${open || openDraft ? "flex" : "hidden md:flex"}`}>
        {openDraft ? (
          <DraftReader
            draft={openDraft}
            onClose={() => setOpenDraft(null)}
            onEdit={(d) => {
              setOpenDraft(null);
              openComposer({ to: d.to_email || "", toName: d.to_name || undefined, subject: d.subject || "", body: d.body || "", draftId: d.id });
            }}
            onDelete={async () => {
              await fetch(`/api/drafts/${openDraft.id}`, { method: "DELETE" });
              setOpenDraft(null);
              toast("success", "Draft deleted");
              void load();
            }}
            onSend={async () => {
              try {
                const res = await fetch(`/api/drafts/${openDraft.id}`, { method: "POST" });
                const j = await res.json();
                if (!res.ok) {
                  toast("error", j.error || "Send failed");
                  return;
                }
                toast("success", isDemo ? "Sent (demo — no real delivery)" : "Sent");
                setOpenDraft(null);
                void load();
                refresh();
              } catch (e) {
                toast("error", (e as Error).message);
              }
            }}
          />
        ) : open ? (
          <MessageReader
            m={open}
            isDemo={isDemo}
            onBack={() => setOpen(null)}
            actions={
              <div className="flex items-center gap-0.5">
                <button className="icon-btn" title="Reply (e)" aria-label="Reply" onClick={() => openComposer({ to: open.fromEmail, toName: open.fromName, subject: open.subject.startsWith("Re:") ? open.subject : `Re: ${open.subject}`, body: "" })}>
                  <Send size={15} />
                </button>
                <button className="icon-btn" title="Archive (a)" aria-label="Archive" onClick={() => void act(open.id, "archive")}>
                  <Archive size={15} />
                </button>
                <button className="icon-btn" title={open.starred ? "Unstar" : "Star"} aria-label="Star" onClick={() => void act(open.id, open.starred ? "unstar" : "star")}>
                  <Star size={15} className={open.starred ? "fill-accent text-accent" : ""} />
                </button>
                <button
                  className="icon-btn relative"
                  title="Label"
                  aria-label="Label"
                  onClick={(e) => setLabelMenu({ id: open.id, x: e.clientX, y: e.clientY })}
                >
                  <Tag size={15} />
                </button>
                <span className="mx-1 h-4 w-px bg-line" />
                <button className="icon-btn" title={open.read ? "Mark unread" : "Mark read"} aria-label="Mark read" onClick={() => void act(open.id, open.read ? "unread" : "read")}>
                  <Check size={15} className={open.read ? "text-ink-3" : ""} />
                </button>
                <button className="icon-btn" title="Trash" aria-label="Trash" onClick={() => void act(open.id, "trash")}>
                  <Trash2 size={15} />
                </button>
              </div>
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
              <ChevronLeft size={14} /> Select a message
            </p>
          </div>
        )}
      </div>

      {composer && (
        <ComposerModal
          initial={composer}
          isDemo={isDemo}
          onClose={() => setComposer(null)}
          onSaved={async (sent) => {
            setComposer(null);
            if (sent) {
              toast("success", isDemo ? "Sent (demo — no real delivery)" : "Email sent");
            } else {
              toast("success", "Saved to drafts");
            }
            void load();
            refresh();
          }}
        />
      )}

      {labelMenu && (
        <LabelMenu
          x={labelMenu.x}
          y={labelMenu.y}
          onClose={() => setLabelMenu(null)}
          onPick={async (label) => {
            setLabelMenu(null);
            await act(labelMenu.id, "label", label);
            toast("success", `Labelled “${label}”`);
            if (open?.id === labelMenu.id) void load(true);
          }}
          current={open?.id === labelMenu.id ? open.labels : []}
        />
      )}
    </div>
  );
}

function MailRow({
  m,
  selected,
  checked,
  view,
  onSelect,
  onCheck,
  onStar,
}: {
  m: MailMessage;
  selected: boolean;
  checked: boolean;
  view: View;
  onSelect: () => void;
  onCheck: () => void;
  onStar: (e: React.MouseEvent) => void;
}) {
  const unread = !m.read && view === "inbox";
  return (
    <li
      className={`group relative flex cursor-pointer items-start gap-2 transition-colors ${
        selected ? "bg-accent-soft" : "hover:bg-surface-2"
      }`}
      style={{ padding: "var(--row-pad) 10px" }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      aria-label={`${m.fromName}: ${m.subject}`}
    >
      <span
        className={`mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-opacity ${
          checked ? "border-accent bg-accent opacity-100" : "border-line-strong opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onCheck();
        }}
      >
        {checked && <Check size={10} strokeWidth={3} className="text-accent-ink" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`truncate text-[13px] ${unread ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>
            {m.fromName || m.fromEmail}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-3">{fmtTime(m.date)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
          <span className={`truncate text-[12.5px] ${unread ? "text-ink" : "text-ink-2"}`}>
            {m.subject}
            {m.labels.slice(0, 2).map((l) => (
              <span key={l} className="ml-1.5 inline-block rounded bg-surface-3 px-1 py-px align-middle font-mono text-[9px] font-semibold uppercase tracking-wide text-ink-3">
                {l}
              </span>
            ))}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{m.snippet}</span>
      </span>
      {m.starred && <Star size={12} className="mt-1 shrink-0 fill-accent text-accent" />}
      <button
        className={`icon-btn !h-6 !w-6 shrink-0 ${m.starred ? "text-accent" : "opacity-0 group-hover:opacity-100"}`}
        title={m.starred ? "Unstar" : "Star"}
        onClick={onStar}
        aria-label={m.starred ? "Unstar" : "Star"}
      >
        <Star size={12} className={m.starred ? "fill-accent" : ""} />
      </button>
    </li>
  );
}

function DraftRow({
  d,
  selected,
  onSelect,
  sent,
}: {
  d: DraftItem;
  selected: boolean;
  onSelect: () => void;
  sent: boolean;
}) {
  return (
    <li
      className={`flex cursor-pointer items-start gap-2.5 transition-colors ${
        selected ? "bg-accent-soft" : "hover:bg-surface-2"
      }`}
      style={{ padding: "var(--row-pad) 10px" }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <Avatar seed={d.to_email || "draft"} size={26} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-ink-2">
            {sent ? "To: " : "Draft — "}
            {d.to_name || d.to_email || "(no recipient)"}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-3">
            {fmtTime(d.sent_at ?? d.created_at)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] font-medium text-ink">{d.subject || "(no subject)"}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{d.body}</span>
      </span>
    </li>
  );
}

function MessageReader({
  m,
  isDemo,
  onBack,
  actions,
}: {
  m: MailMessage;
  isDemo: boolean;
  onBack: () => void;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line px-3">
        <button className="icon-btn md:hidden" onClick={onBack} aria-label="Back to list">
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1 text-[12px] text-ink-3">
          <span className="font-mono">{m.accountLabel || m.accountEmail}</span>
          {isDemo && <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-ink-3">demo data</span>}
        </div>
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-8">
        <div className="mx-auto max-w-[720px]">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {m.important && <span className="badge badge-gold">Important</span>}
            {m.labels.map((l) => (
              <span key={l} className="badge">{l}</span>
            ))}
          </div>
          <h2 className="text-[19px] font-semibold leading-snug tracking-tight text-ink">{m.subject}</h2>
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar seed={m.fromEmail || m.fromName} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink">
                {m.fromName}
                {m.fromName && m.fromEmail !== m.fromName && (
                  <span className="ml-1.5 font-normal text-ink-3">&lt;{m.fromEmail}&gt;</span>
                )}
              </p>
              <p className="text-[11.5px] text-ink-3">
                to {m.toEmails.join(", ") || "me"} · {new Date(m.date).toLocaleString()}
              </p>
            </div>
            <span className="font-mono text-[11px] text-ink-3" title={new Date(m.date).toLocaleString()}>
              {timeAgo(m.date)}
            </span>
          </div>
          <div className="mt-5 border-t border-line pt-5">
            {m.bodyText ? (
              <div className="whitespace-pre-wrap text-[13.5px] leading-[1.65] text-ink">{m.bodyText}</div>
            ) : (
              <p className="text-[12.5px] italic text-ink-3">{m.snippet || "No body cached for this message yet."}</p>
            )}
          </div>
          <div className="mt-8 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
            <span className="font-semibold text-ink-2">Tip:</span> press <kbd className="rounded bg-surface-3 px-1 font-mono">e</kbd> to reply,{" "}
            <kbd className="rounded bg-surface-3 px-1 font-mono">a</kbd> to archive,{" "}
            <kbd className="rounded bg-surface-3 px-1 font-mono">s</kbd> to star,{" "}
            <kbd className="rounded bg-surface-3 px-1 font-mono">j/k</kbd> to move between messages.
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftReader({
  draft,
  onClose,
  onEdit,
  onDelete,
  onSend,
}: {
  draft: DraftItem;
  onClose: () => void;
  onEdit: (d: DraftItem) => void;
  onDelete: () => void;
  onSend: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line px-3">
        <button className="icon-btn md:hidden" onClick={onClose} aria-label="Back to list">
          <ChevronLeft size={16} />
        </button>
        <span className="flex-1 text-[12px] text-ink-3">
          {draft.status === "sent" ? "Sent mail" : "Draft"}
        </span>
        {draft.status !== "sent" ? (
          <>
            <button className="btn btn-secondary !py-1 text-[12px]" onClick={() => onEdit(draft)}>Edit</button>
            <button className="btn btn-danger !py-1 text-[12px]" onClick={onDelete}><Trash2 size={13} /> Delete</button>
            <button
              className="btn btn-primary !py-1 text-[12px]"
              disabled={sending}
              onClick={async () => {
                setSending(true);
                await onSend();
                setSending(false);
              }}
            >
              <Send size={13} /> {sending ? "Sending…" : "Send"}
            </button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-8">
        <div className="mx-auto max-w-[720px]">
          <p className="text-[12px] text-ink-3">To</p>
          <p className="text-[13.5px] font-medium text-ink">{draft.to_name ? `${draft.to_name} <${draft.to_email}>` : draft.to_email}</p>
          <h2 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">{draft.subject || "(no subject)"}</h2>
          <div className="mt-5 whitespace-pre-wrap border-t border-line pt-5 text-[13.5px] leading-[1.65] text-ink">
            {draft.body}
          </div>
        </div>
      </div>
    </div>
  );
}

const PRESET_LABELS = ["Work", "Finance", "Travel", "Personal", "News", "Follow-up", "Waiting on me"];

function LabelMenu({
  x,
  y,
  onClose,
  onPick,
  current,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onPick: (label: string) => void;
  current: string[];
}) {
  const [custom, setCustom] = useState("");
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-label-menu]")) onClose();
    };
    window.addEventListener("mousedown", on);
    return () => window.removeEventListener("mousedown", on);
  }, [onClose]);
  return (
    <div
      data-label-menu
      className="fixed z-50 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-pop"
      style={{ top: Math.min(y, window.innerHeight - 320), left: Math.min(x, window.innerWidth - 220) }}
      role="menu"
    >
      <p className="px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">Labels</p>
      {PRESET_LABELS.map((l) => (
        <button
          key={l}
          className="nav-item !px-2 text-[12.5px]"
          role="menuitem"
          onClick={() => onPick(l)}
        >
          <span className={`h-2 w-2 rounded-full ${current.includes(l) ? "bg-accent" : "bg-line-strong"}`} />
          {l}
          {current.includes(l) && <span className="ml-auto font-mono text-[9px] uppercase text-ink-3">applied</span>}
        </button>
      ))}
      <div className="mt-1 flex gap-1 border-t border-line pt-1.5 px-1">
        <input
          className="input !py-1 text-[12px]"
          placeholder="Custom label…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && custom.trim() && onPick(custom.trim())}
        />
        <button className="btn btn-secondary !px-2 !py-1 text-[11.5px]" disabled={!custom.trim()} onClick={() => onPick(custom.trim())}>
          Add
        </button>
      </div>
    </div>
  );
}

function ComposerModal({
  initial,
  isDemo,
  onClose,
  onSaved,
}: {
  initial: { to: string; toName?: string; subject: string; body: string; replyTo?: MailMessage; draftId?: number };
  isDemo: boolean;
  onClose: () => void;
  onSaved: (sent: boolean) => void;
}) {
  const { activeAccountId } = useApp();
  const [to, setTo] = useState(initial.to);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState<null | "save" | "send">(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => bodyRef.current?.focus(), []);

  const doSave = async (send: boolean) => {
    if (!to.trim() || !body.trim()) {
      toast("error", "Recipient and body are required.");
      return;
    }
    setBusy(send ? "send" : "save");
    try {
      if (initial.draftId) {
        await fetch(`/api/drafts/${initial.draftId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_email: to, subject, body }),
        });
        if (send) {
          const res = await fetch(`/api/drafts/${initial.draftId}`, { method: "POST" });
          const j = await res.json();
          if (!res.ok) {
            toast("error", j.error || "Send failed");
            setBusy(null);
            return;
          }
        }
      } else {
        const res = await fetch("/api/mail/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: activeAccountId, to_email: to, subject, body, send }),
        });
        const j = await res.json();
        if (!res.ok) {
          toast("error", j.error || "Failed to save draft");
          setBusy(null);
          return;
        }
        if (send) {
          const id = j.draft_id;
          const res2 = await fetch(`/api/drafts/${id}`, { method: "POST" });
          const j2 = await res2.json();
          if (!res2.ok) {
            toast("error", j2.error || "Send failed");
            setBusy(null);
            return;
          }
        }
      }
      onSaved(send);
    } catch (e) {
      toast("error", (e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Compose email">
      <div className="fade-up flex max-h-[85vh] w-full max-w-[620px] flex-col rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="text-[13px] font-semibold text-ink">
            {initial.replyTo ? `Reply — ${initial.replyTo.fromName}` : initial.draftId ? "Edit draft" : "New mail"}
          </span>
          {isDemo && <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-ink-3">demo — no real delivery</span>}
          <span className="flex-1" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <label className="w-14 shrink-0 text-[12px] text-ink-3" htmlFor="c-to">To</label>
            <input id="c-to" className="input !border-none !bg-transparent !px-0 !py-1 text-[13px]" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <div className="mt-2 flex items-center gap-2 border-b border-line pb-2">
            <label className="w-14 shrink-0 text-[12px] text-ink-3" htmlFor="c-subj">Subject</label>
            <input id="c-subj" className="input !border-none !bg-transparent !px-0 !py-1 text-[13px]" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          </div>
          <textarea
            ref={bodyRef}
            className="mt-3 h-[240px] w-full resize-none rounded-lg border border-line bg-surface-2 p-3 text-[13.5px] leading-relaxed text-ink outline-none transition-colors focus:border-accent"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            aria-label="Message body"
          />
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button className="btn btn-primary" disabled={busy !== null} onClick={() => void doSave(true)}>
            <Send size={13} /> {busy === "send" ? "Sending…" : "Send"}
          </button>
          <button className="btn btn-secondary" disabled={busy !== null} onClick={() => void doSave(false)}>
            <FolderInput size={13} /> {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <span className="flex-1" />
          <span className="font-mono text-[10px] text-ink-3">{body.length} chars</span>
        </div>
      </div>
    </div>
  );
}
