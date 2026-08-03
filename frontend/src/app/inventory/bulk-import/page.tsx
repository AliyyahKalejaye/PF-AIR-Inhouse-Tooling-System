"use client";

// Bulk Inventory Import wizard (screen 07/18) — 3 steps: upload a
// spreadsheet, map its columns to inventory fields, then review and
// commit. Steps 1 and 3 weren't in the approved mockup set (only step 2,
// "Map Columns", was designed in detail) — the caption on that mockup
// explicitly calls out that Steps 1 and 3 are "simpler single-purpose
// screens," so their layout here follows the same design system (card,
// stepper, btn-*) without a pixel-exact reference.

import { useRef, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import {
  BULK_IMPORT_FIELD_LABELS,
  BULK_IMPORT_TARGET_FIELDS,
  BulkImportCommitResponse,
  BulkImportPreviewResponse,
  BulkImportTargetField,
  commitBulkImport,
  previewBulkImport,
} from "@/lib/inventory";

type WizardStep = 1 | 2 | 3;

// mapping values are either a BulkImportTargetField or the literal "skip" —
// this narrows safely instead of casting, since the mapping record is
// keyed by arbitrary spreadsheet column names (Record<string, string>) and
// noUncheckedIndexedAccess means a lookup is never guaranteed to hit.
function fieldLabel(mappedValue: string | undefined): string | null {
  if (!mappedValue || mappedValue === "skip") return null;
  if ((BULK_IMPORT_TARGET_FIELDS as readonly string[]).includes(mappedValue)) {
    return BULK_IMPORT_FIELD_LABELS[mappedValue as BulkImportTargetField];
  }
  return null;
}

function Stepper({ step }: { step: WizardStep }) {
  const steps: Array<{ n: WizardStep; label: string }> = [
    { n: 1, label: "Upload File" },
    { n: 2, label: "Map Columns" },
    { n: 3, label: "Review & Confirm" },
  ];

  return (
    <div className="card mb-[22px] flex items-center px-3 py-4 sm:px-8 sm:py-[22px]">
      {steps.map((s, i) => {
        const status = s.n < step ? "done" : s.n === step ? "active" : "upcoming";
        return (
          <div key={s.n} className="flex flex-1 items-center">
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold sm:h-[34px] sm:w-[34px] sm:text-[14px] ${
                  status === "done"
                    ? "bg-emerald-500 text-white"
                    : status === "active"
                      ? "bg-indigo-600 text-white ring-[5px] ring-indigo-100"
                      : "border-[1.5px] border-slate-200 bg-slate-100 text-slate-400"
                }`}
              >
                {status === "done" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.n
                )}
              </div>
              {/* Below `sm` there isn't room for every step's two-line
                  label without wrapping into the connecting lines — only
                  the active step's label shows there; the circles/line
                  colors still carry the done/active/upcoming state. */}
              <div className={status === "active" ? "" : "hidden sm:block"}>
                <div
                  className={`text-[10.5px] font-bold uppercase tracking-wide ${
                    status === "done" ? "text-emerald-700" : status === "active" ? "text-indigo-600" : "text-slate-400"
                  }`}
                >
                  Step {s.n}
                </div>
                <div className={`mt-0.5 text-[13px] font-bold sm:text-[14.5px] ${status === "upcoming" ? "text-slate-400" : "text-slate-900"}`}>
                  {s.label}
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-2.5 mt-[-9px] h-0.5 flex-1 sm:mx-[22px] ${s.n < step ? "bg-emerald-500" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({ onParsed }: { onParsed: (r: BulkImportPreviewResponse) => void }) {
  const { token } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await previewBulkImport(token, file);
      onParsed(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read that file. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-10">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed py-16 text-center ${
          dragOver ? "border-indigo-600 bg-indigo-50" : "border-indigo-100 bg-indigo-50"
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-indigo-600 shadow-sm">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <path d="M17 8l-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
        </div>
        <div className="text-[15px] font-bold text-slate-900">
          {loading ? "Reading file…" : "Drag & drop your spreadsheet here"}
        </div>
        <div className="text-[13px] text-slate-500">
          or <span className="font-bold text-indigo-700">click to browse</span> — Excel (.xlsx) or CSV, up to 15MB
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>
      {error && (
        <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
          {error}
        </div>
      )}
    </div>
  );
}

function MapStep({
  preview,
  mapping,
  setMapping,
  onBack,
  onContinue,
}: {
  preview: BulkImportPreviewResponse;
  mapping: Record<string, string>;
  setMapping: (m: Record<string, string>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const mappedCount = Object.values(mapping).filter((v) => v !== "skip").length;
  const hasName = Object.values(mapping).includes("name");

  return (
    <div className="flex flex-col items-start gap-5 lg:flex-row">
      <div className="card w-full p-5 lg:w-[300px] lg:shrink-0">
        <h3 className="mb-3.5 text-[13px] font-extrabold uppercase tracking-wide text-slate-500">Uploaded File</h3>
        <div className="mb-4 flex items-start gap-3 rounded-[10px] border border-dashed border-indigo-100 bg-indigo-50 p-3.5">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border border-indigo-100 bg-white">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 13h6M9 17h4" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="break-words font-mono text-[12px] font-bold text-indigo-700">{preview.filename}</div>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-slate-100 py-2.5 text-[13px]">
          <span className="font-semibold text-slate-500">Rows detected</span>
          <span className="font-bold text-slate-900">{preview.rows_detected}</span>
        </div>
        <div className="flex items-center justify-between border-b border-slate-100 py-2.5 text-[13px]">
          <span className="font-semibold text-slate-500">Columns detected</span>
          <span className="font-bold text-slate-900">{preview.columns_detected}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 text-[13px]">
          <span className="font-semibold text-slate-500">Sheet</span>
          <span className="font-bold text-slate-900">{preview.sheet ?? "—"}</span>
        </div>
        <div className="mt-3.5 flex items-center gap-2 rounded-[9px] bg-emerald-50 px-3 py-2.5 text-[12.5px] font-bold text-emerald-700">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          File parsed successfully
        </div>
      </div>

      <div className="card w-full flex-1 overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-[18px] sm:flex-row sm:items-center sm:justify-between sm:px-[22px]">
          <div>
            <h3 className="text-[15.5px] font-extrabold">Map Spreadsheet Columns to Inventory Fields</h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              We auto-matched columns where possible — review and adjust the mapping below before continuing.
            </p>
          </div>
          <div className="shrink-0 self-start rounded-full bg-slate-100 px-[11px] py-1.5 text-[12px] font-bold text-slate-500">
            {mappedCount} of {preview.columns.length} columns mapped
          </div>
        </div>

        {/* This table has five fixed-width columns designed for a desktop
            layout (Column · Sample · arrow · Maps To · Status) — rather
            than squeeze that onto a phone, it scrolls horizontally within
            its own card instead of breaking the page layout. */}
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="w-[260px] border-b border-slate-200 bg-slate-50 px-[22px] py-[11px] text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Spreadsheet Column
              </th>
              <th className="w-[210px] border-b border-slate-200 bg-slate-50 px-[22px] py-[11px] text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Sample Data
              </th>
              <th className="w-[34px] border-b border-slate-200 bg-slate-50" />
              <th className="w-[240px] border-b border-slate-200 bg-slate-50 px-[22px] py-[11px] text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Maps To Inventory Field
              </th>
              <th className="border-b border-slate-200 bg-slate-50 px-[22px] py-[11px] text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Match Status
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.columns.map((col, i) => {
              const value = mapping[col.source_column] ?? "skip";
              const isAuto = col.status === "auto";
              return (
                <tr key={col.source_column} className={`border-b border-slate-100 last:border-none ${isAuto ? "" : "bg-amber-50"}`}>
                  <td className="px-[22px] py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10.5px] font-extrabold text-slate-500">
                        {String.fromCharCode(65 + (i % 26))}
                      </div>
                      <span className="text-[13.5px] font-bold text-slate-900">{col.source_column}</span>
                    </div>
                  </td>
                  <td className="px-[22px] py-3 font-mono text-[12.5px] text-slate-400">{col.sample ?? "—"}</td>
                  <td className="px-[22px] py-3 text-center text-slate-300">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={isAuto ? "currentColor" : "#f59e0b"} strokeWidth="2">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </td>
                  <td className="px-[22px] py-3">
                    <select
                      value={value}
                      onChange={(e) => setMapping({ ...mapping, [col.source_column]: e.target.value })}
                      className={`w-full max-w-[230px] rounded-[9px] border-[1.5px] px-3 py-2 text-[13.5px] font-semibold outline-none ${
                        value === "skip"
                          ? "border-slate-200 bg-white text-slate-700"
                          : "border-indigo-100 bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      <option value="skip">— Select a field —</option>
                      {BULK_IMPORT_TARGET_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {BULK_IMPORT_FIELD_LABELS[f]}
                        </option>
                      ))}
                      <option value="skip">Skip this column</option>
                    </select>
                  </td>
                  <td className="px-[22px] py-3">
                    {value !== "skip" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">
                        {isAuto ? "Auto-matched" : "Mapped"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "#b45309" }}>
                        Skipped
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {!hasName && (
          <div className="flex items-center gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3.5 text-[13px] font-semibold sm:px-[22px]" style={{ color: "#b45309" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" className="shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            At least one column must be mapped to Name before continuing.
          </div>
        )}

        <div className="flex flex-col gap-3 px-4 pb-5 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-[22px]">
          <span className="text-[12px] text-slate-400">
            {preview.rows_detected} rows will be imported once mapping is confirmed.
          </span>
          <div className="flex gap-2.5">
            <button type="button" onClick={onBack} className="btn-secondary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <button type="button" onClick={onContinue} disabled={!hasName} className="btn-primary disabled:opacity-50">
              Continue to Review
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  preview,
  mapping,
  onBack,
  onDone,
}: {
  preview: BulkImportPreviewResponse;
  mapping: Record<string, string>;
  onBack: () => void;
  onDone: (result: BulkImportCommitResponse) => void;
}) {
  const { token } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mappedColumns = preview.columns.filter((c) => (mapping[c.source_column] ?? "skip") !== "skip");

  async function handleConfirm() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await commitBulkImport(token, {
        filename: preview.filename,
        mapping,
        rows: preview.rows,
      });
      onDone(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't import that file. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-6">
      <h3 className="mb-1 text-[16px] font-extrabold">Review &amp; Confirm</h3>
      <p className="mb-5 text-[13px] text-slate-500">
        {preview.rows_detected} row{preview.rows_detected === 1 ? "" : "s"} from{" "}
        <span className="font-mono font-semibold text-slate-700">{preview.filename}</span> will be imported as new
        components using the mapping below.
      </p>

      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            <th className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Spreadsheet Column
            </th>
            <th className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Inventory Field
            </th>
          </tr>
        </thead>
        <tbody>
          {mappedColumns.map((c) => (
            <tr key={c.source_column} className="border-b border-slate-100 last:border-none">
              <td className="px-4 py-2.5 font-semibold text-slate-700">{c.source_column}</td>
              <td className="px-4 py-2.5 font-bold text-indigo-700">{fieldLabel(mapping[c.source_column])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {preview.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {preview.warnings.map((w, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium" style={{ color: "#b45309" }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-600">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 sm:justify-between">
        <button type="button" onClick={onBack} className="btn-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button type="button" onClick={handleConfirm} disabled={submitting} className="btn-primary disabled:opacity-60">
          {submitting ? "Importing…" : `Import ${preview.rows_detected} Component${preview.rows_detected === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function DoneStep({ result, onReset }: { result: BulkImportCommitResponse; onReset: () => void }) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h3 className="mb-1.5 text-[18px] font-extrabold">Import complete</h3>
      <p className="mb-5 text-[13.5px] text-slate-500">
        {result.created} component{result.created === 1 ? "" : "s"} created.
        {result.skipped_rows.length > 0 && ` ${result.skipped_rows.length} row(s) skipped.`}
      </p>

      {result.skipped_rows.length > 0 && (
        <div className="mx-auto mb-5 max-w-[420px] space-y-1.5 text-left">
          {result.skipped_rows.map((s) => (
            <div key={s.row_index} className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12.5px] font-medium" style={{ color: "#b45309" }}>
              Row {s.row_index + 1}: {s.reason}
            </div>
          ))}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="mx-auto mb-5 max-w-[420px] space-y-1.5 text-left">
          {result.warnings.map((w, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12.5px] font-medium text-slate-600">
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center gap-2.5">
        <button type="button" onClick={onReset} className="btn-secondary">
          Import Another File
        </button>
        <Link href="/inventory" className="btn-primary">
          Back to Inventory
        </Link>
      </div>
    </div>
  );
}

function BulkImportContent() {
  const [step, setStep] = useState<WizardStep>(1);
  const [preview, setPreview] = useState<BulkImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [commitResult, setCommitResult] = useState<BulkImportCommitResponse | null>(null);

  function handleParsed(result: BulkImportPreviewResponse) {
    setPreview(result);
    setMapping(
      Object.fromEntries(result.columns.map((c): [string, string] => [c.source_column, c.mapped_field ?? "skip"]))
    );
    setStep(2);
  }

  function handleReset() {
    setStep(1);
    setPreview(null);
    setMapping({});
    setCommitResult(null);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Inventory Management" />

      <div className="flex-1 px-4 pb-6 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400">
          <Link href="/inventory" className="hover:text-slate-600">
            Component Inventory
          </Link>
          <span>/</span>
          <b className="text-slate-600">Bulk Import</b>
        </div>

        <div className="mb-[22px]">
          <h1 className="text-[26px] font-extrabold tracking-tight">Bulk Inventory Import</h1>
          <p className="mt-1 text-[14px] text-slate-500">
            Import components in bulk from an Excel or CSV export — map your spreadsheet columns to inventory fields
            before committing.
          </p>
        </div>

        <Stepper step={commitResult ? 3 : step} />

        {step === 1 && <UploadStep onParsed={handleParsed} />}
        {step === 2 && preview && (
          <MapStep preview={preview} mapping={mapping} setMapping={setMapping} onBack={handleReset} onContinue={() => setStep(3)} />
        )}
        {step === 3 && preview && !commitResult && (
          <ReviewStep preview={preview} mapping={mapping} onBack={() => setStep(2)} onDone={setCommitResult} />
        )}
        {commitResult && <DoneStep result={commitResult} onReset={handleReset} />}
      </div>

      <FootNav current="inventory" />
    </div>
  );
}

export default function BulkImportPage() {
  return (
    <ProtectedRoute>
      <BulkImportContent />
    </ProtectedRoute>
  );
}
