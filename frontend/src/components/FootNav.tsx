"use client";

// Cross-tool nav footer — shown on every authenticated screen so a user
// working in one tool can always jump to another without going back
// through the hub. Per the design spec, this is the same strip on every
// tool page, just with a different `current` link highlighted.
//
// Inventory Management went live in Phase 5, Projects Progress Report in
// Phase 7, Engineering Change Requests in Phase 12.

import Link from "next/link";

type NavKey = "hub" | "inventory" | "projects" | "ecr";

const LINKS: Array<{
  key: NavKey;
  label: string;
  // Shown instead of `label` below the `sm` breakpoint — the full names
  // ("Engineering Change Requests", "Projects Progress Report") are too
  // long to wrap comfortably in a footer strip on a phone.
  shortLabel: string;
  href: string | null;
  live: boolean;
  icon: React.ReactNode;
}> = [
  {
    key: "hub",
    label: "Tool Hub",
    shortLabel: "Hub",
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
    shortLabel: "Inventory",
    href: "/inventory",
    live: true,
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
    shortLabel: "Projects",
    href: "/projects",
    live: true,
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
    shortLabel: "ECR",
    href: "/ecr",
    live: true,
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
    <div className="flex w-full items-center justify-center border-t border-slate-200 bg-white px-4 py-3 sm:px-8 sm:py-4">
      {/* "Quick jump" lives inside the same flex-wrap row as the link
          pills (rather than as a non-wrapping sibling) so the whole strip
          — label included — can reflow onto multiple lines instead of
          overflowing horizontally on a phone-width viewport. */}
      <div className="flex w-full max-w-4xl flex-wrap items-center justify-center gap-1.5">
        <span className="mr-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:mr-4">
          Quick jump
        </span>
        {LINKS.map((link, i) => {
          const isCurrent = link.key === current;
          const content = (
            <span
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold sm:px-3.5 ${
                isCurrent
                  ? "border-indigo-100 bg-indigo-50 text-indigo-700"
                  : link.live
                    ? "border-transparent text-slate-600"
                    : "border-transparent text-slate-400"
              }`}
              title={link.live ? undefined : "Coming soon"}
            >
              {link.icon}
              <span className="sm:hidden">{link.shortLabel}</span>
              <span className="hidden sm:inline">{link.label}</span>
            </span>
          );
          return (
            <div key={link.key} className="flex items-center gap-1.5">
              {i > 0 && <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />}
              {link.href ? <Link href={link.href}>{content}</Link> : content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
