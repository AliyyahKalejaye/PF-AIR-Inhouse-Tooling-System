"use client";

// Add/Edit Component modal — screen 06 (Add New Component) from the
// approved mockups. Doubles as the edit form: pass `editing` with an
// existing Component and the footer/heading swap to "Save Changes", PATCH
// is used instead of POST, and every field is pre-filled.
//
// Image upload is a separate backend call (POST /components/{id}/image)
// from component create/update, so on save this: (1) creates or updates
// the component record, (2) if the user picked a new image file, uploads
// it against the resulting component id, then (3) hands the final
// (possibly image-updated) component back to the caller.

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  Category,
  Component,
  createComponent,
  updateComponent,
  uploadComponentImage,
} from "@/lib/inventory";
import { categoryStyle } from "@/lib/category-colors";

interface Props {
  token: string;
  categories: Category[];
  editing: Component | null;
  onClose: () => void;
  onSaved: (component: Component) => void;
}

export function ComponentModal({ token, categories, editing, onClose, onSaved }: Props) {
  const isEdit = editing != null;

  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState(editing?.type ?? "");
  const [brand, setBrand] = useState(editing?.brand ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category?.id ?? null);
  const [quantity, setQuantity] = useState(editing?.quantity ?? 0);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(editing?.image_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setImageFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Component name is required.");
      return;
    }
    if (!type.trim()) {
      setError("Type of component is required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        type: type.trim(),
        brand: brand.trim() || null,
        description: description.trim() || null,
        quantity,
        category_id: categoryId,
      };

      let saved = isEdit
        ? await updateComponent(token, editing!.id, payload)
        : await createComponent(token, payload);

      if (imageFile) {
        saved = await uploadComponentImage(token, saved.id, imageFile);
      }

      onSaved(saved);
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
            <h2 className="text-[18px] font-extrabold tracking-tight">
              {isEdit ? "Edit Component" : "Add New Component"}
            </h2>
            <p className="mt-0.5 text-[12.5px] font-medium text-slate-500">
              {isEdit ? `Editing ${editing!.sku ?? editing!.name}` : "Create a new inventory record — S/N is auto-assigned on save"}
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

            <div className="mb-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-[120px] w-[120px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-indigo-100 bg-indigo-50 text-center text-indigo-700"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <div className="px-2 text-[10.5px] font-bold leading-tight">Drag &amp; drop or click to upload</div>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFilePick}
                className="hidden"
              />
              <div className="flex flex-1 flex-col justify-center">
                <div className="mb-1 text-[13.5px] font-bold text-slate-900">Component image</div>
                <div className="text-[12.5px] leading-relaxed text-slate-500">
                  Used as the thumbnail in the inventory table.{" "}
                  <b className="font-bold text-indigo-700">JPG, PNG, or WEBP</b>, up to 8MB, square crop recommended.
                </div>
              </div>
            </div>

            <div className="field">
              <label htmlFor="comp-name">Component Name</label>
              <input
                id="comp-name"
                type="text"
                placeholder="e.g. Brushless Motor 2212 / 920KV"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={300}
              />
            </div>

            <div className="mb-4 flex flex-col gap-3.5 sm:flex-row">
              <div className="field flex-1">
                <label htmlFor="comp-type">Type of Component</label>
                <input
                  id="comp-type"
                  type="text"
                  placeholder="e.g. Motor, Fastener, Sensor"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  required
                  maxLength={150}
                />
              </div>
              <div className="field flex-1">
                <label htmlFor="comp-brand">Brand</label>
                <input
                  id="comp-brand"
                  type="text"
                  placeholder="e.g. T-Motor, Holybro, Generic"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  maxLength={150}
                />
              </div>
            </div>

            <div className="field">
              <label>Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const selected = categoryId === cat.id;
                  const style = categoryStyle(cat.slug);
                  return (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => setCategoryId(selected ? null : cat.id)}
                      className={`rounded-full border-[1.5px] px-3.5 py-2 text-[12.5px] font-bold ${
                        selected ? `border-transparent ${style.badge}` : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4 flex gap-3.5">
              <div className="field" style={{ maxWidth: 160 }}>
                <label htmlFor="comp-qty">Quantity</label>
                <input
                  id="comp-qty"
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                />
                <div className="hint">Current stock on hand</div>
              </div>
            </div>

            <div className="field mb-0">
              <label htmlFor="comp-desc">Description</label>
              <textarea
                id="comp-desc"
                placeholder="Short technical description, materials, compatible systems…"
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Component"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
