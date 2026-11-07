import type { DatabaseStatus } from "../../types/database";
import StatList from "../ui/StatList";

export default function SummaryCards({
  status,
  tableCount,
  backupCount,
  backupLoading,
}: {
  status: DatabaseStatus | null;
  tableCount: number;
  backupCount: number;
  backupLoading: boolean;
}) {
  const connected = status?.connected === true;
  const connectionValue = status
    ? connected
      ? "Connected"
      : "Unreachable"
    : "Unknown";

  const engineValue = status
    ? `${status.engine} / ${status.driver}`
    : "Unknown";

  return (
    <section aria-label="Database status">
      <StatList
        items={[
          {
            label: "Database engine",
            value: engineValue,
            hint: status?.database_name ?? "Waiting for database status",
          },
          {
            label: "Connection",
            value: connectionValue,
            valueClassName: status
              ? connected
                ? "text-ctp-green"
                : "text-ctp-red"
              : undefined,
            hint:
              status?.response_time_ms != null
                ? `${status.response_time_ms} ms response time`
                : "No successful health check",
          },
          {
            label: "Database tables",
            value: status?.connected ? String(tableCount) : "—",
            hint: status?.schema_name ?? "Schema not verified",
          },
          {
            label: "Managed backups",
            value: backupLoading ? "…" : String(backupCount),
            hint: status?.backup_service_available
              ? `Retention: ${status.backup_retention_days} days`
              : "Backup utilities unavailable",
          },
        ]}
      />
    </section>
  );
}
