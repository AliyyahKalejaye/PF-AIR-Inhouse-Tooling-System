// Types + fetch wrappers for Engineering Change Requests, mirroring the
// backend's Pydantic schemas in backend/app/schemas/ecr.py field-for-field
// (snake_case — same convention as lib/projects.ts / lib/inventory.ts).

import { apiDelete, apiGet, apiPost } from "./api";

export type ECRStatus = "submitted" | "approved" | "rejected" | "implemented";

export interface ECRProjectRef {
  id: string;
  title: string;
}

export interface ECRComponentRef {
  id: string;
  name: string;
  sku: string | null;
}

export interface ECRUserRef {
  id: string;
  name: string;
}

export interface ECRCreate {
  title: string;
  reason: string;
  description?: string | null;
  project_id?: string | null;
  component_id?: string | null;
}

export interface ECRDecision {
  review_notes?: string | null;
}

export interface ECRRead {
  id: string;
  title: string;
  reason: string;
  description: string | null;
  status: ECRStatus;
  project: ECRProjectRef | null;
  component: ECRComponentRef | null;
  requester: ECRUserRef | null;
  reviewer: ECRUserRef | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Deliberately lighter than ECRRead — no `description`/`review_notes` —
// matches ECRListItem on the backend, same reasoning as
// ProjectListItem vs ProjectRead in lib/projects.ts.
export interface ECRListItem {
  id: string;
  title: string;
  reason: string;
  status: ECRStatus;
  project: ECRProjectRef | null;
  component: ECRComponentRef | null;
  requester: ECRUserRef | null;
  created_at: string;
  updated_at: string;
}

export function listEcrs(token: string, ecrStatus?: ECRStatus): Promise<ECRListItem[]> {
  const qs = ecrStatus ? `?ecr_status=${ecrStatus}` : "";
  return apiGet<ECRListItem[]>(`/api/v1/ecr${qs}`, token);
}

export function getEcr(token: string, id: string): Promise<ECRRead> {
  return apiGet<ECRRead>(`/api/v1/ecr/${id}`, token);
}

export function createEcr(token: string, payload: ECRCreate): Promise<ECRRead> {
  return apiPost<ECRRead>("/api/v1/ecr", payload, token);
}

export function approveEcr(token: string, id: string, payload: ECRDecision = {}): Promise<ECRRead> {
  return apiPost<ECRRead>(`/api/v1/ecr/${id}/approve`, payload, token);
}

export function rejectEcr(token: string, id: string, payload: ECRDecision = {}): Promise<ECRRead> {
  return apiPost<ECRRead>(`/api/v1/ecr/${id}/reject`, payload, token);
}

export function implementEcr(token: string, id: string): Promise<ECRRead> {
  return apiPost<ECRRead>(`/api/v1/ecr/${id}/implement`, {}, token);
}

export function deleteEcr(token: string, id: string): Promise<void> {
  return apiDelete(`/api/v1/ecr/${id}`, token);
}
