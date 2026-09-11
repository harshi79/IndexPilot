import Link from "next/link";
import {
  Bot,
  Compass,
  KeyRound,
  Layers,
  Mail,
  Palette,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Bot size={17} />,
    title: "An agent, not a chatbot",
    body: "The copilot doesn't just talk about your inbox — it reads it, triages it, drafts replies in your tone, and files the noise. You approve; it executes.",
  },
  {
    icon: <Layers size={17} />,
    title: "Multi-account, no limits",
    body: "Connect every inbox you own — work, personal, clients. Switch in one click, keep them organized, and let the copilot work across all of them.",
  },
  {
    icon: <KeyRound size={17} />,
    title: "BYOK — zero walls",
    body: "We ship no AI. Bring keys from OpenAI, Google, OpenRouter, Groq, or NVIDIA. Free-tier models included, so you can run the whole thing at $0.",
  },
  {
    icon: <Palette size={17} />,
    title: "Yours to customize",
    body: "Dark or light, five accents, three densities. Your profile, your appearance, your defaults — tuned to how you actually work.",
  },
  {
    icon: <ShieldCheck size={17} />,
    title: "Your data stays yours",
    body: "Email flows between Google and your own OAuth client. Keys live in your profile. Full JSON export, one-click wipe. Turso-backed when you want it.",
  },
  {
    icon: <Mail size={17} />,
    title: "A real mailbox, end to end",
    body: "Folders, search, labels, stars, drafts, and send — the full Gmail surface, dense and fast, with keyboard flow for people who live in their inbox.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect an inbox",
    body: "Use the built-in demo inbox in 5 seconds, or connect real Gmail with your own OAuth client or a pasted token.",
  },
  {
    n: "02",
    title: "Plug in your keys",
    body: "Paste API keys for any supported provider, pick a model — free-tier ones are tagged — and set it as your default.",
  },
  {
    n: "03",
    title: "Let the copilot fly",
    body: "Ask what needs attention, get replies drafted, and let batch triage clear the noise. Everything is logged as visible actions.",
  },
];

const PROVIDERS = ["OpenAI", "Google Gemini", "OpenRouter", "Groq", "NVIDIA NIM"];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-[56px] max-w-[1120px] items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-3 text-accent">
              <Compass size={16} strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-ink">
              Index<span className="text-accent">Pilot</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-[13px] text-ink-3 md:flex">
            <a href="#features" className="transition-colors hover:text-ink">Features</a>
            <a href="#how" className="transition-colors hover:text-ink">How it works</a>
            <a href="#byok" className="transition-colors hover:text-ink">BYOK</a>
          </nav>
          <div className="flex-1" />
          <Link href="/app/inbox" className="btn btn-secondary !py-1.5 text-[12.5px]">Sign in</Link>
          <Link href="/auth" className="btn btn-primary !py-1.5 text-[12.5px]">Open IndexPilot</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 500px at 70% -10%, var(--accent-soft), transparent 65%), radial-gradient(700px 420px at 10% 30%, var(--accent-soft), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[1120px] px-5 pb-16 pt-20 md:pt-28">
          <div className="max-w-[640px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              BYOK AI · multi-account · zero walls
            </p>
            <h1 className="mt-6 text-[42px] font-bold leading-[1.08] tracking-tight text-ink md:text-[56px]">
              Your inbox,
              <br />
              <span className="text-accent">piloted.</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-ink-2">
              IndexPilot is a professional Gmail manager with an AI chief of staff. It triages what matters, drafts the
              replies, and files the rest — running on <strong className="font-semibold text-ink">your</strong> API keys
              from any provider, with no paywalls in between.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/auth" className="btn btn-primary !px-5 !py-2.5 !text-[14px]">
                Start free — no AI key required <ArrowRight size={15} />
              </Link>
              <a href="#how" className="btn btn-secondary !px-5 !py-2.5 !text-[14px]">See how it works</a>
            </div>
            <p className="mt-4 font-mono text-[11px] text-ink-3">
              Works instantly in demo mode · bring real Gmail + real AI keys whenever you're ready
            </p>
          </div>

          {/* Product mock */}
          <div className="card mt-14 overflow-hidden !rounded-2xl shadow-pop">
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
              <span className="ml-3 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                indexpilot — inbox · alex.rivera@gmail.com
              </span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-wide text-accent">
                <Bot size={10} /> copilot active
              </span>
            </div>
            <div className="grid md:grid-cols-[220px_1fr_280px]">
              <div className="hidden border-r border-line p-3 md:block">
                {["Inbox", "Starred", "Sent", "Drafts", "Archive", "Trash"].map((f, i) => (
                  <div
                    key={f}
                    className={`mb-0.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${
                      i === 0 ? "bg-accent-soft font-semibold text-accent" : "text-ink-3"
                    }`}
                  >
                    {f}
                    {i === 0 && <span className="ml-auto font-mono text-[10px]">8</span>}
                  </div>
                ))}
                <div className="mt-4 rounded-lg border border-line bg-surface-2 p-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-ink-3">copilot</p>
                  <p className="mt-1 text-[11px] leading-snug text-ink-2">
                    3 replies drafted, 5 newsletters archived. 2 need your eye.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-line">
                {[
                  ["Priya Sharma", "Re: Q3 launch plan — sign-off needed", "24m", true, ["Work"]],
                  ["Invoicely", "Your invoice INV-2041 is due in 10 days", "1h", true, ["Finance"]],
                  ["Delta Air Lines", "Your flight SFO → JFK was moved to 10:40 AM", "2h", true, ["Travel"]],
                  ["Dana Whitfield", "Re: Re: Contract redlines — 3 items left", "1d", true, ["Work"]],
                  ["Sam Okafor", "Dinner on Thursday?", "5h", true, ["Personal"]],
                ].map(([n, s, t, unread, labels]) => (
                  <div key={s as string} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[12.5px] ${unread ? "font-semibold text-ink" : "text-ink-3"}`}>{n}</p>
                      <p className="truncate text-[11.5px] text-ink-3">{s}</p>
                    </div>
                    <div className="hidden gap-1 lg:flex">
                      {(labels as string[]).map((l) => (
                        <span key={l} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase text-ink-3">{l}</span>
                      ))}
                    </div>
                    <span className="font-mono text-[10px] text-ink-3">{t}</span>
                  </div>
                ))}
              </div>
              <div className="hidden border-l border-line p-4 md:block">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-3 text-accent"><Bot size={12} /></span>
                  <span className="text-[12px] font-semibold text-ink">Copilot</span>
                </div>
                <div className="rounded-xl rounded-tl-sm bg-accent-soft px-3 py-2 text-[11.5px] text-ink">
                  What needs my attention today?
                </div>
                <div className="mt-2 rounded-xl rounded-tl-sm border border-line bg-surface px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
                  <p>1. <strong className="text-ink">Q3 launch sign-off</strong> — Priya needs it by EOD.</p>
                  <p className="mt-1">2. <strong className="text-ink">Contract redlines</strong> — 3 items, ready to close.</p>
                  <p className="mt-1">I drafted both replies — review in Drafts.</p>
                </div>
                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[9.5px] text-ink-3">
                  <span className="text-success">✓</span> create_draft × 2 · get_inbox_overview
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Features</p>
          <h2 className="mt-3 max-w-[520px] text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            Built like a professional tool, not a demo.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card group p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  {f.icon}
                </span>
                <h3 className="mt-3.5 text-[15px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1120px] px-5 py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">How it works</p>
          <h2 className="mt-3 text-[28px] font-bold tracking-tight text-ink md:text-[34px]">Three steps to a piloted inbox.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl border border-line bg-bg p-5">
                <span className="font-mono text-[12px] font-semibold text-accent">{s.n}</span>
                <h3 className="mt-2 text-[15px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BYOK */}
      <section id="byok" className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-20">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Bring your own keys</p>
              <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
                We ship no AI. You never hit our ceiling.
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
                IndexPilot is the layer between you and your inbox. The intelligence is whatever you plug in — pay only
                your providers directly, use free tiers where they exist, or switch models mid-conversation.
              </p>
              <ul className="mt-5 space-y-2 text-[13px] text-ink-2">
                {["Free-tier models tagged so you can run at $0", "Per-provider model pickers with live model lists", "Keys stored in your profile, sent only to that provider"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-0.5 text-accent">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map((p) => (
                <div key={p} className="card flex items-center justify-center gap-2 p-6 text-[14px] font-semibold text-ink-2 transition-colors hover:text-ink">
                  <KeyRound size={15} className="text-accent" /> {p}
                </div>
              ))}
              <div className="card flex items-center justify-center p-6 text-center text-[12px] leading-snug text-ink-3">
                + any OpenAI-compatible endpoint via custom base URL
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center">
          <h2 className="text-[30px] font-bold tracking-tight text-ink md:text-[38px]">
            Stop drowning. <span className="text-accent">Start piloting.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-ink-3">
            Open the app, grab the demo inbox, and see the copilot work in under a minute.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/auth" className="btn btn-primary !px-6 !py-3 !text-[15px]">
              Open IndexPilot <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center justify-between gap-3 px-5 py-8 text-[12px] text-ink-3 md:flex-row">
          <span className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-3 text-accent">
              <Compass size={11} strokeWidth={2.4} />
            </span>
            IndexPilot
          </span>
          <p className="font-mono text-[10.5px]">
            BYOK AI · your keys, your accounts, your data
          </p>
        </div>
      </footer>
    </div>
  );
}
