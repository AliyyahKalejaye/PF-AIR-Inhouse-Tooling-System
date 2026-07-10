import { apiGet } from "@/lib/api";

// This is a Phase 1 scaffolding placeholder — it exists to prove the
// frontend-to-backend wiring works end to end (Cloudflare Pages -> Render).
// Phase 3 replaces this with the real Landing page from the approved mockup.

async function getBackendStatus() {
  try {
    const data = await apiGet<{ status: string }>("/api/v1/health");
    return data.status === "ok";
  } catch {
    return false;
  }
}

export default async function Home() {
  const backendUp = await getBackendStatus();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="card p-8 text-center max-w-md">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-600 to-purple-600 font-extrabold text-white">
          PF
        </div>
        <h1 className="text-xl font-extrabold tracking-tight">Proforce Tooling</h1>
        <p className="mt-2 text-sm text-slate-500">
          Phase 1 scaffold is live. Backend connection:{" "}
          <span className={backendUp ? "text-emerald-500 font-semibold" : "text-rose-500 font-semibold"}>
            {backendUp ? "connected" : "not reachable"}
          </span>
        </p>
        <p className="mt-4 text-xs text-slate-400">
          The real Landing / Sign-up / Login / Tool Hub screens ship in Phase 3.
        </p>
      </div>
    </main>
  );
}
