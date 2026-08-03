"use client";

// Edit Project — reuses ProjectForm in "edit" mode per screen 11's own
// copy ("this same form is used later to edit the project once
// created"). Just fetches the full ProjectRead first so the form has
// something to pre-fill and diff against on save.
//
// Plain component, not the route's page.tsx — see page.tsx in this
// directory for why (static export requires generateStaticParams from a
// Server Component; this file's "use client" directive would make Next
// ignore that export if it lived here).
//
// The real project id is read via usePathname(), NOT useParams() — see
// the comment in ../ProjectDetailClient.tsx for why useParams() is wrong
// here (it returns the build-time "placeholder" id, not the real one, in
// a static export with no server-side route matching).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { ProjectRead, getProject } from "@/lib/projects";

function EditProjectContent() {
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // "/projects/<id>/edit" -> ["", "projects", "<id>", "edit"] -> index 2.
  const projectId = pathname.split("/")[2] ?? "";

  const [project, setProject] = useState<ProjectRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Projects Progress Report" />

      <div className="flex-1 px-4 pb-6 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400">
          <Link href="/projects" className="hover:text-slate-600">
            Projects
          </Link>
          <span>/</span>
          {project ? (
            <>
              <Link href={`/projects/${project.id}`} className="max-w-[300px] truncate hover:text-slate-600">
                {project.title}
              </Link>
              <span>/</span>
              <b className="text-slate-600">Edit</b>
            </>
          ) : (
            <b className="text-slate-600">Edit</b>
          )}
        </div>

        {loading && <div className="py-16 text-center text-[13.5px] font-medium text-slate-400">Loading…</div>}

        {!loading && (loadError || !project) && (
          <div className="py-16 text-center">
            <p className="mb-4 text-[13.5px] font-medium text-rose-600">{loadError ?? "Project not found."}</p>
            <Link href="/projects" className="btn-secondary">
              Back to Projects
            </Link>
          </div>
        )}

        {!loading && project && token && (
          <ProjectForm
            token={token}
            mode="edit"
            initial={project}
            onCancel={() => router.push(`/projects/${project.id}`)}
            onSaved={(saved) => router.push(`/projects/${saved.id}`)}
          />
        )}
      </div>

      <FootNav current="projects" />
    </div>
  );
}

export function EditProjectClient() {
  return (
    <ProtectedRoute>
      <EditProjectContent />
    </ProtectedRoute>
  );
}
