import { apiRequest } from "./api";

import type {
  NotificationsResponse,
  ServerAction,
  ServerActionResponse,
  ServerStatus,
} from "../types/server";

export function fetchServerStatus(signal?: AbortSignal): Promise<ServerStatus> {
  return apiRequest<ServerStatus>("/api/admin/server/status", {
    method: "GET",
    cache: "no-store",
    signal,
  });
}

export function setMaintenanceMode(enabled: boolean): Promise<ServerStatus> {
  return apiRequest<ServerStatus>("/api/admin/server/maintenance", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export function requestServerAction(action: ServerAction): Promise<ServerActionResponse> {
  return apiRequest<ServerActionResponse>(`/api/admin/server/${action}`, {
    method: "POST",
  });
}

export function fetchNotifications(signal?: AbortSignal): Promise<NotificationsResponse> {
  return apiRequest<NotificationsResponse>("/api/admin/notifications", {
    method: "GET",
    cache: "no-store",
    signal,
  });
}
