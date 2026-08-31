"use client";

// ECR detail/review page. Real id read via usePathname(), not useParams()
// — same static-export reasoning as ProjectDetailClient.tsx (see that
// file's comment, and app/ecr/[id]/page.tsx's).
//
// Actions shown depend on both `ecr.status` and the signed-in user (from
// useAuth(), mirroring api/routes/ecr.py's own checks — this is a UI
// convenience, not the real gate: the backend rejects anything this page
// happens to render a button for regardless):
//   - submitted + tagged approver -> Approve / Reject (with an optional
//                                    note) — no admin escape hatch here,
//                                    see _require_tagged_approver
//   - approved  + anyone          -> Mark Implemented (closes the loop
//                                    once the real-world change has
//                                    actually been made)
//   - requester while submitted, or
//     UserRole.admin (rare in    -> Edit / Delete (see canManage below)
//     practice — see the User
//     model)
//
// The discussion trail (EcrComments) has no such gating — anyone who can
// view the request can comment on it, at any status — and doubles as a
// reminder mechanism: posting notifies whichever of {assigned_approver,
// requester} isn't the comment's author.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { NewEcrModal } from "@/components/ecr/NewEcrModal";
import { DeleteEcrModal } from "@/components/ecr/DeleteEcrModal";
import { EcrComments } from "@/components/ecr/EcrComments";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { approveEcr, ECRRead, getEcr, implementEcr, rejectEcr } from "@/lib/ecr";
import { ecrStatusStyle, SUBMITTED_TEXT_COLOR } from "@/lib/ecr-status";
import { ecrPriorityStyle } from "@/lib/ecr-priority";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EcrDetailContent() {
  const { token, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const ecrId = pathname.split("/")[2] ?? "";

  const [ecr, setEcr] = useState<ECRRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [decisionAction, setDecisionAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const fetchEcr = useCallback(() => {
    if (!token || !ecrId) return;
    setLoading(true);
    setLoadError(null);
    getEcr(token, ecrId)
      .then(setEcr)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load this change request.");
      })
      .finally(() => setLoading(false));
  }, [token, ecrId]);

  useEffect(() => {
    fetchEcr();
  }, [fetchEcr]);

  async function submitDecision() {
    if (!token || !ecr || !decisionAction) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated =
        decisionAction === "approve"
          ? await approveEcr(token, ecr.id, { review_notes: reviewNotes.trim() || null })
          : await rejectEcr(token, ecr.id, { review_notes: reviewNotes.trim() || null });
      setEcr(updated);
      setDecisionAction(null);
      setReviewNotes("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function markImplemented() {
    if (!token || !ecr) return;
    setBusy(true);
    setActionError(null);
    try {
      setEcr(await implementEcr(token, ecr.id));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // UserRole.admin is an escape hatch for edit/delete that's basically
  // never true in practice — this app has no real admin-provisioning flow
  // — but approve/reject has no such escape hatch on the backend (see
  // api/routes/ecr.py's _require_tagged_approver): only the exact person
  // tagged as assigned_approver can decide, full stop.
  const isAdmin = user?.role === "admin";
  const isOwner = !!user && !!ecr && user.id === ecr.requester?.id;
  const isTaggedApprover = !!user && !!ecr && user.id === ecr.assigned_approver?.id;
  const canManage = !!ecr && (isAdmin || (isOwner && ecr.status === "submitted"));
  const canDecide = isTaggedApprover;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Engineering Change Requests" />

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
        <Link href="/ecr" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All change requests
        </Link>

        {loading && <div className="py-16 text-center text-[13.5px] font-medium text-slate-400">Loading…</div>}

        {!loading && loadError && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
            {loadError}
          </div>
        )}

        {!loading && ecr && (
          <>
            <div className="card px-5 py-5 sm:px-6 sm:py-6">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-[20px] font-extrabold leading-tight tracking-tight sm:text-[22px]">
                  {ecr.title}
                </h1>
                <div className="flex shrink-0 items-center gap-2">
                  {ecr.priority !== "medium" && (
                    <span
                      className={`rounded-full px-3 py-1 text-[12px] font-bold ${ecrPriorityStyle(ecr.priority).pill}`}
                    >
                      {ecrPriorityStyle(ecr.priority).label}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-3 py-1 text-[12px] font-bold ${ecrStatusStyle(ecr.status).pill}`}
                    style={ecr.status === "submitted" ? { color: SUBMITTED_TEXT_COLOR } : undefined}
                  >
                    {ecrStatusStyle(ecr.status).label}
                  </span>
                </div>
              </div>

              <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-slate-500">
                <span>Requested by {ecr.requester?.name ?? "Unknown"}</span>
                <span>·</span>
                <span>{formatDateTime(ecr.created_at)}</span>
                {ecr.project && (
                  <>
                    <span>·</span>
                    <Link href={`/projects/${ecr.project.id}`} className="font-semibold text-indigo-600">
                      Project: {ecr.project.title}
                    </Link>
                  </>
                )}
                {ecr.component ? (
                  <>
                    <span>·</span>
                    <Link href="/inventory" className="font-semibold text-indigo-600">
                      Component: {ecr.component.name}
                    </Link>
                  </>
                ) : (
                  ecr.component_name && (
                    <>
                      <span>·</span>
                      <span>Component: {ecr.component_name} (not yet in Inventory)</span>
                    </>
                  )
                )}
                {ecr.assigned_approver && (
                  <>
                    <span>·</span>
                    <span>Assigned to {ecr.assigned_approver.name}</span>
                  </>
                )}
              </div>

              <div className="mb-4">
                <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                  Reason for the change
                </div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{ecr.reason}</p>
              </div>

              {ecr.description && (
                <div className="mb-4">
                  <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                    What the change is
                  </div>
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">
                    {ecr.description}
                  </p>
                </div>
              )}

              {ecr.reviewer && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-3">
                  <div className="text-[12.5px] font-bold text-slate-700">
                    {ecr.status === "rejected" ? "Rejected" : "Reviewed"} by {ecr.reviewer.name}
                  </div>
                  {ecr.review_notes && (
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
                      {ecr.review_notes}
                    </p>
                  )}
                </div>
              )}

              {canManage && (
                <div className="mt-5 flex gap-2.5 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => setShowEdit(true)} className="btn-secondary">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDelete(true)}
                    className="btn-secondary !text-rose-600"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                    </svg>
                    {isAdmin && ecr.status !== "submitted" ? "Delete" : "Withdraw"}
                  </button>
                </div>
              )}
            </div>

            {actionError && (
              <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
                {actionError}
              </div>
            )}

            {ecr.status === "submitted" && !canDecide && (
              <div className="card mt-4 px-5 py-4 text-[13px] text-slate-500 sm:px-6">
                {ecr.assigned_approver
                  ? `Awaiting review from ${ecr.assigned_approver.name}.`
                  : "Nobody's been tagged to review this yet — only the tagged approver can approve or reject it."}
              </div>
            )}

            {ecr.status === "submitted" && canDecide && (
              <div className="card mt-4 px-5 py-5 sm:px-6">
                <div className="mb-3 text-[13.5px] font-bold text-slate-900">Review this request</div>
                {decisionAction ? (
                  <div>
                    <div className="field mb-3">
                      <label htmlFor="review-notes">
                        Note {decisionAction === "reject" ? "(why it's being rejected)" : "(optional)"}
                      </label>
                      <textarea
                        id="review-notes"
                        rows={3}
                        className="!resize-none"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder={
                          decisionAction === "approve"
                            ? "Any conditions or context for the record…"
                            : "Let the requester know why…"
                        }
                      />
                    </div>
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => void submitDecision()}
                        disabled={busy}
                        className={`btn-primary disabled:opacity-60 ${
                          decisionAction === "reject" ? "!bg-rose-600 !shadow-none" : ""
                        }`}
                      >
                        {busy
                          ? "Saving…"
                          : decisionAction === "approve"
                            ? "Confirm approval"
                            : "Confirm rejection"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDecisionAction(null);
                          setReviewNotes("");
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => setDecisionAction("approve")}
                      className="btn-primary"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisionAction("reject")}
                      className="btn-secondary !text-rose-600"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )}

            {ecr.status === "approved" && (
              <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
                <p className="text-[13.5px] text-slate-600">
                  Once the actual change has been made, mark this implemented to close it out.
                </p>
                <button type="button" onClick={() => void markImplemented()} disabled={busy} className="btn-primary disabled:opacity-60">
                  {busy ? "Saving…" : "Mark implemented"}
                </button>
              </div>
            )}

            {token && <EcrComments token={token} ecrId={ecr.id} currentUserId={user?.id} />}

            {showEdit && token && (
              <NewEcrModal
                token={token}
                editing={ecr}
                onClose={() => setShowEdit(false)}
                onCreated={(updated) => {
                  setShowEdit(false);
                  setEcr(updated);
                }}
              />
            )}

            {showDelete && token && (
              <DeleteEcrModal
                token={token}
                ecr={ecr}
                onCancel={() => setShowDelete(false)}
                onDeleted={() => router.push("/ecr")}
              />
            )}
          </>
        )}
      </div>

      <FootNav current="ecr" />
    </div>
  );
}

export function EcrDetailClient() {
  return (
    <ProtectedRoute>
      <EcrDetailContent />
    </ProtectedRoute>
  );
}
