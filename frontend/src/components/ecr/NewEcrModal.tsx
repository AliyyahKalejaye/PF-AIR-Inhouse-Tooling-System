"use client";

// Submit a new Engineering Change Request — same modal shape as
// ComponentModal.tsx (Inventory's Add/Edit form): a fixed-position overlay
// with a scrollable body and a sticky footer, `field`/`btn-primary`/
// `btn-secondary` classes from globals.css. Project, component, and
// approver are all SearchableSelect pickers (type-to-filter) rather than
// plain <select>s — the approver list in particular is every user in the
// app (see lib/ecr.ts's listApprovers), which can get long enough that
// scrolling a native dropdown stops being reasonable.
//
// Doubles as the edit modal (same ComponentModal pattern as its own
// isEdit): pass `editing` with the current ECRRead to pre-fill every field
// and call updateEcr instead of createEcr on submit. The caller is
// responsible for only rendering this in edit mode when the viewer is
// actually allowed to edit (the requester while still submitted, or an
// admin) — this component doesn't re-check that itself, matching how
// DeleteProjectModal etc. trust their caller's gating.

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { createEcr, ECRPriority, ECRRead, ECRUserRef, listApprovers, updateEcr } from "@/lib/ecr";
import { listProjects, ProjectListItem } from "@/lib/projects";
import { Component, listComponents } from "@/lib/inventory";
import { SearchableSelect } from "@/components/SearchableSelect";

interface Props {
  token: string;
  editing?: ECRRead | null;
  onClose: () => void;
  onCreated: (ecr: ECRRead) => void;
}

const PRIORITY_OPTIONS: { value: ECRPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function NewEcrModal({ token, editing, onClose, onCreated }: Props) {
  const isEdit = !!editing;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [priority, setPriority] = useState<ECRPriority>(editing?.priority ?? "medium");
  const [projectId, setProjectId] = useState<string>(editing?.project?.id ?? "");
  const [componentId, setComponentId] = useState<string>(editing?.component?.id ?? "");
  // Freeform fallback for a part that isn't in the Inventory catalog yet
  // — mutually exclusive with componentId (picking one clears the other,
  // see the two onChange handlers below), so it's never ambiguous which
  // one the request is actually "about."
  const [componentName, setComponentName] = useState(editing?.component_name ?? "");
  const [assignedApproverId, setAssignedApproverId] = useState<string>(
    editing?.assigned_approver?.id ?? "",
  );

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [approvers, setApprovers] = useState<ECRUserRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listProjects(token).then(setProjects).catch(() => setProjects([]));
    // 200 is the backend's max page size (see ListComponentsParams.limit
    // in app/api/routes/components.py) — asking for more 422s the whole
    // request, which silently left this dropdown empty before (the
    // failure was swallowed by the .catch below). Plenty for a picker at
    // the catalog's current size either way.
    listComponents(token, { limit: 200 })
      .then((res) => setComponents(res.items))
      .catch(() => setComponents([]));
    listApprovers(token).then(setApprovers).catch(() => setApprovers([]));
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
      const payload = {
        title: title.trim(),
        reason: reason.trim(),
        description: description.trim() || null,
        priority,
        project_id: projectId || null,
        component_id: componentId || null,
        component_name: componentId ? null : componentName.trim() || null,
        assigned_approver_id: assignedApproverId || null,
      };
      const ecr = isEdit && editing ? await updateEcr(token, editing.id, payload) : await createEcr(token, payload);
      onCreated(ecr);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.title }));
  const componentOptions = components.map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.sku ?? undefined,
  }));
  const approverOptions = approvers.map((a) => ({ value: a.id, label: a.name, sublabel: a.email }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 px-4 py-6 sm:py-14">
      <div className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-12px_rgba(15,23,42,.35)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-[18px] font-extrabold tracking-tight">
              {isEdit ? "Edit Change Request" : "New Change Request"}
            </h2>
            <p className="mt-0.5 text-[12.5px] font-medium text-slate-500">
              {isEdit
                ? "Still awaiting review — changes here don't restart the approval process."
                : "Tag who needs to review it — only that person can approve or reject it."}
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

            <div className="mb-4 flex flex-col gap-3.5 sm:flex-row">
              <div className="field mb-0 flex-1">
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
              <div className="field mb-0 sm:w-[150px]">
                <label htmlFor="ecr-priority">Priority</label>
                <SearchableSelect
                  id="ecr-priority"
                  value={priority}
                  onChange={(v) => setPriority(v as ECRPriority)}
                  options={PRIORITY_OPTIONS}
                  searchPlaceholder="Search priorities…"
                />
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3.5 sm:flex-row">
              <div className="field flex-1">
                <label htmlFor="ecr-project">Related project (optional)</label>
                <SearchableSelect
                  id="ecr-project"
                  value={projectId}
                  onChange={setProjectId}
                  options={projectOptions}
                  emptyLabel="None"
                  searchPlaceholder="Search projects…"
                />
              </div>
              <div className="field flex-1">
                <label htmlFor="ecr-approver">Who needs to approve this? (optional)</label>
                <SearchableSelect
                  id="ecr-approver"
                  value={assignedApproverId}
                  onChange={setAssignedApproverId}
                  options={approverOptions}
                  emptyLabel="Nobody yet"
                  searchPlaceholder="Search by name or email…"
                />
                <div className="hint">
                  {assignedApproverId
                    ? "They'll get notified, and only they can approve or reject this."
                    : "Left blank, nobody will be able to approve or reject this until you tag someone."}
                </div>
              </div>
            </div>

            <div className="field">
              <label htmlFor="ecr-component">Related component (optional)</label>
              <SearchableSelect
                id="ecr-component"
                value={componentId}
                onChange={(v) => {
                  setComponentId(v);
                  if (v) setComponentName("");
                }}
                options={componentOptions}
                emptyLabel="None"
                searchPlaceholder="Search components…"
              />
              <div className="mt-2 flex items-center gap-2 text-[11.5px] font-semibold text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <input
                id="ecr-component-name"
                type="text"
                className="mt-2"
                placeholder="Not in Inventory yet? Type a part name/description"
                value={componentName}
                disabled={!!componentId}
                onChange={(e) => setComponentName(e.target.value)}
                maxLength={300}
              />
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
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Submit for review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
