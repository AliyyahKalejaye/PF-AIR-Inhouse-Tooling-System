"use client";

// Cross-tool nav footer — shown on every authenticated screen so a user
// working in one tool can always jump to another without going back
// through the hub. Per the design spec, this is the same strip on every
// tool page, just with a different `current` link highlighted.
//
// Inventory Management and Projects Progress Report are not wired up yet
// (Phase 5 and Phase 7 respectively) — they're intentionally shown as
// "soon" here even though the original mockup had them tagged "Live",
// since linking to a page that doesn't exist would be a broken link, not
// a real feature. Flip `href` + `live` below once each phase ships.

import Link from "next/link";

type NavKey = "hub" | "inventory" | "projects" | "ecr";

const LINKS: Array<{ key: NavKey; label: string; href: string | null; live: boolean; icon: React.ReactNode }> = [
  {
    key: "hub",
    label: "Tool Hub",
    href: "/hub",
    live: true,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    key: "inventory",
    label: "Inventory Management",
    href: null, // becomes "/inventory" in Phase 5
    live: false,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <path d="M3.27 6.96L12 12l8.73-5.04M12 22.08V12" />
      </svg>
    ),
  },
  {
    key: "projects",
    label: "Projects Progress Report",
    href: null, // becomes "/projects" in Phase 7
    live: false,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    key: "ecr",
    label: "Engineering Change Requests",
    href: null,
    live: false,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
];

export function FootNav({ current }: { current: NavKey }) {
  return (
    <div className="flex w-full items-center justify-center border-t border-slate-200 bg-white px-8 py-4">
      <div className="flex w-full max-w-4xl items-center justify-center gap-1.5">
        <span className="mr-4 whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Quick jump
        </span>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {LINKS.map((link, i) => {
            const isCurrent = link.key === current;
            const content = (
              <span
                className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-semibold ${
                  isCurrent
                    ? "border-indigo-100 bg-indigo-50 text-indigo-700"
                    : link.live
                      ? "border-transparent text-slate-600"
                      : "border-transparent text-slate-400"
                }`}
                title={link.live ? undefined : "Coming soon"}
              >
                {link.icon}
                {link.label}
              </span>
            );
            return (
              <div key={link.key} className="flex items-center gap-1.5">
                {i > 0 && <span className="mx-1 h-4 w-px bg-slate-200" />}
                {link.href ? <Link href={link.href}>{content}</Link> : content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
