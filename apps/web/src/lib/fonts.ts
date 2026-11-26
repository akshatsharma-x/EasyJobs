import localFont from "next/font/local";

/** Geist Sans (variable, subset) — preloaded: it renders the LCP text. */
export const geistSans = localFont({
  src: "../fonts/Geist-Variable.subset.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

/**
 * Geist Mono (variable, subset) — counts, salaries, times. Preloaded too: otherwise it's discovered from the
 * stylesheet and forms a document → CSS → font chain on the critical path (measured: +300 ms FCP on slow 4G).
 */
export const geistMono = localFont({
  src: "../fonts/GeistMono-Variable.subset.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: true,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});
