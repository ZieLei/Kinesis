
import {
  apiFetch,
  apiRequest,
} from "./api";

import type {
  BackupFormat,
  BackupListResponse,
  DatabaseSchemaResponse,
  DatabaseStatus,
  QueryResult,
  RestoreResponse,
} from "../types/database";


// --------------------------------------------------
// Database status
// --------------------------------------------------


export function fetchDatabaseStatus(
  signal?: AbortSignal,
): Promise<DatabaseStatus> {
  return apiRequest<DatabaseStatus>(
    "/api/admin/database/status",
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Database schema
// --------------------------------------------------


export function fetchDatabaseSchema(
  signal?: AbortSignal,
): Promise<DatabaseSchemaResponse> {
  return apiRequest<DatabaseSchemaResponse>(
    "/api/admin/database/schema",
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Available backups
// --------------------------------------------------


export function fetchDatabaseBackups(
  signal?: AbortSignal,
): Promise<BackupListResponse> {
  return apiRequest<BackupListResponse>(
    "/api/admin/database/backups?limit=100",
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Read-only SQL query
// --------------------------------------------------


export function runDatabaseQuery(
  sql: string,
  signal?: AbortSignal,
): Promise<QueryResult> {
  return apiRequest<QueryResult>(
    "/api/admin/database/query",
    {
      method: "POST",
      body: JSON.stringify({ sql }),
      signal,
    },
  );
}


// --------------------------------------------------
// Error handling
// --------------------------------------------------


async function getResponseError(
  response: Response,
  fallback: string,
): Promise<string> {
  const responseText = await response.text();

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

      if (
        typeof detail === "string" &&
        detail.trim()
      ) {
        return detail;
      }

      if (
        detail !== null &&
        detail !== undefined
      ) {
        return JSON.stringify(detail);
      }
    }
  } catch {
    // Avoid exposing arbitrary server response bodies.
  }

  return fallback;
}


// --------------------------------------------------
// Download filename
// --------------------------------------------------


function getDownloadFilename(
  response: Response,
): string {
  const disposition =
    response.headers.get("Content-Disposition") ?? "";

  const encodedMatch = disposition.match(
    /filename\*=UTF-8''([^;]+)/i,
  );

  if (encodedMatch?.[1]) {
    try {
      const filename = decodeURIComponent(
        encodedMatch[1],
      );

      return (
        filename.split(/[\\/]/).pop() ||
        "kinesis-backup.dump"
      );
    } catch {
      // Continue with the regular filename.
    }
  }

  const regularMatch = disposition.match(
    /filename="?([^";]+)"?/i,
  );

  if (regularMatch?.[1]) {
    return (
      regularMatch[1].split(/[\\/]/).pop() ||
      "kinesis-backup.dump"
    );
  }

  return "kinesis-backup.dump";
}


// --------------------------------------------------
// Database backup download
// --------------------------------------------------


export async function downloadDatabaseBackup(
  format: BackupFormat,
  signal?: AbortSignal,
): Promise<string> {
  const response = await apiFetch(
    `/api/admin/database/backups?format=${encodeURIComponent(format)}`,
    {
      method: "POST",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(
      await getResponseError(
        response,
        `Backup request failed with HTTP ${response.status}.`,
      ),
    );
  }

  const blob = await response.blob();

  if (blob.size === 0) {
    throw new Error(
      "The server returned an empty backup file.",
    );
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


// --------------------------------------------------
// Database restore
// --------------------------------------------------


export async function restoreDatabaseBackup(
  file: File,
  databaseNameConfirmation: string,
  signal?: AbortSignal,
): Promise<RestoreResponse> {
  const body = new FormData();

  body.append(
    "backup_file",
    file,
    file.name,
  );

  body.append(
    "database_name_confirmation",
    databaseNameConfirmation,
  );

  return apiRequest<RestoreResponse>(
    "/api/admin/database/restore",
    {
      method: "POST",
      body,
      signal,
    },
  );
}
