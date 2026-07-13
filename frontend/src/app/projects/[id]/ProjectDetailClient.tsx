"use client";

// Project detail (screen 12/17) — read-only report view. MIL and Media &
// Files are display-only here, same as the approved mockup (no
// add/remove affordances on this screen); all editing — including MIL
// items and media — happens through "Edit Project", which reuses
// ProjectForm. The mockup's "Owner: Elena Ortiz" line is omitted: the
// backend's ProjectRead schema never exposes created_by/owner, so
// showing a name here would mean fabricating data the API doesn't
// return.
//
// This is a plain component, not the route's page.tsx — see page.tsx in
// this directory for why: `output: "export"` (static export, deployed to
// Cloudflare Pages with no Node server) requires generateStaticParams()
// on this dynamic [id] segment, and Next.js only honors that export from
// a Server Component file, not one marked "use client". The real
// per-project id is read client-side via useParams() below, independent
// of whatever placeholder param the static build used.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { DeleteProjectModal } from "@/components/projects/DeleteProjectModal";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { categoryStyle } from "@/lib/category-colors";
import { MediaType, ProjectRead, getProject } from "@/lib/projects";
import { PAUSED_TEXT_COLOR, projectStatusStyle } from "@/lib/project-status";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const MEDIA_TILE: Record<MediaType, { gradient: string; icon: React.ReactNode; label: string }> = {
  image: {
    gradient: "linear-gradient(135deg,#818cf8,#6366f1)",
    label: "Image",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  video: {
    gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)",
    label: "Video",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  "3d_render": {
    gradient: "linear-gradient(135deg,#67e8f9,#0891b2)",
    label: "3D Render",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2l9 5v10l-9 5-9-5V7z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
    ),
  },
  cad: {
    gradient: "#ffffff",
    label: "CAD File",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7l8-4 8 4M4 7v10l8 4M4 7l8 4M20 7v10l-8 4M20 7l-8 4m0 0v10" />
      </svg>
    ),
  },
  code: {
    gradient: "linear-gradient(135deg,#1e293b,#0f172a)",
    label: "Code Repo",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
      </svg>
    ),
  },
};

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-indigo-700">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function ProjectDetailContent() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchProject = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    getProject(token, projectId)
      .then(setProject)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load this project. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [token, projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Topbar toolName="Projects Progress Report" />
        <div className="flex-1 py-20 text-center text-[13.5px] font-medium text-slate-400">Loading…</div>
        <FootNav current="projects" />
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Topbar toolName="Projects Progress Report" />
        <div className="flex-1 px-8 py-16 text-center">
          <p className="mb-4 text-[13.5px] font-medium text-rose-600">{loadError ?? "Project not found."}</p>
          <Link href="/projects" className="btn-secondary">
            Back to Projects
          </Link>
        </div>
        <FootNav current="projects" />
      </div>
    );
  }

  const style = projectStatusStyle(project.status);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Projects Progress Report" />

      <div className="flex-1 px-8 pb-10 pt-7">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400">
          <Link href="/projects" className="hover:text-slate-600">
            Projects
          </Link>
          <span>/</span>
          <b className="max-w-[400px] truncate text-slate-600">{project.title}</b>
        </div>

        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <div>
              <h1 className="text-[24px] font-extrabold tracking-tight">{project.title}</h1>
              <div className="mt-1.5 flex items-center gap-2.5 text-[12.5px] text-slate-500">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${style.pill}`}
                  style={project.status === "paused" ? { color: PAUSED_TEXT_COLOR } : undefined}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {style.label}
                </span>
                <span>Updated {formatDate(project.updated_at)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href={`/projects/${project.id}/edit`} className="btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
              </svg>
              Edit Project
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label="More actions"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <Link
                    href={`/projects/${project.id}/edit`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
                    </svg>
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                    </svg>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1 space-y-5">
            {project.problem_statement && (
              <SectionCard
                title="Problem Statement"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                }
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">
                  {project.problem_statement}
                </p>
              </SectionCard>
            )}

            {project.abstract && (
              <SectionCard
                title="Abstract"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                  </svg>
                }
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{project.abstract}</p>
              </SectionCard>
            )}

            {project.specifications && (
              <SectionCard
                title="Specifications"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                }
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">
                  {project.specifications}
                </p>
              </SectionCard>
            )}

            {project.requirement && (
              <SectionCard
                title="Requirement"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                }
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{project.requirement}</p>
              </SectionCard>
            )}

            {project.media.length > 0 && (
              <SectionCard
                title="Media & Files"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                }
              >
                <div className="grid grid-cols-4 gap-3.5">
                  {project.media.map((media) => {
                    const tile = MEDIA_TILE[media.media_type];
                    const isImage = media.media_type === "image";
                    return (
                      <button
                        type="button"
                        key={media.id}
                        onClick={() => window.open(media.file_url, "_blank")}
                        className={`group relative flex aspect-square flex-col justify-end overflow-hidden rounded-xl text-left ${
                          media.media_type === "cad" ? "border border-slate-200" : ""
                        }`}
                        style={isImage ? undefined : { background: tile.gradient }}
                      >
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={media.file_url} alt={media.filename ?? ""} className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <div className={`absolute inset-0 flex items-center justify-center ${media.media_type === "cad" ? "text-slate-300" : "text-white/90"}`}>
                            {tile.icon}
                          </div>
                        )}
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                          </svg>
                        </span>
                        <div className={`relative z-10 truncate px-2.5 py-2 text-[11px] font-bold ${isImage || media.media_type !== "cad" ? "bg-black/35 text-white" : "text-slate-700"}`}>
                          {media.filename ?? tile.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {project.next_steps && (
              <SectionCard
                title="Next Steps"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
                  </svg>
                }
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{project.next_steps}</p>
              </SectionCard>
            )}

            {project.note && (
              <SectionCard
                title="Note"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6M9 13h6M9 17h4" />
                  </svg>
                }
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{project.note}</p>
              </SectionCard>
            )}
          </div>

          <div className="w-[320px] shrink-0 space-y-5">
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[14px] font-extrabold">Minimum Item List (MIL)</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-bold text-slate-500">
                  {project.mil_items.length}
                </span>
              </div>
              {project.mil_items.length === 0 ? (
                <p className="text-[12.5px] text-slate-400">No MIL items yet — add them from Edit Project.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {project.mil_items.map((item) => {
                    const cs = categoryStyle(item.component.category?.slug);
                    return (
                      <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 pb-2.5 last:border-none last:pb-0">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cs.thumbBg} ${cs.thumbText} text-[11px] font-extrabold`}>
                          {item.component.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-bold text-slate-900">{item.component.name}</div>
                          {item.component.category && (
                            <div className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${cs.badge}`}>
                              {item.component.category.name}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[13px] font-extrabold text-slate-900">{item.quantity_required}</div>
                          <div className="text-[9.5px] font-semibold uppercase text-slate-400">Units</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card p-5">
              <h3 className="mb-3 text-[14px] font-extrabold">Project Info</h3>
              <div className="space-y-3 text-[12.5px]">
                <div>
                  <div className="font-bold uppercase tracking-wide text-slate-400" style={{ fontSize: 10.5 }}>
                    Created
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-700">{formatDate(project.created_at)}</div>
                </div>
                <div>
                  <div className="font-bold uppercase tracking-wide text-slate-400" style={{ fontSize: 10.5 }}>
                    Last Updated
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-700">{formatDateTime(project.updated_at)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FootNav current="projects" />

      {deleteOpen && token && (
        <DeleteProjectModal
          token={token}
          project={project}
          onCancel={() => setDeleteOpen(false)}
          onDeleted={() => router.push("/projects")}
        />
      )}
    </div>
  );
}

export function ProjectDetailClient() {
  return (
    <ProtectedRoute>
      <ProjectDetailContent />
    </ProtectedRoute>
  );
}
