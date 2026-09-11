import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IndexPilot — Your inbox, piloted",
    template: "%s · IndexPilot",
  },
  description:
    "A professional AI Gmail manager. Multiple accounts, no walls, bring your own API keys from any provider, and an agent that does the work — not just chat.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0a09" },
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
  ],
};

// Applies stored appearance (default: dark) before paint to avoid a flash.
const themeInit = `
(function () {
  try {
    var raw = localStorage.getItem("ip_appearance");
    var mode = raw ? JSON.parse(raw).mode : null;
    if (!mode) mode = "dark";
    var dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    var accent = raw ? JSON.parse(raw).accent : null;
    if (accent && accent !== "gold") document.documentElement.dataset.accent = accent;
    var density = raw ? JSON.parse(raw).density : null;
    if (density) document.documentElement.dataset.density = density;
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen bg-bg text-ink font-sans">{children}</body>
    </html>
  );
}
