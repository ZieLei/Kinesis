import type { DatabaseStatus } from "../../types/database";
import Section from "../ui/Section";
import StatusDot from "../ui/StatusDot";
import { KeyValueList } from "../ui/StatList";

export default function ConnectionSection({
  status,
  loading,
}: {
  status: DatabaseStatus | null;
  loading: boolean;
}) {
  const connected = status?.connected === true;

  const secondary = (text: string) => (
    <span className="ml-2 font-normal text-ctp-subtext0">{text}</span>
  );

  return (
    <Section
      id="db-connection"
      title="Connection details"
      description="Live information returned by the authenticated backend."
      bodyClassName="space-y-3"
    >
      <KeyValueList
        items={[
          {
            label: "Database engine",
            value: (
              <>
                {status ? `${status.engine} / ${status.driver}` : "Not verified"}
                {secondary(
                  status?.server_version
                    ? `Server ${status.server_version}`
                    : "Server version unavailable",
                )}
              </>
            ),
          },
          {
            label: "Host / port",
            value: (
              <span className="break-all font-mono">
                {status ? `${status.host}:${status.port}` : "Not verified"}
              </span>
            ),
          },
          {
            label: "Database / schema",
            value: (
              <span className="break-all">
                {status?.database_name ?? "Not verified"}
                {secondary(status?.schema_name ?? "Schema unavailable")}
              </span>
            ),
          },
          {
            label: "Connection test",
            value: (
              <span className="inline-flex items-center gap-2">
                <StatusDot
                  tone={connected ? "success" : loading ? "warning" : "danger"}
                  pulse={loading && !connected}
                >
                  {connected ? "Connected" : loading ? "Checking…" : "Unavailable"}
                </StatusDot>
                <span className="font-normal text-ctp-subtext0">
                  {status?.response_time_ms != null
                    ? `${status.response_time_ms} ms round trip`
                    : "No successful test"}
                </span>
              </span>
            ),
          },
          {
            label: "Credentials",
            value: <StatusDot tone="success">Protected</StatusDot>,
          },
        ]}
      />

      <p className="text-xs leading-relaxed text-ctp-subtext0">
        <span className="font-medium text-ctp-subtext1">
          Credentials remain on the server.
        </span>{" "}
        This page does not retrieve or display the PostgreSQL connection URI
        or password. The browser only receives non-secret connection metadata
        from the backend. Database name:{" "}
        <span className="text-ctp-text">
          {status?.database_name ?? "Not available"}
        </span>
        {" · "}Schema:{" "}
        <span className="text-ctp-text">
          {status?.schema_name ?? "Not available"}
        </span>
      </p>
    </Section>
  );
}
