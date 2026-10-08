import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Toque", template: "%s · Toque" },
  description: "Tarefas da casa com tags NFC: toca na tag, a app trata do resto.",
  applicationName: "Toque",
  appleWebApp: { capable: true, title: "Toque", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  // Older iOS versions only read the apple-prefixed tag (Next emits the generic one).
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Light by default; the theme script switches it to black in dark mode.
  themeColor: "#f2f2f7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-PT" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Sets the light/dark class before first paint (no theme flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
