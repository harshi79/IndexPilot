"use client";

import { Fragment } from "react";

/** Minimal, safe markdown: paragraphs, bold, inline code, bullets, numbers, hr. */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.92em] text-accent">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');
  out = out.replace(
    /(^|\s)\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '$1<a href="$2" target="_blank" rel="noreferrer" class="text-accent underline decoration-accent/40 hover:decoration-accent">$3</a>'
  );
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: number) => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(
      <Tag
        key={`l${key}`}
        className={`my-1.5 space-y-1 pl-4 text-[13.5px] leading-relaxed ${
          list.ordered ? "list-decimal marker:text-ink-3" : "list-disc marker:text-ink-3"
        }`}
      >
        {list.items.map((it, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(it) }} />
        ))}
      </Tag>
    );
    list = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (bullet) {
      if (!list || list.ordered) {
        flushList(i);
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      return;
    }
    if (ordered) {
      if (!list || !list.ordered) {
        flushList(i);
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[2]);
      return;
    }
    flushList(i);
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={i} className="my-2.5 border-line" />);
      return;
    }
    if (!line.trim()) return;
    out.push(
      <p key={i} className="my-1.5 text-[13.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: inline(line) }} />
    );
  });
  flushList(lines.length);

  return (
    <div className="text-ink-2">
      {out.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </div>
  );
}
