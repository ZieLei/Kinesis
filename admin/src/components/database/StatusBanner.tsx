import {
  CircleAlert,
  CircleCheck,
  Info,
} from "lucide-react";

import type { DatabaseStatus } from "../../types/database";
import StatusBadge from "./StatusBadge";

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

  const tone = connected ? "green" : adminAuthenticated ? "red" : "yellow";

  return (
    <section
      className={`rounded-lg border p-3 ${connected
          ? "border-ctp-green/20 bg-ctp-green/5"
          : "border-ctp-yellow/20 bg-ctp-yellow/5"
        }`}
    >
      <div className="flex items-start gap-2.5">
        {connected ? (
          <CircleCheck size={18} className="mt-0.5 shrink-0 text-ctp-green" />
        ) : adminAuthenticated ? (
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-ctp-red" />
        ) : (
          <Info size={18} className="mt-0.5 shrink-0 text-ctp-yellow" />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="font-line-seed text-sm font-bold text-ctp-text">
            {title}
          </h2>

          <p className="mt-1 break-words font-line-seed text-xs leading-5 text-ctp-subtext1">
            {description}
          </p>

          {error && adminAuthenticated && (
            <p role="alert" className="mt-2 break-words font-line-seed text-xs text-ctp-red">
              Status: {error}
            </p>
          )}

          {schemaError && adminAuthenticated && (
            <p role="alert" className="mt-2 break-words font-line-seed text-xs text-ctp-yellow">
              Schema inspection: {schemaError}
            </p>
          )}

          {backupError && adminAuthenticated && (
            <p role="alert" className="mt-2 break-words font-line-seed text-xs text-ctp-yellow">
              Backup list: {backupError}
            </p>
          )}
        </div>

        <StatusBadge
          label={connected ? "ONLINE" : adminAuthenticated ? "OFFLINE" : "LOCKED"}
          tone={tone}
        />
      </div>
    </section>
  );
}
