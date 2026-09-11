import { initDb } from "../db";
import type { NewMailInput } from "./types";

export const DEMO_EMAIL = "alex.rivera@gmail.com";
export const DEMO_LABEL = "Demo inbox";

const min = 60_000;
const hr = 60 * min;
const day = 24 * hr;

interface Seed {
  n: number;
  minsAgo: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  body: string;
  read?: boolean;
  starred?: boolean;
  important?: boolean;
  archived?: boolean;
  trashed?: boolean;
  labels?: string[];
}

const SEEDS: Seed[] = [
  {
    n: 1, minsAgo: 24, subject: "Re: Q3 launch plan — sign-off needed",
    fromName: "Priya Sharma", fromEmail: "priya.sharma@meridianlabs.com",
    body: "Alex,\n\nAttaching the final Q3 launch plan. We're holding the Nov 12 date, but I need your sign-off on the pricing page copy before we hand it to legal. Two open items:\n\n1. Should we keep the annual-plan discount at 20% or move to 25%?\n2. The onboarding revamp ships with GA or a week after — which do you prefer?\n\nIf you can reply by end of day I'll lock the doc. Thanks!\n\nPriya",
    important: true, labels: ["Work"],
  },
  {
    n: 2, minsAgo: 95, subject: "Your invoice INV-2041 is due in 10 days",
    fromName: "Invoicely", fromEmail: "billing@invoicely.com",
    body: "Hi Alex,\n\nFriendly reminder: invoice INV-2041 for $1,250.00 (Retainer — September) is due on Oct 01.\n\nPay by card, ACH, or link in the invoice. You can also mark it paid from your dashboard.\n\n— The Invoicely team",
    labels: ["Finance"],
  },
  {
    n: 3, minsAgo: 130, subject: "Your flight SFO → JFK was moved to 10:40 AM",
    fromName: "Delta Air Lines", fromEmail: "no-reply@delta.com",
    body: "Hello Alex Rivera,\n\nYour itinerary has been updated. Flight DL 1174 now departs SFO at 10:40 AM (was 9:15 AM) and arrives JFK 1:55 PM, gate C18. Seat 14A is confirmed.\n\nCheck in 24 hours before departure at delta.com. Your confirmation is 8FK2QP.\n\n— Delta",
    important: true, labels: ["Travel"],
  },
  {
    n: 4, minsAgo: 4 * hr, subject: "3 takeaways from the LLM inference workshop",
    fromName: "The Latent Space", fromEmail: "notes@latent.space",
    body: "This week's issue:\n\n• Speculative decoding is now the default win — when the draft model is small and cheap.\n• Serving costs keep falling 10x a year; your architecture should assume that.\n• Tool-calling reliability: validate schemas server-side, always.\n\nFull notes inside. — TL",
    read: true, labels: ["News"],
  },
  {
    n: 5, minsAgo: 5 * hr, subject: "Dinner on Thursday?",
    fromName: "Sam Okafor", fromEmail: "sam.okafor@gmail.com",
    body: "Hey Alex! Still on for Thursday? I'm thinking Cefiro's new spot on 9th — the one that only opened last month. I'll book for 7 if you're in.\n\nAlso bring the book you promised me 😄\n\nSam",
    labels: ["Personal"],
  },
  {
    n: 6, minsAgo: 26 * hr, subject: "Your statement for September is ready",
    fromName: "Meridian Bank", fromEmail: "no-reply@meridianbank.com",
    body: "Dear Mr. Rivera,\n\nYour monthly statement for checking ****4417 is available. Statement period balance: $8,412.55.\n\nThis is a computer-generated message; please do not reply.",
    read: true, labels: ["Finance"],
  },
  {
    n: 7, minsAgo: 29 * hr, subject: "Re: Re: Contract redlines — 3 items left",
    fromName: "Dana Whitfield", fromEmail: "d.whitfield@hartwell-legal.com",
    body: "Alex —\n\nClient signed off on everything except the following three. We can close this out once you confirm:\n\n1. Liability cap at 12 months of fees (we moved from 6).\n2. IP assignment stays mutual — they won't budge, but I softened the schedule.\n3. Governing law: Delaware, not New York.\n\nWant to take a 15-min call tomorrow to walk through the final PDF? Dana",
    read: false, starred: true, important: true, labels: ["Work"],
  },
  {
    n: 8, minsAgo: 2 * day, subject: "PSA: Parking validation code changes Monday",
    fromName: "Facilities", fromEmail: "facilities@meridianlabs.com",
    body: "Hi team,\n\nStarting Monday the garage validation system moves to a new code format. Your code will be emailed to you on Sunday. Old codes stop working at 5 PM Monday.\n\n— Facilities",
    read: true,
  },
  {
    n: 9, minsAgo: 2 * day, subject: "You've been added to the 'Atlas' workspace",
    fromName: "Notion", fromEmail: "team@notion.com",
    body: "Priya Sharma invited you to the Atlas workspace on Notion.\n\nAccept the invitation to collaborate on shared docs, databases, and wikiespaces.\n\n— Notion",
    read: true,
  },
  {
    n: 10, minsAgo: 2 * day + 3 * hr, subject: "Weekend trip to Tahoe — it's settled",
    fromName: "Mom", fromEmail: "maria.rivera@gmail.com",
    body: "Alex! The Tahoe trip is set — we're renting the same lake house as last year. You and Sam are both coming up Saturday around noon. Dad is doing the salmon again (don't be mad).\n\nPack a swimsuit. It's going to be warm.\n\nLove, Mom",
    labels: ["Personal"],
  },
  {
    n: 11, minsAgo: 3 * day, subject: "URGENT: your domain indexpilot.dev renews in 7 days",
    fromName: "NorthStar Registrar", fromEmail: "billing@northstar-registrar.com",
    body: "Your domain indexpilot.dev expires on Oct 18.\n\nCurrent renewal price is $14.00/yr. Domains not renewed are held for 30 days before release.\n\nRenew now to avoid interruption of service.",
    important: true, labels: ["Finance"],
  },
  {
    n: 12, minsAgo: 3 * day + 5 * hr, subject: "Lunch & learn: evaluating AI agents in practice",
    fromName: "Engineering", fromEmail: "eng-team@meridianlabs.com",
    body: "Hi all,\n\nThursday 12:00–12:45 in the 6th floor kitchen. Maya will walk through how we eval the triage agent: golden sets, regression tracking, and the two failure modes we keep hitting.\n\nBring snacks. — Eng",
    read: true, labels: ["Work"],
  },
  {
    n: 13, minsAgo: 3 * day + 9 * hr, subject: "Onboarding feedback for the new hires",
    fromName: "People Team", fromEmail: "people@meridianlabs.com",
    body: "Hi Alex,\n\nCould you share 3–5 bullets of feedback on the onboarding experience for the two new engineers? We're iterating on week one and your input matters.\n\nReply by Friday and we'll roll it into the report. Thanks!",
    read: true, labels: ["Work"],
  },
  {
    n: 14, minsAgo: 4 * day, subject: "Your package has been delivered",
    fromName: "SwiftShip", fromEmail: "updates@swiftship.com",
    body: "Your package (1 of 1) was delivered to the front desk at 2:14 PM.\n\nTracking #: SS-88231-9904. If it isn't in hand within 2 hours, contact the desk.",
    read: true,
  },
  {
    n: 15, minsAgo: 4 * day + 6 * hr, subject: "Interview loop feedback: Maya Chen",
    fromName: "Ravi Patel", fromEmail: "ravi.patel@meridianlabs.com",
    body: "Alex,\n\nFeedback from Maya's system-design loop is in — strong on tradeoff framing, a bit light on observability. Consensus: hire, L5-.\n\nCan you approve the offer band before EOD? The candidate is waiting on us and the comp band needs your sign-off.\n\nRavi",
    important: true, labels: ["Work"],
  },
  {
    n: 16, minsAgo: 5 * day, subject: "Your membership receipt — Ironworks Gym",
    fromName: "Ironworks Gym", fromEmail: "members@ironworks.fit",
    body: "Receipt #4482: Monthly membership $68.00, charged to card ending 8210.\n\nYour next billing date is Oct 02. — Ironworks",
    read: true, archived: true, labels: ["Finance"],
  },
  {
    n: 17, minsAgo: 5 * day + 2 * hr, subject: "You're the 1,000,000th visitor!!",
    fromName: "MEGASWEEP", fromEmail: "promo@luckydraw-ent.net",
    body: "CONGRATULATIONS!! You have been randomly selected to receive a $5,000 gift card. Reply YES to claim your prize before midnight. This is NOT a scam. Terms apply. (They apply.)",
    read: true, trashed: true, labels: ["Spam"],
  },
  {
    n: 18, minsAgo: 5 * day + 8 * hr, subject: "Design review moved to Friday 3 PM",
    fromName: "Priya Sharma", fromEmail: "priya.sharma@meridianlabs.com",
    body: "Quick heads-up — the design review for the new dashboard slides to Friday 3 PM so the whole pod can attend. Calendar invite updated. See you there.\n\nPriya",
    read: true, labels: ["Work"],
  },
  {
    n: 19, minsAgo: 6 * day, subject: "New sign-in to your Google Account",
    fromName: "Google Accounts", fromEmail: "no-reply@accounts.google.com",
    body: "A new device signed in to your account alex.rivera@gmail.com.\n\nDevice: Chrome on macOS · Location: San Francisco, US · Time: today.\n\nIf this wasn't you, secure your account now.",
    read: true, important: true,
  },
  {
    n: 20, minsAgo: 6 * day + 4 * hr, subject: "Your cloud bill summary (August): $842.10",
    fromName: "CloudNine Billing", fromEmail: "billing@cloudnine.io",
    body: "August usage: $842.10 (down 12% from July).\n\nTop line items: inference 61%, storage 19%, egress 12%, other 8%. No anomalies detected.\n\n— CloudNine Billing",
    read: true, labels: ["Finance"],
  },
  {
    n: 21, minsAgo: 7 * day, subject: "Re: Re: Re: Parking spot swap",
    fromName: "Tomás Alvarez", fromEmail: "tomas.a@meridianlabs.com",
    body: "Deal! B-214 for C-090 on Mondays. I'll grab you a coffee on the first swap as per tradition.\n\nTomás",
    read: true, archived: true,
  },
  {
    n: 22, minsAgo: 8 * day, subject: "Your refund of $129.40 has been issued",
    fromName: "Northwind Supply", fromEmail: "support@northwindsupply.com",
    body: "Hi Alex,\n\nYour refund for order #NN-77120 (Mechanical keyboard, returned defective) of $129.40 has been issued to your original payment method. Allow 3–5 business days.\n\n— Northwind",
    read: true, labels: ["Finance"],
  },
  {
    n: 23, minsAgo: 8 * day + 5 * hr, subject: "Happy birthday, Alex! 🎂",
    fromName: "Jules Tan", fromEmail: "jules.tan@hey.com",
    body: "HAPPY BIRTHDAY!! Twenty years of being an excellent human. Cake is on me if you're in the city this week. Let's do the usual — tacos, terrible movies, zero sleep.\n\nJules",
    read: true, labels: ["Personal"],
  },
  {
    n: 24, minsAgo: 9 * day, subject: "2FA device added to your account",
    fromName: "GitHub", fromEmail: "noreply@github.com",
    body: "A new two-factor authentication device was added to your account.\n\nDevice: iPhone 17 · San Francisco, US\n\nIf this wasn't you, review your account security immediately.",
    read: true, archived: true,
  },
  {
    n: 25, minsAgo: 10 * day, subject: "Your weekly digest: 42 emails, 9 important",
    fromName: "MailPulse", fromEmail: "digest@mailpulse.app",
    body: "Your week in inbox: 42 emails, 9 flagged important, median reply time 3h 12m. Best day to answer: Tuesday. Full report attached.\n\n— MailPulse",
    read: true, labels: ["News"],
  },
  {
    n: 26, minsAgo: 11 * day, subject: "Re: Onboarding feedback for the new hires",
    fromName: "People Team", fromEmail: "people@meridianlabs.com",
    body: "Got it, thank you — the bullets are in. One more request if you have a minute: how would you rate the week-one doc sync, 1–5?\n\nPeople Team",
    read: true, archived: true, labels: ["Work"],
  },
];

const INCOMING_POOL: Omit<Seed, "n" | "minsAgo">[] = [
  {
    subject: "Standup notes — blockers from 9:30",
    fromName: "Engineering", fromEmail: "eng-team@meridianlabs.com",
    body: "Blockers from this morning's standup:\n\n• Payments sandbox still flaky on retries (owner: Marco).\n• Feature flag for the new triage view needs QA sign-off.\n• Nothing else. Full notes in the doc.",
    labels: ["Work"],
  },
  {
    subject: "A seat on the 10:40 Delta flight just became available",
    fromName: "Delta Air Lines", fromEmail: "no-reply@delta.com",
    body: "Good news, Alex — a discounted seat on your SFO → JFK flight has opened. You can swap to seat 32C at no charge from your trip page.\n\n— Delta",
    important: true, labels: ["Travel"],
  },
  {
    subject: "Quick question about the launch checklist",
    fromName: "Priya Sharma", fromEmail: "priya.sharma@meridianlabs.com",
    body: "One more before I lock the plan: the launch checklist has 41 items — can we cut the two 'nice to have' analytics ones for GA and do them at +1 week? I think that unblocks the legal handoff today.\n\nPriya",
    important: true, labels: ["Work"],
  },
  {
    subject: "Your invoice INV-2042 has been sent",
    fromName: "Invoicely", fromEmail: "billing@invoicely.com",
    body: "Invoice INV-2042 ($800.00 — Retainer, October) was sent to priya.sharma@meridianlabs.com and is due in 14 days.\n\n— Invoicely",
    labels: ["Finance"],
  },
  {
    subject: "The book you promised me — I have three guesses",
    fromName: "Sam Okafor", fromEmail: "sam.okafor@gmail.com",
    body: "Reminder that Thursday is coming and I am emotionally invested in this book now.\n\nSam",
    labels: ["Personal"],
  },
  {
    subject: "Security check-in: password was updated",
    fromName: "Google Accounts", fromEmail: "no-reply@accounts.google.com",
    body: "Your password for alex.rivera@gmail.com was just updated from Chrome on macOS.\n\nIf this wasn't you, secure your account now.",
    important: true,
  },
  {
    subject: "New: batch triage for newsletters is live in your plan",
    fromName: "MailPulse", fromEmail: "digest@mailpulse.app",
    body: "News: batch triage just landed on your plan. Group, archive, and digest newsletters in one action. No changes needed — it's on by default.\n\n— MailPulse",
    labels: ["News"],
  },
  {
    subject: "Tahoe house: bring extra towels",
    fromName: "Mom", fromEmail: "maria.rivera@gmail.com",
    body: "House update: the lake house now has a new deck, but the towel supply is, as always, tragic. Bring two each. Dad confirmed the grill is fixed.\n\nMom",
    labels: ["Personal"],
  },
];

export function seedMessages(now: number): NewMailInput[] {
  return SEEDS.map((s) => ({
    remoteId: `demo-${s.n}`,
    subject: s.subject,
    fromName: s.fromName,
    fromEmail: s.fromEmail,
    toEmails: [DEMO_EMAIL],
    snippet: s.body.replace(/\s+/g, " ").trim().slice(0, 180),
    bodyText: s.body,
    date: now - s.minsAgo * min,
    read: s.read ?? false,
    starred: s.starred ?? false,
    important: s.important ?? false,
    archived: s.archived ?? false,
    trashed: s.trashed ?? false,
    labels: s.labels ?? [],
  }));
}

/** Seed the demo account's mailbox (idempotent). */
export async function seedDemoAccount(accountId: number): Promise<number> {
  const d = await initDb();
  const existing = await d.get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM messages WHERE account_id = ?",
    [accountId]
  );
  if ((existing?.c ?? 0) > 0) return existing!.c;
  const now = Date.now();
  for (const m of seedMessages(now)) {
    await d.run(
      `INSERT INTO messages (account_id, remote_id, subject, from_name, from_email, to_json, snippet, body_text, message_date, read, starred, important, archived, trashed, labels, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId, m.remoteId, m.subject, m.fromName, m.fromEmail,
        JSON.stringify(m.toEmails), m.snippet, m.bodyText ?? null, m.date,
        m.read ? 1 : 0, m.starred ? 1 : 0, m.important ? 1 : 0,
        m.archived ? 1 : 0, m.trashed ? 1 : 0, JSON.stringify(m.labels ?? []), now,
      ]
    );
  }
  return SEEDS.length;
}

/** Add a new incoming mail to the demo inbox (cycles through the pool). */
export async function simulateIncoming(accountId: number): Promise<NewMailInput> {
  const d = await initDb();
  const count = (
    await d.get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM messages WHERE account_id = ?",
      [accountId]
    )
  )?.c ?? 0;
  const seed = INCOMING_POOL[count % INCOMING_POOL.length];
  const remoteId = `demo-live-${count + 1}-${Math.floor(Date.now() / 1000)}`;
  const date = Date.now();
  await d.run(
    `INSERT INTO messages (account_id, remote_id, subject, from_name, from_email, to_json, snippet, body_text, message_date, important, labels, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId, remoteId, seed.subject, seed.fromName, seed.fromEmail,
      JSON.stringify([DEMO_EMAIL]),
      seed.body.replace(/\s+/g, " ").trim().slice(0, 180),
      seed.body, date, seed.important ? 1 : 0, JSON.stringify(seed.labels ?? []), date,
    ]
  );
  return {
    remoteId, subject: seed.subject, fromName: seed.fromName, fromEmail: seed.fromEmail,
    toEmails: [DEMO_EMAIL], snippet: seed.body.replace(/\s+/g, " ").trim().slice(0, 180),
    bodyText: seed.body, date, read: false, starred: false,
    important: seed.important ?? false, archived: false, trashed: false, labels: seed.labels ?? [],
  };
}
