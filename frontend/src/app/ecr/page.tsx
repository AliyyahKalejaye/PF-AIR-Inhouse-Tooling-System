"use client";

// Engineering Change Requests list — grouped by status like the Projects
// list (see app/projects/page.tsx's ProjectsContent), open items
// (Awaiting review) first per ECR_STATUS_ORDER. "New Change Request"
// opens NewEcrModal rather than a dedicated /ecr/new page — the form is
// short enough (title, reason, two optional pickers, description) that a
// modal is the right amount of ceremony, same call ComponentModal made
// for Inventory's Add Component form.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { NewEcrModal } from "@/components/ecr/NewEcrModal";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { ECRListItem, listEcrs } from "@/lib/ecr";
import { ECR_STATUS_ORDER, SUBMITTED_TEXT_COLOR, ecrStatusStyle } from "@/lib/ecr-status";

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

function EcrRow({ ecr }: { ecr: ECRListItem }) {
  const style = ecrStatusStyle(ecr.status);
  const linked = [ecr.project?.title, ecr.component?.name].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/ecr/${ecr.id}`}
      className="card flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-4"
    >
      <div className="flex w-full min-w-0 items-center gap-4 overflow-hidden sm:w-auto sm:flex-1">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-700">
          <EcrIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-slate-900">{ecr.title}</div>
          <div className="truncate text-[13px] text-slate-500">
            {linked || "Not linked to a specific project or component"}
          </div>
        </div>
      </div>

      <span
        className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${style.pill}`}
        style={ecr.status === "submitted" ? { color: SUBMITTED_TEXT_COLOR } : undefined}
      >
        {style.label}
      </span>
      <span className="hidden shrink-0 text-[12.5px] text-slate-400 sm:inline">
        {ecr.requester ? `${ecr.requester.name} · ` : ""}
        {formatDate(ecr.created_at)}
      </span>
      <span className="hidden shrink-0 text-slate-300 sm:block">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </span>
    </Link>
  );
}

function EcrContent() {
  const { token } = useAuth();

  const [ecrs, setEcrs] = useState<ECRListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

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

  const grouped = ECR_STATUS_ORDER.map((status) => ({
    status,
    items: ecrs.filter((e) => e.status === status),
  })).filter((group) => group.items.length > 0);

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

        {loadError && (
          <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
            {loadError}
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
                    <EcrRow key={ecr.id} ecr={ecr} />
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
