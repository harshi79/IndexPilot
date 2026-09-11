"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  Compass,
  Inbox,
  Star,
  Send,
  FileEdit,
  Archive,
  Trash2,
  Bot,
  Settings,
  LogOut,
  Plus,
  Loader2,
} from "lucide-react";
import { useAppearance, ModeToggle, type Appearance } from "./appearance";
import { Avatar, Toaster, toast } from "./ui";

export interface AccountLite {
  id: number;
  email: string;
  label: string | null;
  kind: "demo" | "token" | "oauth";
  provider?: string;
}

export interface ProviderLite {
  provider: string;
  has_key: boolean;
  default_model: string | null;
  enabled: boolean;
}

interface AppCtx {
  ready: boolean;
  user: { id: number; email: string; display_name: string | null } | null;
  accounts: AccountLite[];
  activeAccountId: number | null;
  activeAccount: AccountLite | null;
  setActiveAccountId: (id: number | null) => void;
  providers: ProviderLite[];
  appearance: Appearance;
  updateAppearance: (next: Partial<Appearance>) => void;
  refresh: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

function Logo() {
  return (
    <Link href="/app/inbox" className="flex items-center gap-2.5 px-1" aria-label="IndexPilot home">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-3 text-accent">
        <Compass size={16} strokeWidth={2.2} />
      </span>
      <span className="text-[15px] font-bold tracking-tight text-ink">
        Index<span className="text-accent">Pilot</span>
      </span>
    </Link>
  );
}

const FOLDERS: { view: string; label: string; icon: ReactNode; href: string }[] = [
  { view: "inbox", label: "Inbox", icon: <Inbox size={15.5} />, href: "/app/inbox" },
  { view: "starred", label: "Starred", icon: <Star size={15.5} />, href: "/app/inbox?view=starred" },
  { view: "sent", label: "Sent", icon: <Send size={15.5} />, href: "/app/inbox?view=sent" },
  { view: "drafts", label: "Drafts", icon: <FileEdit size={15.5} />, href: "/app/inbox?view=drafts" },
  { view: "archive", label: "Archive", icon: <Archive size={15.5} />, href: "/app/inbox?view=archive" },
  { view: "trash", label: "Trash", icon: <Trash2 size={15.5} />, href: "/app/inbox?view=trash" },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [appearance, updateAppearance] = useAppearance();
  const [data, setData] = useState<AppCtx | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.status === 401) {
        router.replace("/auth");
        return;
      }
      const j = await res.json();
      const accounts: AccountLite[] = j.accounts ?? [];
      const stored = Number(localStorage.getItem("ip_account") || 0);
      const active =
        accounts.find((a) => a.id === stored) ?? accounts.find((a) => a.kind === "demo") ?? accounts[0] ?? null;
      if (active) setActiveId(active.id);
      setData({
        ready: true,
        user: j.user,
        accounts,
        activeAccountId: active?.id ?? null,
        activeAccount: active,
        setActiveAccountId: (id: number | null) => {
          setActiveId(id);
          if (id) localStorage.setItem("ip_account", String(id));
        },
        providers: j.providers ?? [],
        appearance,
        updateAppearance,
        refresh: () => void load(),
      });
    } catch {
      router.replace("/auth");
    }
  }, [router, appearance, updateAppearance]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { appearance?: Partial<Appearance> } | undefined;
      if (detail?.appearance) {
        updateAppearance(detail.appearance);
        void load();
      }
    };
    window.addEventListener("ip:appearance", handler);
    return () => window.removeEventListener("ip:appearance", handler);
  }, [updateAppearance, load]);

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="flex items-center gap-2.5 text-ink-3">
          <Loader2 size={18} className="animate-spin text-accent" />
          <span className="text-[13px]">Preparing your cockpit…</span>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={data}>
      <div className="flex h-screen overflow-hidden bg-bg">
        {/* Sidebar */}
        <aside
          className={`no-print fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-[52px] items-center border-b border-line px-3">
            <Logo />
          </div>

          <nav className="flex-1 overflow-y-auto px-2.5 py-3">
            <div className="space-y-0.5">
              <Link href="/app/agent" className="nav-item" data-active={pathname === "/app/agent"}>
                <span className="flex h-[18px] w-[18px] items-center justify-center text-accent">
                  <Bot size={15.5} />
                </span>
                <span className="flex-1">Copilot</span>
                <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-accent">
                  AI
                </span>
              </Link>
            </div>

            <p className="px-2.5 pb-1 pt-4 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">
              Mail
            </p>
            <div className="space-y-0.5">
              {FOLDERS.map((f) => {
                const active =
                  pathname === "/app/inbox" &&
                  (f.href === "/app/inbox"
                    ? new URLSearchParams(window.location.search).get("view") === "inbox" ||
                      !new URLSearchParams(window.location.search).get("view")
                    : new URLSearchParams(window.location.search).get("view") === f.view);
                return (
                  <Link key={f.view} href={f.href} className="nav-item" data-active={active}>
                    <span className="shrink-0">{f.icon}</span>
                    <span className="flex-1">{f.label}</span>
                    {f.view === "inbox" && <InboxCount />}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-line px-2.5 py-3">
            <Link href="/app/settings" className="nav-item" data-active={pathname === "/app/settings"}>
              <Settings size={15.5} className="shrink-0" />
              <span className="flex-1">Settings</span>
            </Link>

            {/* Account switcher */}
            <div className="mt-2 space-y-0.5">
              <p className="flex items-center justify-between px-2.5 pb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                <span>Accounts</span>
                <Link
                  href="/app/settings?tab=email"
                  className="rounded p-0.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                  aria-label="Manage accounts"
                >
                  <Plus size={12} />
                </Link>
              </p>
              {data.accounts.length === 0 && (
                <Link href="/app/settings?tab=email" className="nav-item">
                  <span className="text-[12px]">Add an account…</span>
                </Link>
              )}
              {data.accounts.map((a) => (
                <button
                  key={a.id}
                  className="nav-item"
                  data-active={activeId === a.id}
                  onClick={() => data.setActiveAccountId(a.id)}
                  title={a.email}
                >
                  <Avatar seed={a.email} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px]">{a.label || a.email}</span>
                  </span>
                  {a.kind === "demo" && (
                    <span className="rounded bg-surface-3 px-1 py-px font-mono text-[8.5px] font-semibold uppercase text-ink-3">
                      demo
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2 border-t border-line px-1 pt-2.5">
              <button className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left transition-colors hover:bg-surface-3" onClick={() => { void load(); }}>
                <Avatar seed={data.user?.email || "?"} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-ink">
                    {data.user?.display_name || data.user?.email}
                  </span>
                </span>
              </button>
              <ModeToggle appearance={appearance} onChange={updateAppearance} />
              <button
                className="icon-btn"
                title="Sign out"
                aria-label="Sign out"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.replace("/auth");
                }}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
            <button
              className="icon-btn lg:hidden"
              aria-label="Open menu"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <span className="flex flex-col gap-[3px]">
                <span className="h-px w-4 bg-current" />
                <span className="h-px w-4 bg-current" />
                <span className="h-px w-4 bg-current" />
              </span>
            </button>
            <div className="hidden items-center gap-2 text-[12px] text-ink-3 md:flex">
              <span className="font-mono uppercase tracking-wide">{data.activeAccount ? "Connected" : "No account"}</span>
              {data.activeAccount && (
                <>
                  <span className="h-3 w-px bg-line-strong" />
                  <span className="max-w-[220px] truncate font-medium text-ink-2">{data.activeAccount.email}</span>
                </>
              )}
            </div>
            <div className="flex-1" />
            <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-ink-3 sm:flex">
              <Bot size={13} className="text-accent" />
              <span>
                {data.providers.some((p) => p.has_key && p.enabled)
                  ? "AI connected — BYOK"
                  : "AI in demo mode — add a key in Settings"}
              </span>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
      <Toaster />
    </Ctx.Provider>
  );
}

function InboxCount() {
  const { activeAccountId } = useApp();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!activeAccountId) {
      setCount(0);
      return;
    }
    let alive = true;
    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/mail/inbox?account=${activeAccountId}&limit=1`);
        const j = await res.json();
        if (alive) setCount(j.unread ?? 0);
      } catch {
        /* ignore */
      }
    };
    void fetchCount();
    const t = setInterval(fetchCount, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [activeAccountId]);
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function toastSuccess(text: string) {
  toast("success", text);
}
