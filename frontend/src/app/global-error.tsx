"use client";

// The one level up from error.tsx: this only fires if the ROOT LAYOUT
// itself throws (error.tsx can't catch that, since error.tsx is rendered
// *inside* the layout). Next.js requires this file to render its own
// <html>/<body> since it fully replaces the root layout when active. No
// Tailwind/global.css classes here on purpose — if the layout crashed,
// there's no guarantee its <head> (which loads globals.css) rendered
// either, so this uses plain inline styles that don't depend on it.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Unhandled error in the root layout:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#f8fafc",
          padding: "0 32px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ marginTop: 8, maxWidth: 380, fontSize: 13.5, color: "#64748b" }}>
          The app hit an unexpected error loading this page. Reloading usually fixes it.
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="/hub"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#334155",
              fontWeight: 700,
              fontSize: 13.5,
              textDecoration: "none",
            }}
          >
            Back to Tool Hub
          </a>
        </div>
      </body>
    </html>
  );
}
