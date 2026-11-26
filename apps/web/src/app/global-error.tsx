"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }): React.JSX.Element {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.03em", margin: 0 }}>EasyJobs is having a moment</h1>
          <p style={{ color: "#52525b" }}>Please try again.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 10, border: 0, background: "#2b5cff", color: "#fff", fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
