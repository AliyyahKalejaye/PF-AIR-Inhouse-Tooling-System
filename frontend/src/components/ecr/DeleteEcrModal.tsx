"use client";

// Delete/withdraw confirmation modal — same pattern as
// DeleteProjectModal.tsx. The caller decides whether this is even
// reachable (admin any time, or the requester while still submitted —
// see backend/app/api/routes/ecr.py's delete_ecr); this component just
// confirms and fires the request.

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { deleteEcr } from "@/lib/ecr";

interface Props {
  token: string;
  ecr: { id: string; title: string };
  onCancel: () => void;
  onDeleted: () => void;
}

export function DeleteEcrModal({ token, ecr, onCancel, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteEcr(token, ecr.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that request. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4">
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-7 text-center shadow-[0_30px_60px_-12px_rgba(15,23,42,.35)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
          </svg>
        </div>
        <h2 className="mb-2 text-[18px] font-extrabold tracking-tight">Delete this change request?</h2>
        <p className="mb-5 text-[13.5px] leading-relaxed text-slate-500">
          This will permanently remove <b className="font-bold text-slate-700">&quot;{ecr.title}&quot;</b>. This
          can&apos;t be undone.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-left text-[13px] font-medium text-rose-600">
            {error}
          </div>
        )}

        <div className="flex gap-2.5">
          <button type="button" onClick={onCancel} disabled={deleting} className="btn-secondary flex-1 justify-center">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="btn flex-1 justify-center bg-rose-600 text-white disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
