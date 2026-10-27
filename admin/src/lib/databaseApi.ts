import { apiRequest } from "./api";
import { API_BASE_URL } from "./api";

import type {
  BackupFormat,
  BackupListResponse,
  DatabaseSchemaResponse,
  DatabaseStatus,
  QueryResult,
  RestoreResponse,
} from "../types/database";

function adminHeaders(token: string): HeadersInit {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new Error("Enter the admin API token first.");
  }

  return {
    "X-Admin-Token": normalizedToken,
  };
}

export function fetchDatabaseStatus(
  token: string,
  signal?: AbortSignal,
): Promise<DatabaseStatus> {
  return apiRequest<DatabaseStatus>("/api/admin/database/status", {
    method: "GET",
    headers: adminHeaders(token),
    signal,
  });
}

export function fetchDatabaseSchema(
  token: string,
  signal?: AbortSignal,
): Promise<DatabaseSchemaResponse> {
  return apiRequest<DatabaseSchemaResponse>("/api/admin/database/schema", {
    method: "GET",
    headers: adminHeaders(token),
    signal,
  });
}

export function fetchDatabaseBackups(
  token: string,
  signal?: AbortSignal,
): Promise<BackupListResponse> {
  return apiRequest<BackupListResponse>(
    "/api/admin/database/backups?limit=100",
    {
      method: "GET",
      headers: adminHeaders(token),
      signal,
    },
  );
}

export function runDatabaseQuery(
  token: string,
  sql: string,
  signal?: AbortSignal,
): Promise<QueryResult> {
  return apiRequest<QueryResult>("/api/admin/database/query", {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ sql }),
    signal,
  });
}

function getResponseError(
  responseText: string,
  fallback: string,
): string {
  if (!responseText.trim()) {
    return fallback;
  }

  try {
    const payload: unknown = JSON.parse(responseText);

    if (
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload
    ) {
      const detail = payload.detail;

      if (typeof detail === "string" && detail.trim()) {
        return detail;
      }

      if (detail !== null && detail !== undefined) {
        return JSON.stringify(detail);
      }
    }
  } catch {
    // Avoid exposing arbitrary server responses as trusted error details.
  }

  return fallback;
}

function getDownloadFilename(response: Response): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";

  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    try {
      const filename = decodeURIComponent(encodedMatch[1]);
      return filename.split(/[\\/]/).pop() || "kinesis-backup.dump";
    } catch {
      // Fall through to filename=.
    }
  }

  const regularMatch = disposition.match(/filename="?([^";]+)"?/i);

  if (regularMatch?.[1]) {
    return regularMatch[1].split(/[\\/]/).pop() || "kinesis-backup.dump";
  }

  return "kinesis-backup.dump";
}

export async function downloadDatabaseBackup(
  token: string,
  format: BackupFormat,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/database/backups?format=${encodeURIComponent(format)}`,
    {
      method: "POST",
      headers: adminHeaders(token),
      signal,
    },
  );

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      getResponseError(
        responseText,
        `Backup request failed with HTTP ${response.status}.`,
      ),
    );
  }

  const blob = await response.blob();

  if (blob.size === 0) {
    throw new Error("The server returned an empty backup file.");
  }

  const filename = getDownloadFilename(response);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  return filename;
}

export async function restoreDatabaseBackup(
  token: string,
  file: File,
  databaseNameConfirmation: string,
  signal?: AbortSignal,
): Promise<RestoreResponse> {
  const body = new FormData();

  body.append("backup_file", file, file.name);
  body.append("database_name_confirmation", databaseNameConfirmation);

  return apiRequest<RestoreResponse>("/api/admin/database/restore", {
    method: "POST",
    headers: adminHeaders(token),
    body,
    signal,
  });
}
