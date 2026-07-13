"use client";

// Projects list (screen 8/17) — every project grouped by status
// (Active → Done → Paused → Relegated per PROJECT_STATUS_ORDER), each
// group showing a count and divider like the approved mockup. Unlike the
// mockup's per-project emoji icons, every row uses the same generic
// project-folder badge: Project has no icon/category field on the
// backend to derive a unique one from, so inventing per-row icons would
// be decorative noise with no real data behind it.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { DeleteProjectModal } from "@/components/projects/DeleteProjectModal";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { ProjectListItem, listProjects } from "@/lib/projects";
import { PROJECT_STATUS_ORDER, PAUSED_TEXT_COLOR, projectStatusStyle } from "@/lib/project-status";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ProjectIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function ProjectRow({
  project,
  menuOpen,
  onToggleMenu,
  onEdit,
  onDeleteRequest,
}: {
  project: ProjectListItem;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDeleteRequest: () => void;
}) {
  const style = projectStatusStyle(project.status);

  return (
    <div className="card relative flex items-center gap-4 px-5 py-4">
      <Link href={`/projects/${project.id}`} className="flex flex-1 items-center gap-4 overflow-hidden">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-700">
          <ProjectIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-slate-900">{project.title}</div>
          <div className="truncate text-[13px] text-slate-500">{project.snippet || "No summary yet."}</div>
        </div>
      </Link>

      <span
        className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${style.pill}`}
        style={project.status === "paused" ? { color: PAUSED_TEXT_COLOR } : undefined}
      >
        {style.label}
      </span>
      <span className="shrink-0 text-[12.5px] text-slate-400">Updated {formatDate(project.updated_at)}</span>
      <Link href={`/projects/${project.id}`} className="shrink-0 text-slate-300">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => {
            // Without this, opening a different row's menu while another
            // is already open toggles this one open, then the window
            // "click outside" listener (added by the *previous* menu's
            // effect) fires on the same event and immediately nulls it
            // back out.
            e.stopPropagation();
            onToggleMenu();
          }}
          aria-label={`Actions for ${project.title}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button
              type="button"
              onClick={onEdit}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
              </svg>
              Edit
            </button>
            <button
              type="button"
              onClick={onDeleteRequest}
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
  );
}

function ProjectsContent() {
  const { token } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);

  const fetchProjects = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    listProjects(token)
      .then(setProjects)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load projects. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Close any open row menu on an outside click.
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenuId]);

  const grouped = PROJECT_STATUS_ORDER.map((status) => ({
    status,
    items: projects.filter((p) => p.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Projects Progress Report" />

      <div className="flex-1 px-8 pb-10 pt-7">
        <div className="mb-[22px] flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight">Projects</h1>
            <p className="mt-1 text-[14px] text-slate-500">
              All engineering projects, linked to their own progress report page
            </p>
          </div>
          <Link href="/projects/new" className="btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add New Project
          </Link>
        </div>

        {loadError && (
          <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
            {loadError}
          </div>
        )}

        {loading && <div className="py-16 text-center text-[13.5px] font-medium text-slate-400">Loading…</div>}

        {!loading && !loadError && projects.length === 0 && (
          <div className="card flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <ProjectIcon />
            </div>
            <p className="text-[13.5px] font-medium text-slate-500">No projects yet.</p>
            <Link href="/projects/new" className="btn-primary">
              Add New Project
            </Link>
          </div>
        )}

        {!loading &&
          grouped.map((group) => {
            const style = projectStatusStyle(group.status);
            return (
              <div key={group.status} className="mb-8">
                <div className="mb-3.5 flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  <span className="text-[12.5px] font-extrabold uppercase tracking-wide text-slate-600">
                    {style.label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-bold text-slate-500">
                    {group.items.length}
                  </span>
                  <span className="ml-1 h-px flex-1 bg-slate-200" />
                </div>
                <div className="flex flex-col gap-3">
                  {group.items.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      menuOpen={openMenuId === project.id}
                      onToggleMenu={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                      onEdit={() => router.push(`/projects/${project.id}/edit`)}
                      onDeleteRequest={() => {
                        setOpenMenuId(null);
                        setDeleteTarget(project);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      <FootNav current="projects" />

      {deleteTarget && token && (
        <DeleteProjectModal
          token={token}
          project={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            fetchProjects();
          }}
        />
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <ProjectsContent />
    </ProtectedRoute>
  );
}
