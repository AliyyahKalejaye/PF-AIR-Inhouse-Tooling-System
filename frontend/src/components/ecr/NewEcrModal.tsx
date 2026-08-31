"use client";

// Submit a new Engineering Change Request — same modal shape as
// ComponentModal.tsx (Inventory's Add/Edit form): a fixed-position overlay
// with a scrollable body and a sticky footer, `field`/`btn-primary`/
// `btn-secondary` classes from globals.css. Project and component are both
// optional single-select pickers rather than a search-as-you-type
// component (like MilPickerModal's), since an ECR only ever needs to
// reference one row of each, not build up a list.

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { createEcr, ECRRead } from "@/lib/ecr";
import { listProjects, ProjectListItem } from "@/lib/projects";
import { Component, listComponents } from "@/lib/inventory";

interface Props {
  token: string;
  onClose: () => void;
  onCreated: (ecr: ECRRead) => void;
}

export function NewEcrModal({ token, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [componentId, setComponentId] = useState<string>("");

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listProjects(token).then(setProjects).catch(() => setProjects([]));
    // A single page of up to 500 is plenty for a picker dropdown — the
    // component catalog isn't large enough yet to need search-as-you-type
    // here (Inventory's own list page does full pagination + search for
    // the cases where that matters).
    listComponents(token, { limit: 500 })
      .then((res) => setComponents(res.items))
      .catch(() => setComponents([]));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason for the change is required.");
      return;
    }

    setSubmitting(true);
    try {
      const ecr = await createEcr(token, {
        title: title.trim(),
        reason: reason.trim(),
        description: description.trim() || null,
        project_id: projectId || null,
        component_id: componentId || null,
      });
      onCreated(ecr);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 px-4 py-6 sm:py-14">
      <div className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-12px_rgba(15,23,42,.35)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-[18px] font-extrabold tracking-tight">New Change Request</h2>
            <p className="mt-0.5 text-[12.5px] font-medium text-slate-500">
              Submitted for review — an admin approves or rejects it before anything changes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto px-6 py-6">
            {error && (
              <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
                {error}
              </div>
            )}

            <div className="field">
              <label htmlFor="ecr-title">Title</label>
              <input
                id="ecr-title"
                type="text"
                placeholder="e.g. Swap ESC to a higher-current-rated part"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={300}
              />
            </div>

            <div className="mb-4 flex flex-col gap-3.5 sm:flex-row">
              <div className="field flex-1">
                <label htmlFor="ecr-project">Related project (optional)</label>
                <select
                  id="ecr-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field flex-1">
                <label htmlFor="ecr-component">Related component (optional)</label>
                <select
                  id="ecr-component"
                  value={componentId}
                  onChange={(e) => setComponentId(e.target.value)}
                >
                  <option value="">None</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.sku ? ` (${c.sku})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="ecr-reason">Reason for the change</label>
              <textarea
                id="ecr-reason"
                placeholder="Why is this needed? A test failure, an obsolete part, a design improvement…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
                className="!resize-none"
              />
            </div>

            <div className="field mb-0">
              <label htmlFor="ecr-description">What the change is (optional)</label>
              <textarea
                id="ecr-description"
                placeholder="The specific change being proposed, and its impact on any existing stock or builds…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="!resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
