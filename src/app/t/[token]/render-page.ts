// Self-contained, mobile-friendly HTML for the scan confirmation page.
// Plain HTML (no React/JS) so it renders instantly after an NFC tap.

import type { ScanResult } from "@/shared/scan";

const TONE_STYLES: Record<ScanResult["tone"], { icon: string; color: string }> =
  {
    started: { icon: "▶", color: "#007ea6" },
    done: { icon: "✓", color: "#16a34a" },
    cancelled: { icon: "■", color: "#d97706" },
    info: { icon: "i", color: "#64748b" },
  };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderScanPage(result: ScanResult, status = 200): Response {
  const { icon, color } = TONE_STYLES[result.tone];
  const title = escapeHtml(result.title);
  const message = escapeHtml(result.message);
  const html = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${color}">
<title>${title} · Toque</title>
<style>
  /* Light only, like the app's default theme: Safari opens this page after a
     tap and doesn't share the PWA's appearance setting. */
  :root { color-scheme: light; --bg: #f2f2f7; --fg: #1c1c1e; --muted: #5b5b61; --card: #ffffff; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
    background: var(--bg); color: var(--fg);
    font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  main { width: 100%; max-width: 420px; background: var(--card); border-radius: 24px; padding: 32px 24px;
    text-align: center; box-shadow: 0 10px 30px rgb(0 0 0 / 0.08); }
  .icon { width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 50%; display: grid; place-items: center;
    background: ${color}; color: #fff; font-size: 34px; font-weight: 700; }
  h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.2; }
  p { margin: 0; color: var(--muted); font-size: 19px; }
  a { display: inline-block; margin-top: 28px; color: ${color}; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
  <div class="icon" aria-hidden="true">${icon}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  <a href="/">Abrir o Toque</a>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
