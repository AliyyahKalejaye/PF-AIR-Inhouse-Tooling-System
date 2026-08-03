"use client";

// App Router's error boundary for everything under the root layout — this
// catches render-time exceptions in any page/component (a bad response
// shape the code didn't expect, a null-ref bug, etc.) that isn't already
// handled by that screen's own try/catch. Next.js renders this in place
// of whatever crashed rather than a blank white screen or a raw stack
// trace. Deliberately self-contained, same reasoning as not-found.tsx —
// whatever crashed might have been inside a component this file would
// otherwise depend on.

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
    console.error("Unhandled error in a page:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-8 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </div>
      <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-sm text-[13.5px] text-slate-500">
        This page ran into an unexpected error. Try again, or head back to the Tool Hub if it
        keeps happening.
      </p>
      <div className="mt-6 flex gap-2.5">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        {/* Plain <a>, not next/link — a full reload is the safer bet here
        since client-side routing re-runs the same React tree that just
        crashed, which could immediately hit the same error again. */}
        <a href="/hub" className="btn-secondary">
          Back to Tool Hub
        </a>
      </div>
    </div>
  );
}
