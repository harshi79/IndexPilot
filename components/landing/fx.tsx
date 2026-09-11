"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Landing motion, per the ui-ux-pro-max skill (motion.csv):
 * - Scroll Reveal (Subtle tier): 300–400ms, power1.out, y offset 8–16px,
 *   trigger 'top 90%', toggleActions 'play none none reverse'.
 * - Initial hidden states are set in JS only immediately before animating,
 *   so no-JS and prefers-reduced-motion users see the final state.
 */

const TRACE_LINES = [
  "▸ get_inbox_overview  → 26 emails · 8 unread",
  "▸ draft_reply(Priya)  → saved to Drafts",
  "▸ archive ×5 newsletters  ✓ inbox cleared",
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function LandingFx({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const extraCleanup: (() => void)[] = [];
    const ctx = gsap.context(() => {
      // 1 — Hero entrance (staggered, 600ms, power3.out).
      const hero = root.querySelector<HTMLElement>(".lp-hero");
      if (hero) {
        const items = gsap.utils.toArray<HTMLElement>(hero.querySelectorAll("[data-hero]"));
        gsap.set(items, { opacity: 0, y: 16 });
        gsap.to(items, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.09,
          delay: 0.08,
        });

        // Cursor spotlight (fine pointers only).
        const spot = hero.querySelector<HTMLElement>(".lp-spotlight");
        if (spot && window.matchMedia("(pointer: fine)").matches) {
          const onMove = (e: MouseEvent) => {
            const r = hero.getBoundingClientRect();
            gsap.to(spot, {
              x: e.clientX - r.left,
              y: e.clientY - r.top,
              duration: 0.7,
              ease: "power2.out",
              overwrite: "auto",
            });
            gsap.to(spot, { opacity: 1, duration: 0.4 });
          };
          const onLeave = () => gsap.to(spot, { opacity: 0, duration: 0.6 });
          hero.addEventListener("mousemove", onMove);
          hero.addEventListener("mouseleave", onLeave);
          extraCleanup.push(
            () => hero.removeEventListener("mousemove", onMove),
            () => hero.removeEventListener("mouseleave", onLeave)
          );
        }
      }

      // 2 — Product mock: slow, gentle float (skill: motion conveys meaning,
      //    nothing flashy).
      const mock = root.querySelector<HTMLElement>(".lp-mock");
      if (mock) {
        gsap.to(mock, {
          y: -9,
          duration: 3.4,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: 1.1,
        });
      }

      // 3 — Live agent trace typing loop inside the mock (no-JS fallback:
      //    the static lines are already in the DOM).
      const traceEl = root.querySelector<HTMLElement>(".lp-trace");
      if (traceEl) {
        const reduced = () =>
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let cancelled = false;
        const run = async () => {
          while (!cancelled) {
            if (reduced()) {
              traceEl.innerHTML = TRACE_LINES.map((l) => `<span class="lp-trace-line">${l}</span>`).join("");
              break;
            }
            for (const line of TRACE_LINES) {
              if (cancelled) break;
              const el = document.createElement("span");
              el.className = "lp-trace-line";
              const caret = document.createElement("span");
              caret.className = "lp-caret";
              caret.textContent = "▍";
              el.appendChild(document.createTextNode(""));
              el.appendChild(caret);
              traceEl.appendChild(el);
              const textNode = el.firstChild as Text;
              for (let i = 1; i <= line.length; i++) {
                if (cancelled) break;
                textNode.nodeValue = line.slice(0, i);
                await new Promise((r) => setTimeout(r, 14 + Math.random() * 22));
              }
              await new Promise((r) => setTimeout(r, 650));
              caret.remove();
            }
            await new Promise((r) => setTimeout(r, 1400));
            if (!cancelled) traceEl.innerHTML = "";
          }
        };
        void run();
        extraCleanup.push(() => {
          cancelled = true;
          traceEl.innerHTML = "";
        });
      }

      // 4 — Scroll reveals (Subtle tier per skill).
      gsap.utils.toArray<HTMLElement>(root.querySelectorAll("[data-reveal]")).forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 12,
          duration: 0.35,
          ease: "power1.out",
          scrollTrigger: {
            trigger: el,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        });
      });

      // 5 — Feature cards: light stagger on section entry.
      gsap.utils.toArray<HTMLElement>(root.querySelectorAll("[data-reveal-group] > *")).forEach((el, i) => {
        gsap.from(el, {
          opacity: 0,
          y: 14,
          duration: 0.45,
          ease: "power2.out",
          delay: (i % 3) * 0.06,
          scrollTrigger: { trigger: el, start: "top 92%", toggleActions: "play none none reverse" },
        });
      });
    }, root);

    return () => {
      extraCleanup.forEach((f) => f());
      ctx.revert();
    };
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
