// App Router's special file for unmatched routes (any URL that doesn't
// match a page — a mistyped link, a stale bookmark to a deleted project,
// etc.). Deliberately self-contained (no Topbar/FootNav, no auth check) —
// this needs to render even for a URL that doesn't correspond to any real
// route or session state, so it can't depend on anything that assumes one.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-8 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>
      <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-[13.5px] text-slate-500">
        This page doesn&apos;t exist, or you may have followed a stale link. Double check the
        address, or head back to the Tool Hub.
      </p>
      <Link href="/hub" className="btn-primary mt-6">
        Back to Tool Hub
      </Link>
    </div>
  );
}
