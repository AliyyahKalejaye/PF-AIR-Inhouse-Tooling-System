"use client";

// A single-select dropdown with type-to-filter search, for pickers whose
// option list can realistically outgrow "scroll through a plain <select>"
// — e.g. every user in the app, or every component in Inventory. Typing
// the first letter (or any substring of the label/sublabel) narrows the
// list instead of forcing a long scroll. Deliberately not a native
// <select> under the hood (no type-ahead search support there), but
// styled to sit inside the same `.field` wrapper as one.

import { useEffect, useRef, useState } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  // Optional second line — shown under the label and included in the
  // search match (e.g. an email under a name, a SKU under a component
  // name).
  sublabel?: string;
}

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  // Text shown when nothing is selected AND rendered as the first,
  // clearable row in the list (e.g. "None", "Any user"). Omit for a
  // required picker with no "clear" option.
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  searchPlaceholder = "Type to search…",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
      )
    : options;

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-[13.5px] text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>
          {selected ? selected.label : (emptyLabel ?? "Select…")}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-slate-400"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700 outline-none focus:border-indigo-300"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {emptyLabel && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                // Highlighted whenever the current value doesn't match any
                // real option — not just `value === ""` — so a caller
                // that uses a different sentinel for "cleared" (e.g.
                // bulk-import's "skip") still shows this row as selected
                // instead of neither row lighting up.
                className={`flex w-full items-center px-3 py-2 text-left text-[13px] hover:bg-slate-50 ${
                  !selected ? "font-bold text-indigo-600" : "text-slate-600"
                }`}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-2.5 text-[13px] text-slate-400">No matches.</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50 ${
                  o.value === value ? "bg-indigo-50" : ""
                }`}
              >
                <span className="text-[13px] font-semibold text-slate-800">{o.label}</span>
                {o.sublabel && <span className="text-[11.5px] text-slate-400">{o.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
