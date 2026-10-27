import { Database as DatabaseIcon } from "lucide-react";
import StatusBadge from "./StatusBadge";

export default function DatabaseHeader({
  databaseConfigured,
  connected,
  loading,
}: {
  databaseConfigured: boolean;
  connected: boolean;
  loading: boolean;
}) {
  const label = loading && !databaseConfigured
    ? "CHECKING"
    : connected
      ? "CONNECTED"
      : databaseConfigured
        ? "UNREACHABLE"
        : "NOT VERIFIED";

  const tone = connected
    ? "green"
    : databaseConfigured
      ? "red"
      : "yellow";

  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <div className="flex items-center gap-2">
          <DatabaseIcon size={21} className="text-ctp-mauve" />
          <h1 className="font-line-seed text-xl font-bold text-ctp-text">
            Database Management
          </h1>
        </div>

        <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
          Inspect PostgreSQL, run read-only queries, and manage database backups.
        </p>
      </div>

      <StatusBadge label={label} tone={tone} />
    </header>
  );
}
