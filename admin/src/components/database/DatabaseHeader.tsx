import PageHeader from "../ui/PageHeader";
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
    ? "Checking"
    : connected
      ? "Connected"
      : databaseConfigured
        ? "Unreachable"
        : "Not verified";

  const tone = connected
    ? "green"
    : databaseConfigured
      ? "red"
      : "yellow";

  return (
    <PageHeader
      title="Database management"
      description="Inspect PostgreSQL, run read-only queries, and manage database backups."
      status={<StatusBadge label={label} tone={tone} />}
    />
  );
}
