# IndexPilot

**Your inbox, piloted.** A professional Gmail manager with an AI chief of staff that reads, triages, drafts, and files — powered entirely by **your** API keys, across **your** accounts, with **zero walls** in between.

IndexPilot ships with *no* AI of its own. You bring keys from OpenAI, Google Gemini, OpenRouter, Groq, or NVIDIA NIM (or any OpenAI-compatible endpoint) and pick a model. The app is the cockpit; the intelligence is yours.

---

## What it does

- **A copilot that does work, not just chat.** Ask what needs attention and it grounds itself in your real inbox, drafts replies in your tone, archives newsletters, tags finance mail, and shows every action it takes as a visible tool call. It only *sends* when you explicitly say so.
- **Multi-account, no limits.** Connect as many inboxes as you like — work, personal, clients — and switch between them in one click.
- **A real mailbox, end to end.** Inbox / Starred / Sent / Drafts / Archive / Trash, full-text search, custom labels, stars, unread tracking, compose, drafts, and send — dense, keyboard-driven (`j/k`, `a`, `s`, `e`, `r`), and fast.
- **Fully customizable profile.** Dark / light / system themes, five accent colors, three density levels — saved to your profile and applied instantly.
- **Your data stays yours.** Google talks to *your* OAuth client (or a token you paste). API keys live in your profile and are sent only to the provider you chose. One-click JSON export, one-click wipe.
- **Runs at $0.** A built-in **demo inbox** (26 realistic emails) plus a **demo brain** let you experience the entire product without a single key. Free-tier models are tagged so you can upgrade to real AI for pennies.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
```

1. Open the app and create an account.
2. Go to **Settings → Email accounts** → *Use the demo inbox*.
3. Open **Copilot** and try: *“What needs my attention today?”* or *“Clean up the newsletters.”*
4. Add real keys under **Settings → AI (BYOK)** whenever you're ready — the copilot switches from demo brain to your model automatically.

## Deploy to Render (free plan)

The repo ships a production **Dockerfile** (multi-stage `node:22-alpine`, non-root) and a **Render Blueprint** (`render.yaml`), plus a liveness probe at **`/api/health`** (returns `200` with body `ok`).

**One-click:**
```bash
# with the Render CLI (installs from the Blueprint)
render up
```

**Or manually** (Render → *New → Web Service*):
1. Connect this repo.
2. **Runtime → Docker** (it finds `./Dockerfile` automatically).
3. Plan: **Free**.
4. Set **Health Check Path** to `/api/health`.
5. (Recommended) add the env vars below, then Deploy.

| Env var | Why |
|---|---|
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | **Strongly recommended on the free plan.** Render's container disk is ephemeral — without a Turso DB, local SQLite resets on every redeploy or sleep cycle. A free Turso database makes accounts, mail cache, chats, and keys durable. |
| `SESSION_SECRET` | Any long random string (auto-generated if unset, but then sessions reset with the disk). |
| `NEXT_PUBLIC_APP_URL` | Only needed to pin the Gmail OAuth redirect URI; by default it's derived from the request origin, so a deployed service "just works". |

Free-plan notes: instances sleep after ~15 min idle (first request takes a few seconds to wake — the health check confirms liveness); polling `/api/health` from a free cron keeps it warm.

## Connecting a real Gmail account

Two BYOK options, both in **Settings → Email accounts**:

| Option | When to use | How |
|---|---|---|
| **OAuth (recommended)** | Durable, auto-refreshing connection | Create an OAuth 2.0 *Web application* client in Google Cloud Console, add the redirect URI shown in-app (`<your origin>/api/mail/oauth/callback`), then paste the client ID + secret. You authorize once in a new tab; IndexPilot stores the refresh token. |
| **Access token** | Quick experiments | Paste a short-lived `access_token` from your own script. Works until it expires. |

Scopes requested: `gmail.modify` + `gmail.send`. Mail is fetched straight from Google with your credentials and cached locally so the UI stays fast offline-ish.

## Bring your own keys

| Provider | Protocol | Free options |
|---|---|---|
| OpenAI | OpenAI-compatible | — |
| Google Gemini | Native (generateContent) | free-tier models |
| OpenRouter | OpenAI-compatible | `:free` models |
| Groq | OpenAI-compatible | free-tier Llama |
| NVIDIA NIM | OpenAI-compatible | free-credit models |

Any of them can also point at a custom base URL (private gateways, local servers, etc.). Keys are stored per-profile, masked in the UI, and transmitted only to their own provider. The copilot uses your saved default provider/model and can be overridden per conversation.

## Configuration

Everything works with zero configuration. To customize:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Override the public base URL (used for the Gmail OAuth redirect). By default the app uses the origin of the current request, so most deployments need nothing. |
| `SESSION_SECRET` | Long random string for signing session cookies. Auto-generated and persisted to `data/.session_secret` if unset. |
| `TURSO_DATABASE_URL` | `libsql://…` — when set (with the token below), all user data moves to your Turso database. |
| `TURSO_AUTH_TOKEN` | Turso auth token. |

**Storage:** without Turso, data lives in an embedded SQLite file (`data/indexpilot.sqlite`, git-ignored). Set both Turso variables to run on your own libSQL/Turso instance instead — the schema and access layer are shared.

## Architecture

- **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4.** One deployment: server-rendered API routes plus client components.
- **Database:** a small async SQL interface (`lib/db.ts`) with two interchangeable drivers — embedded `node:sqlite` (zero-dependency) and Turso via `@libsql/client`. Same schema either way.
- **Mail layer** (`lib/mail/`): Gmail REST client (token refresh, PKCE OAuth, message parse/upsert, modify, drafts, send), plus a deterministic demo mailbox generator and a live-mail simulator.
- **Agent** (`lib/agent/`): a tool loop (`get_inbox_overview`, `search_mail`, `read_mail`, `set_status`, `apply_label`, `get_senders`, `create_draft`, `send_mail`, `propose_plan`) executed server-side against *your* accounts. Two backends:
  - **LLM path** — streaming chat completions with function calling for OpenAI-compatible providers, and the native Gemini `streamGenerateContent` protocol with `functionDeclarations`.
  - **Demo brain** — a deterministic, fully offline fallback so the product is usable with zero credentials.
- **Streaming:** the copilot streams SSE (`delta` / `tool_start` / `tool_done` / `done`) so you watch reasoning and actions happen live.
- **Security:** scrypt password hashing, HMAC-signed httpOnly session cookies, per-user row ownership on every query, PKCE for OAuth, and a strict `send_mail` policy (explicit user intent only).

### Project layout

```
app/
  page.tsx                  landing
  auth/page.tsx             sign in / register
  app/inbox|agent|settings  the product
  api/…                     auth, mail, drafts, agent (SSE), ai/providers, data
components/                 shell, mail view, agent chat, settings, UI kit
lib/
  db.ts                     dual-driver DB + schema
  mail/                     gmail client, demo mailbox, account store
  ai/                       provider catalog, streaming adapters
  agent/                    tools, system prompt, loop (+demo brain)
  session.ts                signed-cookie sessions
```

## Design

Visual direction generated with the [ui-ux-pro-max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (installed in `.claude/skills/`): **data-dense dashboard** style with micro-interactions, dark-first premium stone-black palette with a warm gold accent, Inter for UI and JetBrains Mono for metadata, 4.5:1 contrast, visible focus states, and `prefers-reduced-motion` support.

## License

Creative Commons CC0 1.0 — see [LICENSE](./LICENSE).
