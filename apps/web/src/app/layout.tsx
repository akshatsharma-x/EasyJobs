import type { Metadata, Viewport } from "next";
import { geistMono, geistSans } from "@/lib/fonts";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PaletteHost } from "@/components/layout/palette-host";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["jobs in India", "internships", "fresher jobs", "off campus drive", "remote jobs", "new grad", "2026 batch"],
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_IN", title: SITE_NAME, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Providers>
          <a
            href="#main"
            className="sr-only z-[60] rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="min-h-[70dvh]">
            {children}
          </main>
          <SiteFooter />
          <PaletteHost />
        </Providers>
      </body>
    </html>
  );
}
