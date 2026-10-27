import {
  Database as DatabaseIcon,
  HardDrive,
  Server,
  Table2,
} from "lucide-react";

import type { DatabaseStatus } from "../../types/database";
import StatCard from "./StatCard";

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
    <section
      aria-label="Database status"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatCard
        label="Database engine"
        value={engineValue}
        detail={status?.database_name ?? "Waiting for database status"}
        icon={DatabaseIcon}
        color="bg-ctp-blue/10 text-ctp-blue"
      />

      <StatCard
        label="Connection"
        value={connectionValue}
        detail={
          status?.response_time_ms != null
            ? `${status.response_time_ms} ms response time`
            : "No successful health check"
        }
        icon={Server}
        color={
          connected
            ? "bg-ctp-green/10 text-ctp-green"
            : "bg-ctp-yellow/10 text-ctp-yellow"
        }
      />

      <StatCard
        label="Database tables"
        value={status?.connected ? String(tableCount) : "—"}
        detail={status?.schema_name ?? "Schema not verified"}
        icon={Table2}
        color="bg-ctp-mauve/10 text-ctp-mauve"
      />

      <StatCard
        label="Managed backups"
        value={backupLoading ? "…" : String(backupCount)}
        detail={
          status?.backup_service_available
            ? `Retention: ${status.backup_retention_days} days`
            : "Backup utilities unavailable"
        }
        icon={HardDrive}
        color={
          status?.backup_service_available
            ? "bg-ctp-green/10 text-ctp-green"
            : "bg-ctp-yellow/10 text-ctp-yellow"
        }
      />
    </section>
  );
}
