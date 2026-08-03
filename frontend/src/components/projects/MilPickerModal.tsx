"use client";

// "Add item from Inventory" picker — screen 11's MIL panel. Search-only
// (no create-new-component here; MIL items always link to a real
// Component Inventory row, same rule the backend enforces with a 404 on
// an unknown component_id). Reused by both ProjectForm (stages the pick
// locally until the project is saved) and the project detail page (calls
// addMilItem immediately, since a project id already exists there).

import { useEffect, useState } from "react";
import { categoryStyle } from "@/lib/category-colors";
import { Component, listComponents } from "@/lib/inventory";

interface Props {
  token: string;
  excludeComponentIds: string[];
  onClose: () => void;
  onAdd: (component: Component, quantity: number) => void;
}

export function MilPickerModal({ token, excludeComponentIds, onClose, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      listComponents(token, { q: query || undefined, limit: 25 })
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [token, query]);

  const excluded = new Set(excludeComponentIds);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/55 px-4 py-6 sm:py-14">
      <div className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-12px_rgba(15,23,42,.35)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-[16.5px] font-extrabold tracking-tight">Add item from Inventory</h2>
            <p className="mt-0.5 text-[12.5px] font-medium text-slate-500">
              Search Component Inventory to add to this project&apos;s MIL.
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

        <div className="border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-indigo-100 bg-slate-50 px-3.5 py-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, SKU, or brand…"
              className="w-full border-none bg-transparent text-[14px] text-slate-700 outline-none"
            />
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto px-3 py-2">
          {loading && <div className="py-10 text-center text-[13px] font-medium text-slate-400">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="py-10 text-center text-[13px] font-medium text-slate-400">
              No components match &quot;{query}&quot;.
            </div>
          )}
          {!loading &&
            results.map((component) => {
              const style = categoryStyle(component.category?.slug);
              const alreadyAdded = excluded.has(component.id);
              const quantity = quantities[component.id] ?? 1;
              return (
                <div
                  key={component.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.thumbBg} ${style.thumbText}`}>
                    {component.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={component.image_url} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                      <span className="text-[11px] font-extrabold">{component.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-slate-900">{component.name}</div>
                    <div className="truncate text-[12px] text-slate-400">
                      {component.sku ?? "No SKU"}
                      {component.category && ` · ${component.category.name}`}
                    </div>
                  </div>
                  {alreadyAdded ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      Added
                    </span>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) =>
                          setQuantities({ ...quantities, [component.id]: Math.max(1, Number(e.target.value)) })
                        }
                        className="w-14 shrink-0 rounded-lg border-[1.5px] border-slate-200 px-2 py-1.5 text-center text-[13px] font-semibold outline-none focus:border-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => onAdd(component, quantity)}
                        className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]"
                      >
                        Add
                      </button>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
