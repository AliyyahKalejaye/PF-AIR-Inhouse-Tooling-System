// Types + fetch wrappers for the Projects Progress Report tool (Phase 7),
// mirroring the backend's Pydantic schemas in
// backend/app/schemas/project.py field-for-field (snake_case — same
// convention as lib/inventory.ts). MILItemRead.component reuses the
// Component type from lib/inventory.ts since it's the exact same
// ComponentRead shape the backend returns.

import { apiDelete, apiGet, apiPatch, apiPost, apiPostFile } from "./api";
import type { Component } from "./inventory";

export type ProjectStatus = "active" | "done" | "paused" | "relegated";

export type MediaType = "image" | "video" | "3d_render" | "cad" | "code";

// The 7 text fields a project write-up's headings are matched against —
// same order as PROJECT_TEXT_FIELDS in backend/app/schemas/project.py,
// which is also the standard template / manual-entry form order.
export const PROJECT_TEXT_FIELDS = [
  "title",
  "problem_statement",
  "abstract",
  "specifications",
  "requirement",
  "next_steps",
  "note",
] as const;
export type ProjectTextField = (typeof PROJECT_TEXT_FIELDS)[number];

export interface ProjectCreate {
  title: string;
  problem_statement?: string | null;
  abstract?: string | null;
  specifications?: string | null;
  requirement?: string | null;
  next_steps?: string | null;
  note?: string | null;
  status?: ProjectStatus;
}

export type ProjectUpdate = Partial<ProjectCreate>;

export interface ProjectMediaRead {
  id: string;
  media_type: MediaType;
  file_url: string;
  filename: string | null;
  // Client-rendered grid-tile preview (captured video frame, or an
  // off-screen 3D/STEP render) — see lib/media-thumbnail.ts. Null for
  // images (the original is its own thumbnail), `code` entries, and
  // .sldprt files (nothing can render a preview for those).
  thumbnail_url: string | null;
  created_at: string;
}

export interface MILItemRead {
  id: string;
  component: Component;
  quantity_required: number;
  created_at: string;
}

export interface ProjectRead {
  id: string;
  title: string;
  problem_statement: string | null;
  abstract: string | null;
  specifications: string | null;
  requirement: string | null;
  next_steps: string | null;
  note: string | null;
  status: ProjectStatus;
  media: ProjectMediaRead[];
  mil_items: MILItemRead[];
  created_at: string;
  updated_at: string;
  snippet: string;
}

// Deliberately lighter than ProjectRead — the list endpoint doesn't
// eager-load media/MIL, so this shape (matching backend's ProjectListItem)
// is all the list page ever has to render a card.
export interface ProjectListItem {
  id: string;
  title: string;
  problem_statement: string | null;
  abstract: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  snippet: string;
}

export interface ProjectMediaLinkCreate {
  media_type: MediaType;
  file_url: string;
  filename?: string | null;
}

export interface MILItemCreate {
  component_id: string;
  quantity_required?: number;
}

export interface MILItemUpdate {
  quantity_required: number;
}

export interface ParsedField {
  value: string | null;
  matched: boolean;
  heading: string | null;
  page: number | null;
}

export interface ParsedMedia {
  filename: string;
  media_type: MediaType;
  file_url: string;
}

export interface DocumentParseResponse {
  filename: string;
  doc_type: string;
  page_count: number | null;
  fields: Record<string, ParsedField>;
  matched_count: number;
  total_fields: number;
  media: ParsedMedia[];
}

export function listProjects(
  token: string,
  projectStatus?: ProjectStatus
): Promise<ProjectListItem[]> {
  const qs = projectStatus ? `?project_status=${projectStatus}` : "";
  return apiGet<ProjectListItem[]>(`/api/v1/projects${qs}`, token);
}

export function getProject(token: string, id: string): Promise<ProjectRead> {
  return apiGet<ProjectRead>(`/api/v1/projects/${id}`, token);
}

export function createProject(token: string, payload: ProjectCreate): Promise<ProjectRead> {
  return apiPost<ProjectRead>("/api/v1/projects", payload, token);
}

export function updateProject(
  token: string,
  id: string,
  payload: ProjectUpdate
): Promise<ProjectRead> {
  return apiPatch<ProjectRead>(`/api/v1/projects/${id}`, payload, token);
}

export function deleteProject(token: string, id: string): Promise<void> {
  return apiDelete(`/api/v1/projects/${id}`, token);
}

export function uploadProjectMedia(
  token: string,
  projectId: string,
  file: File,
  mediaType: MediaType,
  thumbnail?: Blob | null
): Promise<ProjectMediaRead> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("media_type", mediaType);
  if (thumbnail) formData.append("thumbnail", thumbnail, "thumbnail.jpg");
  return apiPostFile<ProjectMediaRead>(`/api/v1/projects/${projectId}/media`, formData, token);
}

export function linkProjectMedia(
  token: string,
  projectId: string,
  payload: ProjectMediaLinkCreate
): Promise<ProjectMediaRead> {
  return apiPost<ProjectMediaRead>(`/api/v1/projects/${projectId}/media/link`, payload, token);
}

export function deleteProjectMedia(
  token: string,
  projectId: string,
  mediaId: string
): Promise<void> {
  return apiDelete(`/api/v1/projects/${projectId}/media/${mediaId}`, token);
}

export function addMilItem(
  token: string,
  projectId: string,
  payload: MILItemCreate
): Promise<MILItemRead> {
  return apiPost<MILItemRead>(`/api/v1/projects/${projectId}/mil-items`, payload, token);
}

export function updateMilItem(
  token: string,
  projectId: string,
  milItemId: string,
  payload: MILItemUpdate
): Promise<MILItemRead> {
  return apiPatch<MILItemRead>(
    `/api/v1/projects/${projectId}/mil-items/${milItemId}`,
    payload,
    token
  );
}

export function deleteMilItem(
  token: string,
  projectId: string,
  milItemId: string
): Promise<void> {
  return apiDelete(`/api/v1/projects/${projectId}/mil-items/${milItemId}`, token);
}

export function parseProjectDocument(token: string, file: File): Promise<DocumentParseResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostFile<DocumentParseResponse>("/api/v1/projects/parse-document", formData, token);
}
