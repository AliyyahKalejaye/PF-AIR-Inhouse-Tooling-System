"use client";

// Shared topbar for every authenticated screen (spec: "use on every
// authenticated screen — copy verbatim, adjust the tool-switcher label
// only"). Two modes: the Tool Hub shows a "Suite Home" indicator; every
// tool page (Inventory, Projects, future tools) passes `toolName` to show
// the tool-switcher pill instead, per the design system spec.

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length >= 2 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const result = `${first}${last}`.toUpperCase();
  return result || "?";
}

export function Topbar({ toolName }: { toolName?: string }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 md:gap-6 md:px-7">
      <Link href="/hub" className="flex shrink-0 items-center gap-2.5 text-[16px] font-extrabold tracking-tight">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[14px] font-extrabold text-white"
          style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
        >
          PF
        </div>
        {/* Full wordmark only where there's room to spare — the "PF" badge
            above is enough of a home-link affordance on narrow screens. */}
        <span className="hidden sm:inline">
          Proforce Tooling <span className="text-[13px] font-medium text-slate-400">/ Suite</span>
        </span>
      </Link>

      {toolName ? (
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 py-1.5 pl-2.5 pr-3 text-[13px] font-semibold text-slate-700">
          <svg width="15" height="15" className="shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <span className="truncate">{toolName}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1.5 text-[13px] font-bold text-slate-500">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
          <span className="hidden sm:inline">Suite Home</span>
        </div>
      )}

      <div className="flex-1" />

      <div className="relative flex shrink-0 items-center gap-2.5 md:gap-4">
        {/* Notifications has no backend yet — shown but clearly inert
            (muted, not-allowed cursor, tooltip) rather than looking
            clickable and silently doing nothing. Settings is a real page
            now (Phase 10) and links there. Both drop below `sm` so the
            essential bits (tool switcher, avatar menu) always have room —
            Settings is still reachable on mobile via the avatar dropdown
            below. */}
        <div
          className="hidden h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 sm:flex"
          title="Notifications — coming soon"
          aria-disabled="true"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </div>
        <Link
          href="/settings"
          title="Settings"
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200 sm:flex"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009.17 19a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}
        >
          {user ? initials(user.name) : "?"}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-12 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <div className="border-b border-slate-100 px-3 py-2.5">
              <div className="truncate text-[13px] font-bold text-slate-900">{user?.name}</div>
              <div className="truncate text-[12px] text-slate-500">{user?.email}</div>
            </div>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={logout}
              className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
