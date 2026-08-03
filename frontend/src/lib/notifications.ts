// Types + fetch wrappers for the shared notification feed, mirroring the
// backend's Pydantic schemas in backend/app/schemas/notification.py
// field-for-field (snake_case — this API doesn't camelCase its responses,
// so neither do these types).

import { apiGet, apiPost } from "./api";

export type NotificationType =
  | "component_out_of_stock"
  | "component_low_stock"
  | "component_deleted"
  | "project_created"
  | "project_status_changed"
  | "project_deleted";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: Notification[];
  unread_count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export function listNotifications(
  token: string,
  opts?: { unreadOnly?: boolean; limit?: number; offset?: number }
): Promise<NotificationListResponse> {
  const params = new URLSearchParams();
  if (opts?.unreadOnly) params.set("unread_only", "true");
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return apiGet<NotificationListResponse>(
    `/api/v1/notifications${qs ? `?${qs}` : ""}`,
    token
  );
}

export function getUnreadCount(token: string): Promise<UnreadCountResponse> {
  return apiGet<UnreadCountResponse>("/api/v1/notifications/unread-count", token);
}

export function markNotificationRead(token: string, id: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>(`/api/v1/notifications/${id}/read`, {}, token);
}

export function markAllNotificationsRead(token: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>("/api/v1/notifications/read-all", {}, token);
}
