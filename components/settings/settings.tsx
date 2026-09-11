"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { useApp } from "../shell";
import type { Accent, AppearanceMode, Density } from "../appearance";
import { Avatar, Spinner, toast } from "../ui";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "email", label: "Email accounts" },
  { id: "ai", label: "AI (BYOK)" },
  { id: "appearance", label: "Appearance" },
  { id: "data", label: "Data" },
] as const;

export function SettingsPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState<string>((params.get("tab") as string) || "profile");
  useEffect(() => {
    const t = params.get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [params]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[46px] shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              tab === t.id ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-surface-2 hover:text-ink"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-4 py-6">
          {tab === "profile" && <ProfileTab />}
          {tab === "email" && <EmailTab />}
          {tab === "ai" && <AiTab />}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "data" && <DataTab />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card fade-up p-5">
      <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, appearance, updateAppearance, refresh } = useApp();
  const [name, setName] = useState(user?.display_name ?? "");
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-4">
      <Section title="Profile" hint="Your name appears in drafts and copilot context.">
        <div className="flex items-center gap-3">
          <Avatar seed={user?.email || "?"} size={40} />
          <div className="flex-1">
            <label htmlFor="name" className="mb-1 block text-[11.5px] font-medium text-ink-3">Display name</label>
            <div className="flex gap-2">
              <input id="name" className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="e.g. Alex Rivera" />
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await fetch("/api/me/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ display_name: name }),
                  });
                  setSaved(true);
                  refresh();
                  toast("success", "Profile saved");
                }}
              >
                {saved ? <Check size={14} /> : "Save"}
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-ink-3">Signed in as <span className="font-mono text-ink-2">{user?.email}</span></p>
          </div>
        </div>
      </Section>
      <Section title="How your data works" hint="">
        <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-ink-2 marker:text-ink-3">
          <li>Your API keys are stored only for your account and sent only to the provider you chose — never to IndexPilot servers.</li>
          <li>Email is fetched straight from Google with your own OAuth credentials (or a token you paste).</li>
          <li>Storage runs on your Turso database when configured, otherwise on this server's local disk. Export it any time in Data.</li>
        </ul>
      </Section>
    </div>
  );
}

// ── Email accounts ────────────────────────────────────────────────────────

function EmailTab() {
  const { accounts, activeAccountId, setActiveAccountId, refresh } = useApp();
  const [adding, setAdding] = useState<null | "demo" | "token" | "oauth">(null);
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<{ authUrl: string; redirectUri: string } | null>(null);

  const submit = async (kind: "demo" | "token" | "oauth") => {
    setBusy(true);
    try {
      const res = await fetch("/api/mail/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          access_token: kind === "token" ? token : undefined,
          client_id: kind === "oauth" ? clientId : undefined,
          client_secret: kind === "oauth" ? clientSecret : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast("error", j.error || "Failed to connect");
        return;
      }
      if (j.authUrl) {
        setOauthUrl({ authUrl: j.authUrl, redirectUri: j.redirectUri });
        window.open(j.authUrl, "_blank", "noopener");
        // Poll for the new account to appear.
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const r2 = await fetch("/api/mail/accounts");
          const j2 = await r2.json();
          if (j2.accounts?.some((a: { email: string }) => a.email !== accounts[0]?.email)) {
            toast("success", "Gmail connected");
            setAdding(null);
            setOauthUrl(null);
            refresh();
            return;
          }
        }
        toast("error", "Still waiting for Google… check the new tab.");
        return;
      }
      toast("success", kind === "demo" ? "Demo inbox connected" : "Account connected");
      setAdding(null);
      setToken("");
      refresh();
      if (j.account) setActiveAccountId(j.account.id);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section
        title="Connected accounts"
        hint="No limits, no walls — connect as many inboxes as you like and switch between them from the sidebar."
      >
        {accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-surface-2 p-4 text-center text-[12.5px] text-ink-3">
            No accounts yet. Add your first one below — the demo inbox takes 5 seconds.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <Avatar seed={a.email} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{a.email}</p>
                  <p className="text-[11px] text-ink-3">
                    {a.label || a.provider}
                    {activeAccountId === a.id && <span className="ml-2 text-accent">· active</span>}
                  </p>
                </div>
                <span className={`badge ${a.kind === "demo" ? "" : "badge-success"}`}>{a.kind}</span>
                {activeAccountId !== a.id && (
                  <button className="btn btn-secondary !py-1 text-[11.5px]" onClick={() => setActiveAccountId(a.id)}>Use</button>
                )}
                <button
                  className="icon-btn"
                  title="Remove account"
                  aria-label={`Remove ${a.email}`}
                  onClick={async () => {
                    if (!confirm(`Remove ${a.email} and its cached mail?`)) return;
                    await fetch(`/api/mail/accounts/${a.id}`, { method: "DELETE" });
                    toast("success", "Account removed");
                    refresh();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!adding ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {accounts.length === 0 && (
              <button className="btn btn-primary" disabled={busy} onClick={() => setAdding("demo")}>
                <Plus size={14} /> Use the demo inbox
              </button>
            )}
            <button className="btn btn-secondary" disabled={busy} onClick={() => setAdding("oauth")}>
              <Plus size={14} /> Connect Gmail (OAuth)
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setAdding("token")}>
              Paste access token…
            </button>
          </div>
        ) : (
          <div className="fade-up mt-4 rounded-xl border border-line bg-surface-2 p-4">
            {adding === "demo" && (
              <>
                <p className="text-[13px] font-semibold text-ink">Demo inbox</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                  A realistic sample mailbox (work, finance, travel, newsletters) with 26 emails. Everything works on it —
                  triage, copilot actions, drafts. Nothing leaves this machine.
                </p>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary" disabled={busy} onClick={() => void submit("demo")}>{busy ? <Spinner size={13} /> : "Connect demo inbox"}</button>
                  <button className="btn btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
                </div>
              </>
            )}
            {adding === "token" && (
              <>
                <p className="text-[13px] font-semibold text-ink">Access token (quick test)</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                  Paste a short-lived Gmail <code className="font-mono text-accent">access_token</code> (e.g. from your own script).
                  It works until it expires; for a durable connection use OAuth below.
                </p>
                <input className="input mt-3 font-mono !text-[12px]" placeholder="ya29.0…" value={token} onChange={(e) => setToken(e.target.value)} />
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary" disabled={busy || !token.trim()} onClick={() => void submit("token")}>{busy ? <Spinner size={13} /> : "Verify & connect"}</button>
                  <button className="btn btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
                </div>
              </>
            )}
            {adding === "oauth" && (
              <>
                <p className="text-[13px] font-semibold text-ink">Connect Gmail with your own OAuth client</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12px] leading-relaxed text-ink-3">
                  <li>In Google Cloud Console create (or pick) an OAuth 2.0 client — <em>Web application</em>.</li>
                  <li>
                    Add this exact redirect URI:{" "}
                    <code className="break-all rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                      {typeof window !== "undefined" ? `${window.location.origin}/api/mail/oauth/callback` : "/api/mail/oauth/callback"}
                    </code>
                  </li>
                  <li>Paste the client ID and secret here. You authorize in a new tab; IndexPilot stores the refresh token so it keeps working.</li>
                </ol>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input className="input font-mono !text-[12px]" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="OAuth client ID" />
                  <div className="relative">
                    <input className="input pr-9 font-mono !text-[12px]" placeholder="Client secret" type={showSecret ? "text" : "password"} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} aria-label="OAuth client secret" />
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" onClick={() => setShowSecret((v) => !v)} aria-label="Toggle secret visibility">
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                {oauthUrl && (
                  <p className="mt-2 rounded-lg bg-info-soft px-3 py-2 text-[11.5px] text-info">
                    Waiting for Google… finish the authorization in the opened tab. If it didn't open:{" "}
                    <a className="underline" href={oauthUrl.authUrl} target="_blank" rel="noreferrer">open it here</a>.
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary" disabled={busy || !clientId.trim() || !clientSecret.trim()} onClick={() => void submit("oauth")}>
                    {busy ? <Spinner size={13} /> : "Start Google sign-in"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setAdding(null); setOauthUrl(null); }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── AI providers ──────────────────────────────────────────────────────────

interface ProviderCard {
  id: string;
  name: string;
  keyUrl: string;
  models: { id: string; name: string; tags: string[]; note?: string }[];
  has_key: boolean;
  api_key_masked: string | null;
  base_url: string | null;
  default_model: string | null;
  enabled: boolean;
}

function AiTab() {
  const { refresh } = useApp();
  const [data, setData] = useState<ProviderCard[] | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState<Record<string, string>>({});
  const [model, setModel] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (provider?: string) => {
    const res = await fetch(provider ? `/api/ai/providers?provider=${provider}&live=1` : "/api/ai/providers");
    const j = await res.json();
    setData(j.providers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <div className="flex justify-center p-10 text-ink-3"><Spinner size={16} /></div>;

  const save = async (id: string, remove = false) => {
    setBusy(id);
    try {
      const res = await (
        remove
        ? fetch("/api/ai/providers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: id }) })
        : fetch("/api/ai/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: id,
              api_key: keys[id] || undefined,
              base_url: baseUrl[id] || null,
              default_model: model[id] || null,
            }),
          })
      );
      const j = await res.json();
      if (!res.ok) {
        toast("error", j.error || "Failed to save");
        return;
      }
      toast("success", remove ? `${id} removed` : `${id} saved`);
      setKeys((k) => ({ ...k, [id]: "" }));
      await load();
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card fade-up border-accent/25 bg-accent-soft/40 p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <ShieldCheck size={15} className="text-accent" /> Bring your own keys — no walls
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          IndexPilot ships with <strong>zero AI</strong>. Plug in any of the five providers below (or all of them) and pick a
          default model for the copilot. Keys live in your profile and go only to the provider.
        </p>
      </div>

      {data.map((p) => (
        <section key={p.id} className="card fade-up p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{p.name}</h3>
            {p.has_key ? (
              <span className="badge badge-success">key saved</span>
            ) : (
              <span className="badge">no key</span>
            )}
            <span className="flex-1" />
            <a className="btn btn-ghost !py-1 text-[11.5px]" href={p.keyUrl} target="_blank" rel="noreferrer">
              Get a key ↗
            </a>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <div className="relative">
              <label className="mb-1 block text-[11px] font-medium text-ink-3">API key {p.api_key_masked && `(${p.api_key_masked})`}</label>
              <div className="relative">
                <input
                  className="input pr-9 font-mono !text-[12px]"
                  type={showKey[p.id] ? "text" : "password"}
                  placeholder={p.has_key ? "Leave blank to keep current" : `paste ${p.id} key`}
                  value={keys[p.id] ?? ""}
                  onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                  onClick={() => setShowKey((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  aria-label="Toggle key visibility"
                >
                  {showKey[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-ink-3">Model</label>
              <select
                className="input !text-[12.5px]"
                value={model[p.id] ?? p.default_model ?? ""}
                onChange={(e) => setModel((m) => ({ ...m, [p.id]: e.target.value }))}
              >
                <option value="">First listed</option>
                {p.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.tags.includes("free") ? " · free" : m.tags.includes("free tier") ? " · free tier" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-ink-3">Base URL (advanced)</label>
              <input
                className="input font-mono !text-[11.5px]"
                placeholder="default"
                value={baseUrl[p.id] ?? p.base_url ?? ""}
                onChange={(e) => setBaseUrl((b) => ({ ...b, [p.id]: e.target.value }))}
              />
            </div>
            <div className="flex items-end justify-end gap-2">
              {p.has_key && (
                <button className="btn btn-ghost !py-1.5 text-[11.5px]" disabled={busy === p.id} onClick={() => void load(p.id)}>
                  <RefreshCw size={12} /> Live models
                </button>
              )}
              {p.has_key && (
                <button className="btn btn-danger !py-1.5 text-[11.5px]" onClick={() => void save(p.id, true)}>
                  <Trash2 size={12} /> Remove
                </button>
              )}
              <button
                className="btn btn-primary !py-1.5"
                disabled={busy === p.id || (!p.has_key && !keys[p.id]?.trim())}
                onClick={() => void save(p.id)}
              >
                {busy === p.id ? <Spinner size={12} /> : <KeyRound size={12} />} Save
              </button>
            </div>
          </div>
          {p.models.some((m) => m.tags.includes("free")) && (
            <p className="mt-2 font-mono text-[10px] text-ink-3">
              models tagged “free” use the provider's free tier — great for trying IndexPilot at $0
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

// ── Appearance ────────────────────────────────────────────────────────────

const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "gold", label: "Gold", color: "#e5b54d" },
  { id: "blue", label: "Blue", color: "#60a5fa" },
  { id: "green", label: "Green", color: "#4ade80" },
  { id: "rose", label: "Rose", color: "#fb7185" },
  { id: "violet", label: "Violet", color: "#a78bfa" },
];

function AppearanceTab() {
  const { updateAppearance } = useApp();
  const [appearance, setLocal] = useState<null | { mode: AppearanceMode; accent: Accent; density: Density }>(null);

  useEffect(() => {
    // read current local appearance
    try {
      const raw = localStorage.getItem("ip_appearance");
      const a = raw ? JSON.parse(raw) : { mode: "dark", accent: "gold", density: "comfortable" };
      setLocal({ mode: a.mode ?? "dark", accent: a.accent ?? "gold", density: a.density ?? "comfortable" });
    } catch {
      setLocal({ mode: "dark", accent: "gold", density: "comfortable" });
    }
  }, []);

  if (!appearance) return null;

  const set = (patch: Partial<typeof appearance>) => {
    const next = { ...appearance, ...patch };
    setLocal(next);
    updateAppearance(next);
    fetch("/api/me/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appearance: next }),
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <Section title="Theme" hint="Dark is the house style; light works too. System follows your OS.">
        <div className="flex gap-2">
          {([
            { id: "dark", label: "Dark", icon: <Moon size={14} /> },
            { id: "light", label: "Light", icon: <Sun size={14} /> },
            { id: "system", label: "System", icon: <Monitor size={14} /> },
          ] as { id: AppearanceMode; label: string; icon: React.ReactNode }[]).map((m) => (
            <button
              key={m.id}
              className={`btn ${appearance.mode === m.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => set({ mode: m.id })}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Accent" hint="The color IndexPilot uses for highlights, selection, and the copilot.">
        <div className="flex flex-wrap gap-2.5">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-all"
              style={{
                borderColor: appearance.accent === a.id ? a.color : "var(--border)",
                background: appearance.accent === a.id ? `color-mix(in srgb, ${a.color} 12%, transparent)` : "transparent",
                color: "var(--text)",
              }}
              onClick={() => set({ accent: a.id })}
              aria-pressed={appearance.accent === a.id}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.color }} />
              {a.label}
              {appearance.accent === a.id && <Check size={13} style={{ color: a.color }} />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Density" hint="Comfortable is the default; compact fits more rows; spacious is easy on the eyes.">
        <div className="flex gap-2">
          {(["comfortable", "compact", "spacious"] as Density[]).map((d) => (
            <button
              key={d}
              className={`btn ${appearance.density === d ? "btn-primary" : "btn-secondary"}`}
              onClick={() => set({ density: d })}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      <div className="card flex items-center gap-2 p-4 text-[12px] text-ink-3">
        <Palette size={14} className="text-accent" />
        Appearance is saved to your profile and applied instantly across the app.
      </div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────

function DataTab() {
  const [wiping, setWiping] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  return (
    <div className="space-y-4">
      <Section title="Export" hint="Everything the app knows about you — accounts (without secrets), mail cache, drafts, chat history, and provider config.">
        <a className="btn btn-secondary" href="/api/data/export">
          <DownloadIcon /> Download JSON export
        </a>
      </Section>
      <Section title="Wipe" hint="Deletes all accounts, cached mail, drafts, conversations, and saved API keys. You stay signed in; the app resets to first-run.">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input !w-44"
            placeholder='type "wipe"'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <button
            className="btn btn-danger"
            disabled={confirmText !== "wipe" || wiping}
            onClick={async () => {
              setWiping(true);
              const res = await fetch("/api/data/wipe", { method: "POST" });
              const j = await res.json();
              setWiping(false);
              if (res.ok) toast("success", "All data wiped");
              else toast("error", j.error || "Wipe failed");
            }}
          >
            {wiping ? <Spinner size={13} /> : <Trash2 size={14} />} Wipe everything
          </button>
        </div>
      </Section>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
