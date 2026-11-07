import type { DatabaseStatus } from "../../types/database";
import Notice from "../ui/Notice";

export default function StatusBanner({
  adminAuthenticated,
  status,
  loading,
  error,
  schemaError,
  backupError,
}: {
  adminAuthenticated: boolean;
  status: DatabaseStatus | null;
  loading: boolean;
  error: string;
  schemaError: string;
  backupError: string;
}) {
  const connected = status?.connected === true;

  const title = !adminAuthenticated
    ? "Admin authentication required"
    : loading && !status
      ? "Checking database connection"
      : connected
        ? "PostgreSQL is reachable"
        : "Database connection is unavailable";

  const description = !adminAuthenticated
    ? "Enter the admin API token to request database status, schema information, and backup metadata."
    : loading && !status
      ? "Waiting for the authenticated database status request to complete."
      : connected
        ? `Connected to ${status?.database_name ?? "the configured database"} on ${status?.host ?? "the configured host"}. The frontend does not receive database credentials.`
        : status?.error ??
        error ??
        "The database could not be reached. Check the backend logs and database configuration.";

  const tone = connected
    ? "success"
    : loading && !status
      ? "info"
      : adminAuthenticated
        ? "danger"
        : "warning";

  return (
    <Notice tone={tone} role="status" title={title}>
      <p>{description}</p>

      {error && adminAuthenticated && (
        <p role="alert" className="mt-1 text-ctp-red">
          Status: {error}
        </p>
      )}

      {schemaError && adminAuthenticated && (
        <p role="alert" className="mt-1 text-ctp-yellow">
          Schema inspection: {schemaError}
        </p>
      )}

      {backupError && adminAuthenticated && (
        <p role="alert" className="mt-1 text-ctp-yellow">
          Backup list: {backupError}
        </p>
      )}
    </Notice>
  );
}
