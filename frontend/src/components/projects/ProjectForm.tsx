"use client";

// Shared New/Edit Project form — screen 11/17. Per that screen's own
// copy ("this same form is used later to edit the project once created"),
// one component drives both flows via `mode`. Everything (text fields,
// status, MIL items, media) is staged in local state and only hits the
// backend when "Save Project" is pressed — in edit mode that means
// diffing the staged MIL/media lists against what the project already
// had, rather than firing an API call on every individual add/remove,
// so the Cancel button genuinely discards unsaved changes.

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { Component } from "@/lib/inventory";
import {
  MILItemRead,
  ProjectMediaRead,
  ProjectRead,
  ProjectStatus,
  addMilItem,
  createProject,
  deleteMilItem,
  deleteProjectMedia,
  linkProjectMedia,
  updateMilItem,
  updateProject,
  uploadProjectMedia,
} from "@/lib/projects";
import { MilPickerModal } from "./MilPickerModal";
import { MediaAttachments, StagedMedia } from "./MediaAttachments";

interface LocalMilItem {
  localKey: string;
  component: Component;
  quantity_required: number;
  existingId?: string;
}

interface TextFields {
  title: string;
  problem_statement: string;
  abstract: string;
  specifications: string;
  requirement: string;
  next_steps: string;
  note: string;
}

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; activeClasses: string; dot: string }> = [
  { value: "active", label: "Active", activeClasses: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  { value: "done", label: "Done", activeClasses: "border-indigo-200 bg-indigo-50 text-indigo-700", dot: "bg-indigo-600" },
  { value: "paused", label: "Paused", activeClasses: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  { value: "relegated", label: "Relegated", activeClasses: "border-slate-300 bg-slate-100 text-slate-600", dot: "bg-slate-400" },
];

function milItemToLocal(item: MILItemRead): LocalMilItem {
  return {
    localKey: item.id,
    component: item.component,
    quantity_required: item.quantity_required,
    existingId: item.id,
  };
}

function mediaToStaged(item: ProjectMediaRead): StagedMedia {
  return {
    key: item.id,
    media_type: item.media_type,
    file_url: item.file_url,
    filename: item.filename,
    existingId: item.id,
  };
}

interface Props {
  token: string;
  mode: "create" | "edit";
  initial?: ProjectRead;
  onCancel: () => void;
  onSaved: (project: ProjectRead) => void;
}

export function ProjectForm({ token, mode, initial, onCancel, onSaved }: Props) {
  const [fields, setFields] = useState<TextFields>({
    title: initial?.title ?? "",
    problem_statement: initial?.problem_statement ?? "",
    abstract: initial?.abstract ?? "",
    specifications: initial?.specifications ?? "",
    requirement: initial?.requirement ?? "",
    next_steps: initial?.next_steps ?? "",
    note: initial?.note ?? "",
  });
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? "active");
  const [milItems, setMilItems] = useState<LocalMilItem[]>((initial?.mil_items ?? []).map(milItemToLocal));
  const [media, setMedia] = useState<StagedMedia[]>((initial?.media ?? []).map(mediaToStaged));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key: keyof TextFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function handleAddMilItem(component: Component, quantity: number) {
    setMilItems((items) => {
      // Guard against the same component being added twice in one
      // session — the backend 409s on a duplicate (project, component)
      // pair anyway, but catching it here avoids a confusing save-time
      // error and a duplicate React key.
      if (items.some((i) => i.component.id === component.id)) return items;
      return [...items, { localKey: `new-${component.id}`, component, quantity_required: quantity }];
    });
    setPickerOpen(false);
  }

  function handleRemoveMilItem(localKey: string) {
    setMilItems((items) => items.filter((i) => i.localKey !== localKey));
  }

  function handleMilQuantityChange(localKey: string, quantity: number) {
    setMilItems((items) =>
      items.map((i) => (i.localKey === localKey ? { ...i, quantity_required: Math.max(1, quantity) } : i))
    );
  }

  function handleAddMedia(item: StagedMedia) {
    setMedia((m) => [...m, item]);
  }

  function handleRemoveMedia(key: string) {
    setMedia((m) => m.filter((item) => item.key !== key));
  }

  async function syncMilItems(projectId: string) {
    const originalIds = new Set((initial?.mil_items ?? []).map((i) => i.id));
    const currentExistingIds = new Set(milItems.filter((i) => i.existingId).map((i) => i.existingId as string));

    // Removed: existed before, not in the current staged list anymore.
    for (const id of originalIds) {
      if (!currentExistingIds.has(id)) {
        await deleteMilItem(token, projectId, id);
      }
    }
    // New: no existingId yet.
    for (const item of milItems) {
      if (!item.existingId) {
        await addMilItem(token, projectId, {
          component_id: item.component.id,
          quantity_required: item.quantity_required,
        });
      } else {
        // Existing item whose quantity may have changed.
        const original = (initial?.mil_items ?? []).find((i) => i.id === item.existingId);
        if (original && original.quantity_required !== item.quantity_required) {
          await updateMilItem(token, projectId, item.existingId, { quantity_required: item.quantity_required });
        }
      }
    }
  }

  async function syncMedia(projectId: string) {
    const originalIds = new Set((initial?.media ?? []).map((m) => m.id));
    const currentExistingIds = new Set(media.filter((m) => m.existingId).map((m) => m.existingId as string));

    for (const id of originalIds) {
      if (!currentExistingIds.has(id)) {
        await deleteProjectMedia(token, projectId, id);
      }
    }
    for (const item of media) {
      if (item.existingId) continue;
      if (item.file) {
        await uploadProjectMedia(token, projectId, item.file, item.media_type);
      } else if (item.file_url) {
        await linkProjectMedia(token, projectId, {
          media_type: item.media_type,
          file_url: item.file_url,
          filename: item.filename,
        });
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fields.title.trim()) {
      setError("Project title is required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: fields.title.trim(),
        problem_statement: fields.problem_statement.trim() || null,
        abstract: fields.abstract.trim() || null,
        specifications: fields.specifications.trim() || null,
        requirement: fields.requirement.trim() || null,
        next_steps: fields.next_steps.trim() || null,
        note: fields.note.trim() || null,
        status,
      };

      const project =
        mode === "edit" && initial
          ? await updateProject(token, initial.id, payload)
          : await createProject(token, payload);

      await syncMilItems(project.id);
      await syncMedia(project.id);

      onSaved(project);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const excludeComponentIds = milItems.map((i) => i.component.id);

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-[22px] flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">{mode === "edit" ? "Edit Project" : "New Project"}</h1>
          <p className="mt-1 text-[14px] text-slate-500">
            Fill in the fields below — this same form is used later to edit the project once created.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={onCancel} disabled={submitting} className="btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            {submitting ? "Saving…" : "Save Project"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
          {error}
        </div>
      )}

      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1 space-y-5">
          <div className="card p-6">
            <label htmlFor="proj-title" className="mb-1.5 block text-[13.5px] font-bold text-slate-700">
              Project Title <span className="text-rose-500">*</span>
            </label>
            <input
              id="proj-title"
              value={fields.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. VTOL Hybrid Surveillance UAV"
              required
              maxLength={300}
              className="w-full rounded-[9px] border-[1.5px] border-slate-200 px-3.5 py-2.5 text-[15px] font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
            <div className="mt-1 text-[11.5px] text-slate-400">
              Keep it short and specific — this is how the project is listed on the Progress Report board.
            </div>
          </div>

          <FieldCard label="Problem Statement" hint="Why this project exists">
            <textarea
              value={fields.problem_statement}
              onChange={(e) => setField("problem_statement", e.target.value)}
              placeholder="Describe the operational gap or problem this project addresses..."
              rows={3}
              className="w-full resize-none rounded-[9px] border-[1.5px] border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
          </FieldCard>

          <FieldCard label="Abstract" hint="High-level summary">
            <textarea
              value={fields.abstract}
              onChange={(e) => setField("abstract", e.target.value)}
              placeholder="One-paragraph overview of the proposed solution and approach..."
              rows={3}
              className="w-full resize-none rounded-[9px] border-[1.5px] border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
          </FieldCard>

          <FieldCard label="Specifications" hint="Technical parameters">
            <textarea
              value={fields.specifications}
              onChange={(e) => setField("specifications", e.target.value)}
              placeholder="List key technical specs: dimensions, weight, power, materials, tolerances..."
              rows={4}
              className="w-full resize-none rounded-[9px] border-[1.5px] border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
          </FieldCard>

          <FieldCard label="Requirement" hint="Acceptance criteria">
            <textarea
              value={fields.requirement}
              onChange={(e) => setField("requirement", e.target.value)}
              placeholder="What must be true for this project to be considered complete..."
              rows={3}
              className="w-full resize-none rounded-[9px] border-[1.5px] border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
          </FieldCard>

          <FieldCard label="Media Attachments" hint="Images · Video · 3D · CAD · Code">
            <MediaAttachments items={media} onAdd={handleAddMedia} onRemove={handleRemoveMedia} />
          </FieldCard>

          <FieldCard label="Next Steps" hint="Immediate action items">
            <textarea
              value={fields.next_steps}
              onChange={(e) => setField("next_steps", e.target.value)}
              placeholder="What's the immediate next action on this project..."
              rows={3}
              className="w-full resize-none rounded-[9px] border-[1.5px] border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
          </FieldCard>

          <FieldCard label="Note" hint="Optional — internal remarks">
            <textarea
              value={fields.note}
              onChange={(e) => setField("note", e.target.value)}
              placeholder="Any additional internal notes..."
              rows={2}
              className="w-full resize-none rounded-[9px] border-[1.5px] border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            />
          </FieldCard>
        </div>

        <div className="w-[320px] shrink-0 space-y-5">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-extrabold">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Status
            </h3>
            <div className="flex flex-col gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const selected = status === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setStatus(opt.value)}
                    className={`flex items-center justify-between rounded-[10px] border-[1.5px] px-3.5 py-2.5 text-left text-[13.5px] font-bold ${
                      selected ? opt.activeClasses : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                      {opt.label}
                    </span>
                    {selected && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[14px] font-extrabold">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 7h-9M14 17H5M17 3l4 4-4 4M7 21l-4-4 4-4" />
                </svg>
                MIL
              </h3>
              <span className="text-[11.5px] font-semibold text-slate-400">Minimum Item List</span>
            </div>

            {milItems.length > 0 && (
              <div className="mb-3 flex flex-col gap-2">
                {milItems.map((item) => (
                  <div key={item.localKey} className="flex items-center gap-2.5 rounded-[10px] border border-slate-100 p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-bold text-slate-900">{item.component.name}</div>
                      <div className="truncate text-[11px] text-slate-400">{item.component.sku ?? "No SKU"}</div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity_required}
                      onChange={(e) => handleMilQuantityChange(item.localKey, Number(e.target.value))}
                      className="w-12 shrink-0 rounded-lg border-[1.5px] border-slate-200 px-1.5 py-1 text-center text-[12.5px] font-bold outline-none focus:border-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMilItem(item.localKey)}
                      className="shrink-0 text-slate-300 hover:text-rose-600"
                      aria-label={`Remove ${item.component.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setPickerOpen(true)} className="btn-secondary w-full justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add item from Inventory
            </button>
            <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
              Items link directly to Component Inventory records — quantities are checked against stock automatically.
            </p>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <MilPickerModal
          token={token}
          excludeComponentIds={excludeComponentIds}
          onClose={() => setPickerOpen(false)}
          onAdd={handleAddMilItem}
        />
      )}
    </form>
  );
}

function FieldCard({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[14px] font-extrabold text-slate-900">{label}</h3>
        <span className="text-[11.5px] font-semibold text-slate-400">{hint}</span>
      </div>
      {children}
    </div>
  );
}
