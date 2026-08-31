// Types + fetch wrappers for Engineering Change Requests, mirroring the
// backend's Pydantic schemas in backend/app/schemas/ecr.py field-for-field
// (snake_case — same convention as lib/projects.ts / lib/inventory.ts).

import { apiDelete, apiGet, apiPatch, apiPost } from "./api";

export type ECRStatus = "submitted" | "approved" | "rejected" | "implemented";
export type ECRPriority = "low" | "medium" | "high" | "urgent";

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
  // No admin role gates who can be tagged as approver — this app has no
  // real admin-provisioning flow — so email is what makes a specific
  // person unambiguous to search for/pick out of the full user list.
  email: string;
}

export interface ECRCreate {
  title: string;
  reason: string;
  description?: string | null;
  priority?: ECRPriority;
  project_id?: string | null;
  component_id?: string | null;
  // Freeform fallback when the part isn't in the Inventory catalog yet —
  // only used server-side when component_id is left unset (a real
  // component always wins if both are sent).
  component_name?: string | null;
  assigned_approver_id?: string | null;
}

// Every field optional — partial-update (PATCH) payload, matches the
// backend's ECRUpdate. Only accepted server-side while status is still
// "submitted"; there's no status field here since status only ever moves
// via approve/reject/implement, never a generic edit.
export interface ECRUpdate {
  title?: string;
  reason?: string;
  description?: string | null;
  priority?: ECRPriority;
  project_id?: string | null;
  component_id?: string | null;
  component_name?: string | null;
  assigned_approver_id?: string | null;
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
  priority: ECRPriority;
  project: ECRProjectRef | null;
  component: ECRComponentRef | null;
  component_name: string | null;
  requester: ECRUserRef | null;
  assigned_approver: ECRUserRef | null;
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
  priority: ECRPriority;
  project: ECRProjectRef | null;
  component: ECRComponentRef | null;
  component_name: string | null;
  requester: ECRUserRef | null;
  assigned_approver: ECRUserRef | null;
  created_at: string;
  updated_at: string;
}

export function listEcrs(token: string, ecrStatus?: ECRStatus): Promise<ECRListItem[]> {
  const qs = ecrStatus ? `?ecr_status=${ecrStatus}` : "";
  return apiGet<ECRListItem[]>(`/api/v1/ecr${qs}`, token);
}

// Every user in the app — populates the "who needs to approve" picker on
// the New Change Request form. Not filtered to admins: there's no real
// admin-provisioning flow here, so any user can be tagged as the person
// who needs to approve a given request.
export function listApprovers(token: string): Promise<ECRUserRef[]> {
  return apiGet<ECRUserRef[]>("/api/v1/ecr/approvers", token);
}

export function getEcr(token: string, id: string): Promise<ECRRead> {
  return apiGet<ECRRead>(`/api/v1/ecr/${id}`, token);
}

export function createEcr(token: string, payload: ECRCreate): Promise<ECRRead> {
  return apiPost<ECRRead>("/api/v1/ecr", payload, token);
}

export function updateEcr(token: string, id: string, payload: ECRUpdate): Promise<ECRRead> {
  return apiPatch<ECRRead>(`/api/v1/ecr/${id}`, payload, token);
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
