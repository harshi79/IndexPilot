"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, KeyRound, Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { Spinner, toast } from "@/components/ui";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: name || undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Something went wrong");
        return;
      }
      toast("success", mode === "login" ? "Welcome back" : "Account created");
      router.replace("/app/inbox");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            background:
              "radial-gradient(600px 400px at 20% 0%, var(--accent-soft), transparent 70%), radial-gradient(500px 380px at 90% 100%, var(--accent-soft), transparent 70%)",
          }}
          aria-hidden
        />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-accent">
            <Compass size={18} strokeWidth={2.2} />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-ink">
            Index<span className="text-accent">Pilot</span>
          </span>
        </Link>

        <div className="relative">
          <h1 className="max-w-[420px] text-[30px] font-bold leading-[1.15] tracking-tight text-ink">
            Your inbox,
            <br />
            <span className="text-accent">piloted.</span>
          </h1>
          <p className="mt-4 max-w-[380px] text-[14px] leading-relaxed text-ink-2">
            A professional Gmail manager with an AI chief of staff that triages, drafts, and files — powered by{" "}
            <em>your</em> API keys, on <em>your</em> terms.
          </p>

          {/* Mini product mock */}
          <div className="card mt-8 max-w-[400px] overflow-hidden !rounded-xl shadow-pop">
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-danger/60" />
              <span className="h-2 w-2 rounded-full bg-warn/60" />
              <span className="h-2 w-2 rounded-full bg-success/60" />
              <span className="ml-2 font-mono text-[9px] uppercase tracking-wider text-ink-3">inbox · 8 unread</span>
            </div>
            <div className="divide-y divide-line">
              {[
                ["Priya Sharma", "Re: Q3 launch plan — sign-off needed", "24m", true],
                ["Delta Air Lines", "Your flight SFO → JFK moved to 10:40", "130m", true],
                ["Dana Whitfield", "Contract redlines — 3 items left", "1d", true],
                ["The Latent Space", "3 takeaways from the inference workshop", "4h", false],
              ].map(([n, s, t, unread]) => (
                <div key={s as string} className="flex items-center gap-2.5 px-3 py-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[11px] ${unread ? "font-semibold text-ink" : "text-ink-3"}`}>{n}</p>
                    <p className="truncate text-[10px] text-ink-3">{s}</p>
                  </div>
                  <span className="font-mono text-[9px] text-ink-3">{t}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-line bg-accent-soft/50 px-3 py-2">
              <ShieldCheck size={11} className="shrink-0 text-accent" />
              <p className="truncate font-mono text-[9.5px] text-ink-2">copilot: drafted 3 replies · archived 5 newsletters</p>
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          <span className="flex items-center gap-1.5"><Mail size={11} className="text-accent" /> multi-account</span>
          <span className="flex items-center gap-1.5"><KeyRound size={11} className="text-accent" /> BYOK · zero walls</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[380px]">
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-accent">
              <Compass size={18} strokeWidth={2.2} />
            </span>
            <span className="text-[17px] font-bold tracking-tight text-ink">
              Index<span className="text-accent">Pilot</span>
            </span>
          </Link>

          <div className="mb-6 flex rounded-xl border border-line bg-surface-2 p-1">
            {(["register", "login"] as const).map((m) => (
              <button
                key={m}
                className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors ${
                  mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
                }`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === "register" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          <h2 className="text-[20px] font-bold tracking-tight text-ink">
            {mode === "register" ? "Set up your cockpit" : "Welcome back"}
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {mode === "register"
              ? "Local account on this instance — bring your own Google + AI keys afterwards."
              : "Sign in to pick up where you left off."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "register" && (
              <div>
                <label htmlFor="a-name" className="mb-1 block text-[11.5px] font-medium text-ink-3">Name</label>
                <input id="a-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" autoComplete="name" />
              </div>
            )}
            <div>
              <label htmlFor="a-email" className="mb-1 block text-[11.5px] font-medium text-ink-3">Email</label>
              <input
                id="a-email"
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="a-pass" className="mb-1 block text-[11.5px] font-medium text-ink-3">
                Password <span className="text-ink-3/70">(min 8 characters)</span>
              </label>
              <input
                id="a-pass"
                className="input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </div>

            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger" role="alert">
                {error}
              </p>
            )}

            <button className="btn btn-primary w-full !py-2.5" disabled={busy} type="submit">
              {busy ? <Spinner size={14} /> : mode === "register" ? "Create account" : "Sign in"}
              {!busy && <ArrowRight size={14} />}
            </button>
          </form>

          <p className="mt-6 flex items-center gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
            <Lock size={11} className="shrink-0" />
            Passwords are hashed with scrypt. Your Google and AI credentials never touch our servers in transit to anywhere but Google and your chosen provider.
          </p>
        </div>
      </div>
    </div>
  );
}
