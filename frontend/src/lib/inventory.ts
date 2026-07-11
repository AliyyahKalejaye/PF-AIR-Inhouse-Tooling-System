// Types + fetch wrappers for the Inventory Management tool (Phase 5),
// mirroring the backend's Pydantic schemas in
// backend/app/schemas/inventory.py field-for-field (snake_case — this API
// doesn't camelCase its responses, so neither do these types).

import { apiDelete, apiGet, apiPatch, apiPost, apiPostFile } from "./api";

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Component {
  id: string;
  name: string;
  type: string;
  sku: string | null;
  brand: string | null;
  description: string | null;
  quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  category: Category | null;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComponentCreate {
  name: string;
  type: string;
  sku?: string | null;
  brand?: string | null;
  description?: string | null;
  quantity?: number;
  low_stock_threshold?: number;
  image_url?: string | null;
  category_id?: string | null;
}

export type ComponentUpdate = Partial<ComponentCreate>;

export interface InventoryStats {
  total_skus: number;
  low_stock: number;
  out_of_stock: number;
  categories: number;
}

export interface ComponentListResponse {
  items: Component[];
  total: number;
  limit: number;
  offset: number;
  stats: InventoryStats;
}

export type StockFilter = "all" | "low" | "out";

export type BOMItemStatus = "available" | "low_stock" | "missing";

export interface BOMItem {
  id: string;
  raw_name: string;
  quantity_requested: number;
  status: BOMItemStatus;
  matched_component: Component | null;
  suggested_component: Component | null;
  suggested_match_score: number | null;
}

export interface BOMSummary {
  available: number;
  low_stock: number;
  missing: number;
}

export interface BOMCheckResponse {
  bom_id: string;
  filename: string;
  items: BOMItem[];
  summary: BOMSummary;
}

export interface BOMReserveResult {
  component_id: string;
  name: string;
  quantity_deducted: number;
  remaining_quantity: number;
}

export interface BOMReserveSkipped {
  bom_item_id: string;
  raw_name: string;
  reason: string;
}

export interface BOMReserveResponse {
  bom_id: string;
  reserved: BOMReserveResult[];
  skipped: BOMReserveSkipped[];
}

// The seven spreadsheet-mappable fields — matches
// BULK_IMPORT_TARGET_FIELDS in backend/app/schemas/inventory.py exactly
// (no `sku`; see that file's comment for why).
export const BULK_IMPORT_TARGET_FIELDS = [
  "name",
  "type",
  "category",
  "brand",
  "description",
  "quantity",
  "image_url",
] as const;
export type BulkImportTargetField = (typeof BULK_IMPORT_TARGET_FIELDS)[number];

export const BULK_IMPORT_FIELD_LABELS: Record<BulkImportTargetField, string> = {
  name: "Name",
  type: "Type",
  category: "Category",
  brand: "Brand",
  description: "Description",
  quantity: "Quantity",
  image_url: "Image URL",
};

export interface BulkImportColumn {
  source_column: string;
  sample: string | null;
  mapped_field: string | null;
  status: "auto" | "manual";
}

export interface BulkImportPreviewResponse {
  filename: string;
  rows_detected: number;
  columns_detected: number;
  sheet: string | null;
  columns: BulkImportColumn[];
  rows: Record<string, string | null>[];
  warnings: string[];
}

export interface BulkImportSkippedRow {
  row_index: number;
  reason: string;
}

export interface BulkImportCommitResponse {
  created: number;
  skipped_rows: BulkImportSkippedRow[];
  warnings: string[];
}

export interface ListComponentsParams {
  q?: string;
  category_id?: string;
  stock?: StockFilter;
  limit?: number;
  offset?: number;
}

export function listComponents(
  token: string,
  params: ListComponentsParams = {}
): Promise<ComponentListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category_id) search.set("category_id", params.category_id);
  if (params.stock) search.set("stock", params.stock);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  return apiGet<ComponentListResponse>(`/api/v1/components${qs ? `?${qs}` : ""}`, token);
}

export function getComponent(token: string, id: string): Promise<Component> {
  return apiGet<Component>(`/api/v1/components/${id}`, token);
}

export function createComponent(token: string, payload: ComponentCreate): Promise<Component> {
  return apiPost<Component>("/api/v1/components", payload, token);
}

export function updateComponent(
  token: string,
  id: string,
  payload: ComponentUpdate
): Promise<Component> {
  return apiPatch<Component>(`/api/v1/components/${id}`, payload, token);
}

export function deleteComponent(token: string, id: string): Promise<void> {
  return apiDelete(`/api/v1/components/${id}`, token);
}

export function uploadComponentImage(
  token: string,
  id: string,
  file: File
): Promise<Component> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostFile<Component>(`/api/v1/components/${id}/image`, formData, token);
}

export function listCategories(token: string): Promise<Category[]> {
  return apiGet<Category[]>("/api/v1/categories", token);
}

export function checkBom(token: string, file: File): Promise<BOMCheckResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostFile<BOMCheckResponse>("/api/v1/bom/check", formData, token);
}

export function reserveBom(token: string, bomId: string): Promise<BOMReserveResponse> {
  return apiPost<BOMReserveResponse>(`/api/v1/bom/${bomId}/reserve`, {}, token);
}

export function previewBulkImport(
  token: string,
  file: File
): Promise<BulkImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostFile<BulkImportPreviewResponse>("/api/v1/bulk-import/preview", formData, token);
}

export function commitBulkImport(
  token: string,
  payload: { filename: string; mapping: Record<string, string>; rows: Record<string, string | null>[] }
): Promise<BulkImportCommitResponse> {
  return apiPost<BulkImportCommitResponse>("/api/v1/bulk-import/commit", payload, token);
}
