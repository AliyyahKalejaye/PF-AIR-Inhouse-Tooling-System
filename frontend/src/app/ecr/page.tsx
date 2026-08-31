"use client";

// Engineering Change Requests list — grouped by status like the Projects
// list (see app/projects/page.tsx's ProjectsContent), open items
// (Awaiting review) first per ECR_STATUS_ORDER, sorted by priority then
// recency within each group. "New Change Request" opens NewEcrModal
// rather than a dedicated /ecr/new page — the form is short enough
// (title, reason, two optional pickers, description) that a modal is the
// right amount of ceremony, same call ComponentModal made for Inventory's
// Add Component form. Same modal doubles for editing (see its `editing`
// prop) and a row's "..." menu mirrors ProjectRow's from
// app/projects/page.tsx.
//
// Quick filter chips (All / Assigned to me / Submitted by me) plus a
// simple title/reason text search — client-side, since the list is never
// large enough to need server-side filtering, same reasoning as
// Inventory's own search box.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { NewEcrModal } from "@/components/ecr/NewEcrModal";
import { DeleteEcrModal } from "@/components/ecr/DeleteEcrModal";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { ECRListItem, ECRRead, getEcr, listEcrs } from "@/lib/ecr";
import { ECR_STATUS_ORDER, SUBMITTED_TEXT_COLOR, ecrStatusStyle } from "@/lib/ecr-status";
import { ecrPriorityRank, ecrPriorityStyle } from "@/lib/ecr-priority";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function EcrIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function EcrRow({
  ecr,
  canManage,
  menuOpen,
  onToggleMenu,
  onEdit,
  onDeleteRequest,
}: {
  ecr: ECRListItem;
  canManage: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDeleteRequest: () => void;
}) {
  const style = ecrStatusStyle(ecr.status);
  const priorityStyle = ecrPriorityStyle(ecr.priority);
  const linked = [ecr.project?.title, ecr.component?.name ?? ecr.component_name]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="card relative flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-4">
      <Link
        href={`/ecr/${ecr.id}`}
        className="flex w-full min-w-0 items-center gap-4 overflow-hidden sm:w-auto sm:flex-1"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-700">
          <EcrIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-bold text-slate-900">{ecr.title}</div>
            {ecr.priority !== "medium" && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${priorityStyle.pill}`}>
                {priorityStyle.label}
              </span>
            )}
          </div>
          <div className="truncate text-[13px] text-slate-500">
            {linked || "Not linked to a specific project or component"}
          </div>
        </div>
      </Link>

      <span
        className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${style.pill}`}
        style={ecr.status === "submitted" ? { color: SUBMITTED_TEXT_COLOR } : undefined}
      >
        {style.label}
      </span>
      <span className="hidden shrink-0 text-[12.5px] text-slate-400 sm:inline">
        {ecr.assigned_approver ? `→ ${ecr.assigned_approver.name} · ` : ""}
        {ecr.requester ? `${ecr.requester.name} · ` : ""}
        {formatDate(ecr.created_at)}
      </span>
      <Link href={`/ecr/${ecr.id}`} className="hidden shrink-0 text-slate-300 sm:block">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>

      {canManage && (
        <div className="relative ml-auto shrink-0 sm:ml-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            aria-label={`Actions for ${ecr.title}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <button
                type="button"
                onClick={onEdit}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
                </svg>
                Edit
              </button>
              <button
                type="button"
                onClick={onDeleteRequest}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type QueueFilter = "all" | "assigned" | "mine";

function EcrContent() {
  const { token, user } = useAuth();

  const [ecrs, setEcrs] = useState<ECRListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ECRRead | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ECRListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchEcrs = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    listEcrs(token)
      .then(setEcrs)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load change requests. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchEcrs();
  }, [fetchEcrs]);

  // Close any open row menu on an outside click.
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenuId]);

  function canManage(ecr: ECRListItem): boolean {
    if (!user) return false;
    if (user.role === "admin") return true;
    return user.id === ecr.requester?.id && ecr.status === "submitted";
  }

  async function openEdit(ecr: ECRListItem) {
    if (!token) return;
    setOpenMenuId(null);
    setActionError(null);
    setEditLoading(true);
    try {
      // The row only carries ECRListItem — fetch the full ECRRead so the
      // edit form has description/review_notes-adjacent detail available.
      setEditTarget(await getEcr(token, ecr.id));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't open that request for editing.");
    } finally {
      setEditLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = ecrs;
    if (queueFilter === "assigned" && user) {
      list = list.filter((e) => e.assigned_approver?.id === user.id);
    } else if (queueFilter === "mine" && user) {
      list = list.filter((e) => e.requester?.id === user.id);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.title.toLowerCase().includes(q) || e.reason.toLowerCase().includes(q),
      );
    }
    return list;
  }, [ecrs, queueFilter, search, user]);

  const grouped = ECR_STATUS_ORDER.map((status) => ({
    status,
    items: filtered
      .filter((e) => e.status === status)
      .sort((a, b) => {
        const rankDiff = ecrPriorityRank(a.priority) - ecrPriorityRank(b.priority);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
  })).filter((group) => group.items.length > 0);

  const QUEUE_TABS: { value: QueueFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "assigned", label: "Assigned to me" },
    { value: "mine", label: "Submitted by me" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Engineering Change Requests" />

      <div className="flex-1 px-4 pb-6 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
        <div className="mb-[22px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">
              Engineering Change Requests
            </h1>
            <p className="mt-1 text-[14px] text-slate-500">
              Submit, review, and track changes to released projects and components
            </p>
          </div>
          <button type="button" onClick={() => setShowNewModal(true)} className="btn-primary self-start">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Change Request
          </button>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {QUEUE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setQueueFilter(tab.value)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                  queueFilter === tab.value
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-indigo-100 bg-white px-3 py-1.5 sm:w-64">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search title or reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border-none bg-transparent text-[13px] text-slate-700 outline-none"
            />
          </div>
        </div>

        {loadError && (
          <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
            {loadError}
          </div>
        )}
        {actionError && (
          <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
            {actionError}
          </div>
        )}

        {loading && <div className="py-16 text-center text-[13.5px] font-medium text-slate-400">Loading…</div>}

        {!loading && !loadError && ecrs.length === 0 && (
          <div className="card flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <EcrIcon />
            </div>
            <p className="text-[13.5px] font-medium text-slate-500">No change requests yet.</p>
            <button type="button" onClick={() => setShowNewModal(true)} className="btn-primary">
              New Change Request
            </button>
          </div>
        )}

        {!loading && !loadError && ecrs.length > 0 && filtered.length === 0 && (
          <div className="card py-16 text-center text-[13.5px] font-medium text-slate-500">
            No change requests match this filter.
          </div>
        )}

        {!loading &&
          grouped.map((group) => {
            const style = ecrStatusStyle(group.status);
            return (
              <div key={group.status} className="mb-8">
                <div className="mb-3.5 flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  <span className="text-[12.5px] font-extrabold uppercase tracking-wide text-slate-600">
                    {style.label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-bold text-slate-500">
                    {group.items.length}
                  </span>
                  <span className="ml-1 h-px flex-1 bg-slate-200" />
                </div>
                <div className="flex flex-col gap-3">
                  {group.items.map((ecr) => (
                    <EcrRow
                      key={ecr.id}
                      ecr={ecr}
                      canManage={canManage(ecr)}
                      menuOpen={openMenuId === ecr.id}
                      onToggleMenu={() => setOpenMenuId(openMenuId === ecr.id ? null : ecr.id)}
                      onEdit={() => void openEdit(ecr)}
                      onDeleteRequest={() => {
                        setOpenMenuId(null);
                        setDeleteTarget(ecr);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      <FootNav current="ecr" />

      {showNewModal && token && (
        <NewEcrModal
          token={token}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            fetchEcrs();
          }}
        />
      )}

      {editTarget && token && (
        <NewEcrModal
          token={token}
          editing={editTarget}
          onClose={() => setEditTarget(null)}
          onCreated={() => {
            setEditTarget(null);
            fetchEcrs();
          }}
        />
      )}

      {editLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="rounded-xl bg-white px-5 py-3 text-[13px] font-semibold text-slate-600 shadow-lg">
            Loading…
          </div>
        </div>
      )}

      {deleteTarget && token && (
        <DeleteEcrModal
          token={token}
          ecr={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            fetchEcrs();
          }}
        />
      )}
    </div>
  );
}

export default function EcrPage() {
  return (
    <ProtectedRoute>
      <EcrContent />
    </ProtectedRoute>
  );
}
