"use client";

// BOM Check drawer — right-hand panel on the Inventory dashboard (screen
// 18/18 redesign). Purely presentational: the "Upload BOM" button lives in
// the page header (per the mockup) and the page owns the checkBom/
// reserveBom calls, passing the result down here so there's a single
// source of truth for "is a BOM currently loaded."

import { BOMCheckResponse, BOMReserveResponse } from "@/lib/inventory";

interface Props {
  result: BOMCheckResponse | null;
  loading: boolean;
  error: string | null;
  onUploadClick: () => void;
  onReserve: () => void;
  reserving: boolean;
  reserveResult: BOMReserveResponse | null;
}

export function BomDrawer({ result, loading, error, onUploadClick, onReserve, reserving, reserveResult }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_40px_-12px_rgba(15,23,42,.18)] lg:w-[360px] lg:shrink-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-[18px] py-4">
        <h3 className="text-[15px] font-extrabold">BOM Check</h3>
        {result && <span className="text-[12px] font-semibold text-slate-400">{result.filename}</span>}
      </div>

      <div className="px-[18px] pb-[18px] pt-3.5">
        {loading && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-[13px] font-medium text-slate-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
            Checking against inventory…
          </div>
        )}

        {!loading && error && (
          <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-600">
            {error}
          </div>
        )}

        {!loading && !result && !error && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <path d="M17 8l-5-5-5 5" />
                <path d="M12 3v12" />
              </svg>
            </div>
            <p className="text-[13px] font-medium leading-relaxed text-slate-500">
              Upload a BOM (Excel or CSV) to check part availability against current stock.
            </p>
            <button type="button" onClick={onUploadClick} className="btn-primary">
              Upload BOM
            </button>
          </div>
        )}

        {!loading && result && (
          <>
            <div className="mb-3.5 flex items-center gap-2.5 rounded-[10px] border border-dashed border-indigo-100 bg-indigo-50 p-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <div>
                <div className="font-mono text-[12px] font-bold text-indigo-700">{result.filename}</div>
                <div className="text-[11px] text-slate-500">{result.items.length} items checked</div>
              </div>
            </div>

            <div className="mb-3.5 flex gap-2">
              <div className="flex-1 rounded-[10px] bg-emerald-50 p-2.5 text-center text-emerald-700">
                <div className="text-[18px] font-extrabold">{result.summary.available}</div>
                <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide">Available</div>
              </div>
              <div className="flex-1 rounded-[10px] bg-amber-50 p-2.5 text-center" style={{ color: "#b45309" }}>
                <div className="text-[18px] font-extrabold">{result.summary.low_stock}</div>
                <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide">Low stock</div>
              </div>
              <div className="flex-1 rounded-[10px] bg-rose-50 p-2.5 text-center" style={{ color: "#b91c1c" }}>
                <div className="text-[18px] font-extrabold">{result.summary.missing}</div>
                <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide">Missing</div>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {result.items.map((item) => (
                <div key={item.id} className="mb-2.5 rounded-[10px] border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-bold text-slate-800">{item.raw_name}</span>
                    {item.status === "missing" ? (
                      <span className="whitespace-nowrap rounded-[5px] bg-rose-50 px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-rose-700">
                        Missing
                      </span>
                    ) : item.status === "low_stock" ? (
                      <span
                        className="whitespace-nowrap rounded-[5px] bg-amber-50 px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-wide"
                        style={{ color: "#b45309" }}
                      >
                        Low stock · {item.matched_component?.quantity ?? 0}
                      </span>
                    ) : (
                      <span className="whitespace-nowrap rounded-[5px] bg-emerald-50 px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-emerald-700">
                        In stock · {item.matched_component?.quantity ?? 0}
                      </span>
                    )}
                  </div>
                  {item.status === "missing" && item.suggested_component && (
                    <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-slate-200 pt-2 text-[11.5px] text-slate-500">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2.2">
                        <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
                      </svg>
                      Suggested: <b className="font-bold text-indigo-700">{item.suggested_component.name}</b>
                      {item.suggested_match_score != null && ` (${Math.round(item.suggested_match_score)}% match)`}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {reserveResult ? (
              <div className="mt-1 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-700">
                Reserved {reserveResult.reserved.length} item(s)
                {reserveResult.skipped.length > 0 && ` — ${reserveResult.skipped.length} skipped`}.
              </div>
            ) : (
              <button
                type="button"
                onClick={onReserve}
                disabled={reserving || result.summary.available === 0}
                className="btn-primary mt-1 w-full justify-center disabled:opacity-60"
              >
                {reserving ? "Reserving…" : "Reserve available items"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
