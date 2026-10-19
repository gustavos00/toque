// GET /t/:token — the https URL stored on each NFC tag. With the app installed, iOS opens it
// through Universal Links (see /.well-known/apple-app-site-association) and this never runs.
// Without the app, this minimal page asks to open it. Nothing is recorded here: the scan is
// registered when the user taps "Feito" in the app popup (POST /api/scan/:token).

import { renderScanPage } from "./render-page";

export async function GET(_request: Request, ctx: RouteContext<"/t/[token]">) {
  const { token } = await ctx.params;
  return renderScanPage(
    {
      title: "Abre a app Toque",
      message: "Instala ou abre a app Toque no iPhone para usar esta etiqueta.",
      tone: "info",
    },
    200,
    { href: `toque://t/${encodeURIComponent(token)}`, label: "Abrir na Toque" },
  );
}

// Keep HEAD (link previews, prefetchers) cheap.
export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
