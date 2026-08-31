"use client";

// Shared topbar for every authenticated screen (spec: "use on every
// authenticated screen — copy verbatim, adjust the tool-switcher label
// only"). Two modes: the Tool Hub shows a "Suite Home" indicator; every
// tool page (Inventory, Projects, future tools) passes `toolName` to show
// the tool-switcher pill instead, per the design system spec.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/notifications";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length >= 2 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const result = `${first}${last}`.toUpperCase();
  return result || "?";
}

// Relative-time label for the notification dropdown — "2m ago" / "3h
// ago" / "5d ago" rather than a raw timestamp, to match the compact
// feel of the rest of the dropdown.
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const NOTIFICATION_ICON_PATHS: Record<string, string> = {
  component_out_of_stock: "M12 9v4M12 17h.01M10.3 3.9L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  component_low_stock: "M12 9v4M12 17h.01M10.3 3.9L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  component_deleted: "M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6h14z",
  project_created: "M12 5v14M5 12h14",
  project_status_changed: "M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-4.9M20 14a8 8 0 01-14 4.9",
  project_deleted: "M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6h14z",
  ecr_submitted: "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
  ecr_approved: "M20 6L9 17l-5-5",
  ecr_rejected: "M18 6L6 18M6 6l12 12",
  ecr_implemented: "M20 6L9 17l-5-5",
};

function NotificationBell({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const { unread_count } = await getUnreadCount(token);
      setUnreadCount(unread_count);
    } catch {
      // Polling — a transient failure just means we try again in 30s,
      // not worth surfacing to the user.
    }
  }, [token]);

  // Poll the lightweight unread-count endpoint rather than the full list
  // — the dropdown's actual contents are only fetched on open, below.
  useEffect(() => {
    void refreshUnreadCount();
    const interval = setInterval(() => void refreshUnreadCount(), 30000);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        const res = await listNotifications(token, { limit: 15 });
        setItems(res.items);
        setUnreadCount(res.unread_count);
      } catch {
        // Leave whatever was last successfully loaded (or the empty
        // state) rather than blocking the dropdown from opening at all.
      } finally {
        setLoaded(true);
      }
    }
  }

  async function handleItemClick(notification: Notification) {
    if (!notification.is_read) {
      setItems((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await markNotificationRead(token, notification.id);
      } catch {
        // Best-effort — worst case it shows unread again next refresh.
      }
    }
    setOpen(false);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead(token);
    } catch {
      // Best-effort, same as above.
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => void toggleOpen()}
        title="Notifications"
        className="relative hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200 sm:flex"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
            <span className="text-[13px] font-extrabold text-slate-900">Notifications</span>
            {items.some((n) => !n.is_read) && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {!loaded ? (
              <div className="px-3.5 py-6 text-center text-[13px] text-slate-400">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[13px] text-slate-400">
                You&apos;re all caught up.
              </div>
            ) : (
              items.map((n) => {
                const iconPath = NOTIFICATION_ICON_PATHS[n.type];
                const content = (
                  <div
                    className={`flex gap-2.5 border-b border-slate-50 px-3.5 py-3 last:border-b-0 hover:bg-slate-50 ${
                      n.is_read ? "" : "bg-indigo-50/50"
                    }`}
                  >
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d={iconPath} />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12.5px] font-bold text-slate-900">{n.title}</span>
                        {!n.is_read && (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{n.message}</p>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                  </div>
                );

                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => void handleItemClick(n)}
                    className="block"
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleItemClick(n)}
                    className="block w-full text-left"
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({ toolName }: { toolName?: string }) {
  const { user, logout, token } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 md:gap-6 md:px-7">
      <Link href="/hub" className="flex shrink-0 items-center gap-2.5 text-[16px] font-extrabold tracking-tight">
        <img
          src="/logo.png"
          alt="Proforce Airsystems"
          className="h-8 w-8 shrink-0 object-contain"
        />
        {/* Full wordmark only where there's room to spare — the logo mark
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
        {/* Real notifications feed as of Phase 11 — see
            lib/notifications.ts and NotificationBell above. Settings is a
            real page too (Phase 10) and links there. Both drop below `sm`
            so the essential bits (tool switcher, avatar menu) always have
            room — Settings is still reachable on mobile via the avatar
            dropdown below; notifications is desktop/tablet-only for now. */}
        {token && <NotificationBell token={token} />}
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
