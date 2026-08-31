"use client";

// New Project flow — screens 9, 10, 11. A single client-side step
// machine rather than separate routes, matching the mockups' own
// breadcrumbs ("Projects / Add New Project / Review Extracted Details"
// and ".../ Enter Manually" both nest under one "Add New Project" step)
// and the precedent set by the Bulk Import wizard (one page, local step
// state, no route per step).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import {
  DocumentParseResponse,
  ParsedField,
  ProjectStatus,
  ProjectTextField,
  PROJECT_TEXT_FIELDS,
  createProject,
  linkProjectMedia,
  parseProjectDocument,
} from "@/lib/projects";

type Step = "choice" | "review" | "manual";

const FIELD_LABELS: Record<ProjectTextField, string> = {
  title: "Project Title",
  problem_statement: "Problem Statement",
  abstract: "Abstract",
  specifications: "Specifications",
  requirement: "Requirement",
  next_steps: "Next Steps",
  note: "Note",
};

const EMPTY_FIELD: ParsedField = { value: null, matched: false, heading: null, page: null };

function Breadcrumb({ step }: { step: Step }) {
  const stepLabel = step === "review" ? "Review Extracted Details" : step === "manual" ? "Enter Manually" : null;
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400">
      <Link href="/projects" className="hover:text-slate-600">
        Projects
      </Link>
      <span>/</span>
      {stepLabel ? (
        <>
          <span>Add New Project</span>
          <span>/</span>
          <b className="text-slate-600">{stepLabel}</b>
        </>
      ) : (
        <b className="text-slate-600">Add New Project</b>
      )}
    </div>
  );
}

function ChoiceStep({
  onPickUpload,
  onPickManual,
  parsing,
  parseError,
}: {
  onPickUpload: (file: File) => void;
  onPickManual: () => void;
  parsing: boolean;
  parseError: string | null;
}) {
  const [selected, setSelected] = useState<"upload" | "manual">("upload");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleContinue() {
    if (selected === "manual") {
      onPickManual();
    } else {
      inputRef.current?.click();
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] pt-6 text-center">
      <h1 className="mb-1.5 text-[28px] font-extrabold tracking-tight">New Project</h1>
      <p className="mb-8 text-[14.5px] text-slate-500">Choose how you&apos;d like to add this project</p>

      <div className="mb-6 grid grid-cols-1 gap-5 text-left sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSelected("upload")}
          className={`relative rounded-2xl border-2 p-7 ${
            selected === "upload" ? "border-indigo-600" : "border-slate-200"
          }`}
        >
          {selected === "upload" && (
            <span className="absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6M9.5 14.5L12 12l2.5 2.5" />
            </svg>
          </div>
          <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-indigo-700">
            Recommended · Fastest
          </span>
          <h3 className="mb-1.5 text-[17px] font-extrabold">Upload a Document</h3>
          <p className="mb-4 text-[13px] leading-relaxed text-slate-500">
            Upload a filled-in Proforce Project Write-up (.docx or .pdf) and we&apos;ll auto-fill the fields from it for
            you to review.
          </p>
          <div className="flex gap-2">
            <span className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              .DOCX
            </span>
            <span className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              .PDF
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelected("manual")}
          className={`relative rounded-2xl border-2 p-7 ${
            selected === "manual" ? "border-indigo-600" : "border-slate-200"
          }`}
        >
          {selected === "manual" && (
            <span className="absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
            </svg>
          </div>
          <h3 className="mb-1.5 text-[17px] font-extrabold">Enter Manually</h3>
          <p className="mb-4 text-[13px] leading-relaxed text-slate-500">
            Fill in the project details yourself, field by field.
          </p>
          <ul className="space-y-1.5 text-[12.5px] text-slate-400">
            <li>Project name, lead engineer, timeline</li>
            <li>Scope, objectives &amp; deliverables</li>
            <li>Budget, milestones &amp; status</li>
          </ul>
        </button>
      </div>

      {parseError && (
        <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-left text-[13px] font-medium text-rose-600">
          {parseError}
        </div>
      )}

      <div className="flex flex-col items-start gap-4 text-left sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[520px] text-[12.5px] text-slate-400">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1 inline-block align-[-2px]">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          Extraction is rule-based (heading match against the standard template) — you&apos;ll review every field
          before saving.
        </p>
        <div className="flex shrink-0 gap-2.5">
          <Link href="/projects" className="btn-secondary">
            Cancel
          </Link>
          <button type="button" onClick={handleContinue} disabled={parsing} className="btn-primary disabled:opacity-60">
            {parsing ? "Reading document…" : "Continue"}
            {!parsing && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPickUpload(file);
        }}
      />
    </div>
  );
}

function ReviewStep({
  token,
  file,
  parsed,
  onStartOver,
  onSaved,
}: {
  token: string;
  file: File;
  parsed: DocumentParseResponse;
  onStartOver: () => void;
  onSaved: (projectId: string) => void;
}) {
  const [values, setValues] = useState<Record<ProjectTextField, string>>(() => {
    const initial = {} as Record<ProjectTextField, string>;
    for (const key of PROJECT_TEXT_FIELDS) {
      initial[key] = parsed.fields[key]?.value ?? "";
    }
    return initial;
  });
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const originalDocUrlRef = useRef<string | null>(null);

  // Revoke on unmount so a review session that never clicks "View
  // original document" doesn't leak, and revoke the previous URL before
  // minting a new one so repeated clicks don't accumulate blobs either.
  useEffect(() => {
    return () => {
      if (originalDocUrlRef.current) URL.revokeObjectURL(originalDocUrlRef.current);
    };
  }, []);

  function handleViewOriginal() {
    if (originalDocUrlRef.current) URL.revokeObjectURL(originalDocUrlRef.current);
    const url = URL.createObjectURL(file);
    originalDocUrlRef.current = url;
    window.open(url, "_blank");
  }

  async function handleSave() {
    if (!values.title.trim()) {
      setError("Project title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const project = await createProject(token, {
        title: values.title.trim(),
        problem_statement: values.problem_statement.trim() || null,
        abstract: values.abstract.trim() || null,
        specifications: values.specifications.trim() || null,
        requirement: values.requirement.trim() || null,
        next_steps: values.next_steps.trim() || null,
        note: values.note.trim() || null,
        status,
      });
      // Images the parser already staged in R2 just need linking against
      // the real project id now that one exists — no re-upload.
      for (const media of parsed.media) {
        await linkProjectMedia(token, project.id, {
          media_type: media.media_type,
          file_url: media.file_url,
          filename: media.filename,
        });
      }
      onSaved(project.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-[26px] font-extrabold tracking-tight">Review Extracted Details</h1>
      <p className="mb-5 text-[14px] text-slate-500">
        We matched these fields from your document&apos;s headings — check them over before saving.
      </p>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-[13px] leading-relaxed text-indigo-900">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2" className="mt-0.5 shrink-0">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        <span>
          <b className="font-bold text-indigo-700">Rule-based heading match, not AI.</b> Fields are filled by matching
          your document&apos;s section headings against our standard project template. If a heading was worded
          differently or missing, that field is left blank below for you to fill in — nothing here was inferred or
          generated.
        </span>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
          {error}
        </div>
      )}

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <div className="w-full lg:w-[260px] lg:shrink-0">
          <div className="card p-5 text-center">
            <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-xl bg-slate-50 text-slate-300">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </div>
            <div className="truncate text-[13px] font-bold text-slate-900">{parsed.filename}</div>
            <div className="mt-0.5 text-[11.5px] text-slate-400">
              {parsed.doc_type.toUpperCase()}
              {parsed.page_count != null && ` · ${parsed.page_count} page${parsed.page_count === 1 ? "" : "s"}`}
            </div>

            <div className="mt-4 rounded-[10px] bg-amber-50 p-3 text-left">
              <div className="text-[20px] font-extrabold" style={{ color: "#b45309" }}>
                {parsed.matched_count} / {parsed.total_fields}
              </div>
              <div className="text-[11.5px] font-bold" style={{ color: "#b45309" }}>
                FIELDS MATCHED
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-amber-100">
                <div
                  className="h-1.5 rounded-full bg-emerald-500"
                  style={{ width: `${(parsed.matched_count / Math.max(1, parsed.total_fields)) * 100}%` }}
                />
              </div>
            </div>

            <button type="button" onClick={onStartOver} className="btn-secondary mt-4 w-full justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 105.64 18.36L1 14M23 10l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
              Re-upload a different file
            </button>
            <button type="button" onClick={handleViewOriginal} className="btn-secondary mt-2 w-full justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              View original document
            </button>
          </div>
        </div>

        <div className="min-w-0 w-full flex-1 space-y-5 lg:w-auto">
          <div className="card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-extrabold">Extracted Project Fields</h3>
              <div className="flex flex-wrap items-center gap-3 text-[11.5px] font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Matched from heading
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> No heading matched
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {PROJECT_TEXT_FIELDS.map((key) => {
                const parsedField = parsed.fields[key] ?? EMPTY_FIELD;
                const isTextarea = key !== "title";
                return (
                  <div
                    key={key}
                    className={parsedField.matched ? "" : "-mx-3 rounded-lg border-l-4 border-amber-400 bg-amber-50/60 px-3 py-2"}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-[13px] font-bold text-slate-700">{FIELD_LABELS[key]}</label>
                      {parsedField.matched ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                          ✓ Matched
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold" style={{ color: "#b45309" }}>
                          ⚠ Unmatched
                        </span>
                      )}
                    </div>
                    {isTextarea ? (
                      <textarea
                        value={values[key]}
                        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                        rows={key === "specifications" ? 4 : 2}
                        className="w-full resize-none rounded-[9px] border-[1.5px] border-slate-200 bg-white px-3.5 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
                      />
                    ) : (
                      <input
                        value={values[key]}
                        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                        className="w-full rounded-[9px] border-[1.5px] border-slate-200 bg-white px-3.5 py-2.5 text-[14px] font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
                      />
                    )}
                    {parsedField.matched && parsedField.heading && (
                      <div className="mt-1 text-[11px] text-slate-400">
                        Matched from heading: &quot;{parsedField.heading}&quot;
                        {parsedField.page != null && ` · page ${parsedField.page}`}
                      </div>
                    )}
                    {!parsedField.matched && (
                      <div className="mt-1 text-[11px] font-medium" style={{ color: "#b45309" }}>
                        No heading matched — please fill in.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {parsed.media.length > 0 && (
            <div className="card p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[14px] font-extrabold uppercase tracking-wide text-slate-500">
                  Media &amp; Documentation
                </h3>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  ✓ {parsed.media.length} file{parsed.media.length === 1 ? "" : "s"} found
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {parsed.media.map((m, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={m.file_url}
                    alt={m.filename}
                    className="aspect-square w-full rounded-xl border border-slate-100 object-cover"
                  />
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-slate-400">
                Detected {parsed.media.length} embedded image{parsed.media.length === 1 ? "" : "s"} in the source
                document. CAD and code files aren&apos;t auto-extracted — attach those from the project page after
                saving.
              </p>
            </div>
          )}

          <div className="card p-6">
            <h3 className="mb-3 text-[14px] font-extrabold uppercase tracking-wide text-slate-500">Planning &amp; Status</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-slate-700">Status</label>
                <SearchableSelect
                  value={status}
                  onChange={(v) => setStatus(v as ProjectStatus)}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "done", label: "Done" },
                    { value: "paused", label: "Paused" },
                    { value: "relegated", label: "Relegated" },
                  ]}
                  searchPlaceholder="Search statuses…"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-slate-700">MIL (Minimum Item List)</label>
                <div className="rounded-[9px] border-[1.5px] border-dashed border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-400">
                  MIL items aren&apos;t extracted from documents — add them from Component Inventory on the project
                  page after saving.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] text-slate-400">You can edit any field above, including matched ones, before saving.</p>
        <div className="flex shrink-0 gap-2.5">
          <button type="button" onClick={onStartOver} className="btn-secondary">
            Start Over
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {saving ? "Saving…" : "Looks Good — Save Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewProjectContent() {
  const { token } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("choice");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<DocumentParseResponse | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handlePickUpload(picked: File) {
    if (!token) return;
    setFile(picked);
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseProjectDocument(token, picked);
      setParsed(result);
      setStep("review");
    } catch (err) {
      setParseError(err instanceof ApiError ? err.message : "Couldn't read that document. Please try again.");
    } finally {
      setParsing(false);
    }
  }

  function handleStartOver() {
    setStep("choice");
    setFile(null);
    setParsed(null);
    setParseError(null);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Projects Progress Report" />

      <div className="flex-1 px-4 pb-6 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
        <Breadcrumb step={step} />

        {step === "choice" && (
          <ChoiceStep
            onPickUpload={handlePickUpload}
            onPickManual={() => setStep("manual")}
            parsing={parsing}
            parseError={parseError}
          />
        )}

        {step === "review" && token && file && parsed && (
          <ReviewStep
            token={token}
            file={file}
            parsed={parsed}
            onStartOver={handleStartOver}
            onSaved={(projectId) => router.push(`/projects/${projectId}`)}
          />
        )}

        {step === "manual" && token && (
          <ProjectForm
            token={token}
            mode="create"
            onCancel={() => setStep("choice")}
            onSaved={(project) => router.push(`/projects/${project.id}`)}
          />
        )}
      </div>

      <FootNav current="projects" />
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <ProtectedRoute>
      <NewProjectContent />
    </ProtectedRoute>
  );
}
