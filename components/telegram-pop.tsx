"use client";

import { useEffect, useRef, useState } from "react";

const TG_URL = "https://t.me/YoriNetwork";
const SEEN_KEY = "ip_tg_seen";

function TgIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/**
 * "Join our Telegram channel" popup.
 * - Appears once per session (not on every refresh).
 * - Clicking anywhere outside the card (or pressing Esc / X) dismisses it.
 */
export function TelegramPop({ delayMs = 1400 }: { delayMs?: number }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* private mode */
    }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Join our Telegram channel"
      onClick={close}
    >
      <div
        className="tg-pop-card relative w-full max-w-[360px] rounded-2xl border border-line bg-surface p-6 text-center shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          className="icon-btn absolute right-2.5 top-2.5"
          onClick={close}
          aria-label="Close popup"
          title="Close"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-[0_10px_30px_-10px_rgba(34,158,217,0.7)]">
          <TgIcon size={28} />
        </span>

        <h2 className="mt-4 text-[17px] font-bold tracking-tight text-ink">
          Join our Telegram channel
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
          Releases, inbox tips, and the occasional war story — straight from{" "}
          <span className="font-semibold text-ink-2">YoriNetwork</span>.
        </p>

        <a
          href={TG_URL}
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary mt-5 w-full !py-2.5 !text-[13.5px]"
        >
          <TgIcon size={15} />
          Join YoriNetwork
        </a>

        <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">
          No spam · click anywhere outside to dismiss
        </p>
      </div>
    </div>
  );
}
