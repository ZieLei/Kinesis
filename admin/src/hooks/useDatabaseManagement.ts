import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  downloadDatabaseBackup,
  fetchDatabaseBackups,
  fetchDatabaseSchema,
  fetchDatabaseStatus,
  restoreDatabaseBackup,
  runDatabaseQuery,
} from "../lib/databaseApi";

import type {
  BackupFormat,
  BackupMetadata,
  DatabaseSchemaResponse,
  DatabaseStatus,
  QueryResult,
} from "../types/database";

const TOKEN_STORAGE_KEY = "kinesis-admin-api-token";
const MAX_RESTORE_UPLOAD_BYTES = 1_073_741_824;

type BackupBusyState = BackupFormat | null;

function readStoredToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function useDatabaseManagement() {
  // Authentication
  const [token, setToken] = useState<string>(readStoredToken);
  const [tokenInput, setTokenInput] = useState<string>(readStoredToken);

  // Database information
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [schema, setSchema] = useState<DatabaseSchemaResponse | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [backupCount, setBackupCount] = useState(0);
  const [backupRetentionDays, setBackupRetentionDays] = useState(30);

  // Loading and errors
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [schemaError, setSchemaError] = useState("");
  const [backupError, setBackupError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // SQL query
  const [query, setQuery] = useState(
    "SELECT id, name, category, price, stock FROM products LIMIT 50",
  );
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryMessage, setQueryMessage] = useState("");
  const [queryBusy, setQueryBusy] = useState(false);

  // Backup and restore
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState<BackupBusyState>(null);

  // Schema filtering and notices
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoaded = useRef(false);

  // Load status, schema, and backup inventory whenever the authenticated
  // session is connected or the user explicitly refreshes.
  useEffect(() => {
    if (!token.trim()) {
      setStatus(null);
      setSchema(null);
      setBackups([]);
      setBackupCount(0);
      setError("");
      setSchemaError("");
      setBackupError("");
      setLastUpdated(null);
      setLoading(false);
      setRefreshing(false);
      hasLoaded.current = false;
      return;
    }

    const controller = new AbortController();
    const initialLoad = !hasLoaded.current;

    setLoading(initialLoad);
    setRefreshing(!initialLoad);
    setError("");
    setSchemaError("");
    setBackupError("");

    void Promise.allSettled([
      fetchDatabaseStatus(token, controller.signal),
      fetchDatabaseSchema(token, controller.signal),
      fetchDatabaseBackups(token, controller.signal),
    ]).then(([statusResult, schemaResult, backupResult]) => {
      if (controller.signal.aborted) {
        return;
      }

      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
        setError("");
      } else {
        setStatus(null);
        setError(
          errorMessage(
            statusResult.reason,
            "Could not load database status.",
          ),
        );
      }

      if (schemaResult.status === "fulfilled") {
        setSchema(schemaResult.value);
        setSchemaError("");
      } else {
        setSchema(null);
        setSchemaError(
          errorMessage(
            schemaResult.reason,
            "Could not inspect the database schema.",
          ),
        );
      }

      if (backupResult.status === "fulfilled") {
        setBackups(backupResult.value.items);
        setBackupCount(backupResult.value.count);
        setBackupRetentionDays(backupResult.value.retention_days);
        setBackupError("");
      } else {
        setBackups([]);
        setBackupCount(0);
        setBackupError(
          errorMessage(
            backupResult.reason,
            "Could not load the backup list.",
          ),
        );
      }

      hasLoaded.current = true;
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      controller.abort();
    };
  }, [token, refreshKey]);

  // Authentication actions
  const connectAdmin = useCallback(() => {
    const nextToken = tokenInput.trim();

    if (!nextToken) {
      setNotice("Enter the admin API token first.");
      return;
    }

    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    } catch {
      setNotice(
        "Browser session storage is unavailable. The token will remain only in memory.",
      );
    }

    setNotice("");
    setError("");
    setSchemaError("");
    setBackupError("");
    hasLoaded.current = false;
    setToken(nextToken);
  }, [tokenInput]);

  const disconnectAdmin = useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Clearing React state still disconnects this page.
    }

    setToken("");
    setTokenInput("");
    setStatus(null);
    setSchema(null);
    setBackups([]);
    setBackupCount(0);
    setLastUpdated(null);
    setError("");
    setSchemaError("");
    setBackupError("");
    setQueryResult(null);
    setQueryMessage("");
    setNotice("Admin session cleared.");
    setShowRestoreConfirm(false);
    setRestoreConfirmation("");
    hasLoaded.current = false;
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  // Schema filtering
  const filteredTables = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return (schema?.tables ?? []).filter((table) =>
      `${table.name} ${table.description}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [schema, search]);

  // SQL query actions
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setQueryMessage("");
    setQueryResult(null);
  }, []);

  const runQuery = useCallback(async () => {
    setQueryResult(null);

    if (!token.trim()) {
      setQueryMessage("Connect the admin API before running a query.");
      return;
    }

    if (!status?.connected) {
      setQueryMessage(
        "The database is not currently reachable. No query was sent.",
      );
      return;
    }

    if (!query.trim()) {
      setQueryMessage("Enter a SQL query first.");
      return;
    }

    setQueryBusy(true);
    setQueryMessage("Running read-only query…");

    try {
      const result = await runDatabaseQuery(token, query);

      setQueryResult(result);
      setQueryMessage(
        result.truncated
          ? `Query completed in ${result.execution_time_ms} ms. Showing the first ${result.max_rows} rows; additional rows were omitted.`
          : `Query completed in ${result.execution_time_ms} ms. ${result.row_count} row(s) returned.`,
      );
    } catch (requestError) {
      setQueryMessage(
        errorMessage(requestError, "The query could not be completed."),
      );
    } finally {
      setQueryBusy(false);
    }
  }, [query, status?.connected, token]);

  // Backup file selection
  function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".dump")) {
      setSelectedFile(null);
      setShowRestoreConfirm(false);
      setRestoreConfirmation("");
      setNotice(
        "Unsupported backup format. Restore requires a PostgreSQL custom-format .dump file.",
      );

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    if (file.size === 0) {
      setSelectedFile(null);
      setShowRestoreConfirm(false);
      setRestoreConfirmation("");
      setNotice("The selected backup file is empty.");
      return;
    }

    if (file.size > MAX_RESTORE_UPLOAD_BYTES) {
      setSelectedFile(null);
      setShowRestoreConfirm(false);
      setRestoreConfirmation("");
      setNotice("The selected backup exceeds the 1 GiB upload limit.");
      return;
    }

    setSelectedFile(file);
    setShowRestoreConfirm(false);
    setRestoreConfirmation("");
    setNotice("");
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setShowRestoreConfirm(false);
    setRestoreConfirmation("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function toggleRestoreConfirm() {
    if (!selectedFile) {
      setNotice("Select a PostgreSQL .dump file first.");
      return;
    }

    setRestoreConfirmation("");
    setShowRestoreConfirm((current) => !current);
  }

  function closeRestoreConfirm() {
    setShowRestoreConfirm(false);
    setRestoreConfirmation("");
  }

  // Backup actions
  const requestBackup = useCallback(
    async (format: BackupFormat = "custom") => {
      if (!token.trim()) {
        setNotice("Connect the admin API before creating a backup.");
        return;
      }

      if (!status?.connected) {
        setNotice("The database is not reachable. No backup was requested.");
        return;
      }

      if (!status.backup_service_available) {
        setNotice(
          "PostgreSQL backup utilities are unavailable on the backend. No backup was created.",
        );
        return;
      }

      setBackupBusy(format);
      setNotice("");

      try {
        const filename = await downloadDatabaseBackup(token, format);

        setNotice(
          `Backup created and downloaded: ${filename}. Keep this file in a secure location.`,
        );

        refresh();
      } catch (requestError) {
        setNotice(
          errorMessage(requestError, "The database backup failed."),
        );
      } finally {
        setBackupBusy(null);
      }
    },
    [refresh, status, token],
  );

  const requestS3Backup = useCallback(() => {
    setNotice(
      status?.s3_configured
        ? "Remote backup is reported as configured, but no S3 backup endpoint is implemented yet. No remote backup was attempted."
        : "Remote backups are not configured on the backend. No S3 upload was attempted.",
    );
  }, [status?.s3_configured]);

  // Restore action
  const requestRestore = useCallback(async () => {
    if (!token.trim()) {
      setNotice("Connect the admin API before restoring a backup.");
      return;
    }

    if (!status?.connected) {
      setNotice("The database is not reachable. No restore was requested.");
      return;
    }

    if (!selectedFile) {
      setNotice("Select a PostgreSQL .dump file first.");
      return;
    }

    if (restoreConfirmation !== status.database_name) {
      setNotice(
        `Type the exact database name "${status.database_name}" to confirm the restore.`,
      );
      return;
    }

    setRestoreBusy(true);
    setNotice("");

    try {
      const result = await restoreDatabaseBackup(
        token,
        selectedFile,
        restoreConfirmation,
      );

      setNotice(
        `${result.message} A pre-restore snapshot was retained as ${result.pre_restore_backup.file_name}.`,
      );

      setSelectedFile(null);
      setShowRestoreConfirm(false);
      setRestoreConfirmation("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      hasLoaded.current = false;
      refresh();
    } catch (requestError) {
      setNotice(
        errorMessage(
          requestError,
          "Restore failed. Inspect the backend logs and retained pre-restore backup before trying again.",
        ),
      );
    } finally {
      setRestoreBusy(false);
    }
  }, [refresh, restoreConfirmation, selectedFile, status, token]);

  function dismissNotice() {
    setNotice("");
  }

  // Keep the public hook interface explicit and synchronized with Database.tsx.
  return {
    // Authentication
    token,
    tokenInput,
    setTokenInput,
    connectAdmin,
    disconnectAdmin,
    adminAuthenticated: Boolean(token.trim()) && status !== null,

    // Database status
    status,
    databaseConfigured: status?.configured ?? false,
    connected: status?.connected ?? false,
    engine: status?.engine ?? "Unknown",
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,

    // Schema
    schema,
    schemaError,
    search,
    setSearch,
    filteredTables,

    // Backup inventory
    backups,
    backupCount,
    backupRetentionDays,
    backupError,
    backupServiceAvailable: status?.backup_service_available ?? false,
    s3Configured: status?.s3_configured ?? false,
    backupBusy,
    restoreBusy,
    maxRestoreUploadBytes: MAX_RESTORE_UPLOAD_BYTES,

    // Restore controls
    fileInputRef,
    selectedFile,
    dragging,
    setDragging,
    showRestoreConfirm,
    restoreConfirmation,
    setRestoreConfirmation,
    handleFile,
    clearSelectedFile,
    toggleRestoreConfirm,
    closeRestoreConfirm,
    requestRestore,

    // Backup actions
    requestBackup,
    requestS3Backup,

    // Query
    query,
    queryResult,
    queryMessage,
    queryBusy,
    queryMaxRows: status?.query_max_rows ?? 200,
    handleQueryChange,
    runQuery,

    // Notices
    notice,
    dismissNotice,
  };
}
