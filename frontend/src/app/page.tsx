"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

// This is a Phase 1 scaffolding placeholder — it exists to prove the
// frontend-to-backend wiring works end to end (Cloudflare Pages -> Render).
// Phase 3 replaces this with the real Landing page from the approved mockup.
//
// Client component + useEffect (not a server-side fetch) on purpose: the
// site is statically exported (see next.config.js `output: "export"`) so it
// can be hosted on Cloudflare Pages as plain static files. A server-side
// fetch would only run once, at build time, and the "connected" status
// would go stale forever. Fetching client-side, in the browser, means it
// re-checks on every real page load.

export default function Home() {
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    apiGet<{ status: string }>("/api/v1/health")
      .then((data) => setBackendUp(data.status === "ok"))
      .catch(() => setBackendUp(false));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="card p-8 text-center max-w-md">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-600 to-purple-600 font-extrabold text-white">
          PF
        </div>
        <h1 className="text-xl font-extrabold tracking-tight">Proforce Tooling</h1>
        <p className="mt-2 text-sm text-slate-500">
          Phase 1 scaffold is live. Backend connection:{" "}
          <span
            className={
              backendUp === null
                ? "text-slate-400 font-semibold"
                : backendUp
                  ? "text-emerald-500 font-semibold"
                  : "text-rose-500 font-semibold"
            }
          >
            {backendUp === null ? "checking…" : backendUp ? "connected" : "not reachable"}
          </span>
        </p>
        <p className="mt-4 text-xs text-slate-400">
          The real Landing / Sign-up / Login / Tool Hub screens ship in Phase 3.
        </p>
      </div>
    </main>
  );
}