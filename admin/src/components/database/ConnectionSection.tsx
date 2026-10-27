import {
  Database as DatabaseIcon,
  ShieldCheck,
  HardDrive,
  CircleAlert,
  CheckCircle2,
  Clock,
  LockKeyhole,
} from "lucide-react";

import type { DatabaseStatus } from "../../types/database";
import SectionHeading from "./SectionHeading";
import StatusBadge from "./StatusBadge";

export default function ConnectionSection({
  status,
  loading,
}: {
  status: DatabaseStatus | null;
  loading: boolean;
}) {
  const connected = status?.connected === true;

  return (
    <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3 sm:p-4">
      <SectionHeading
        icon={ShieldCheck}
        title="Connection details"
        description="Live information returned by the authenticated backend."
      />

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-ctp-surface0 p-3">
          <p className="font-line-seed text-[11px] text-ctp-subtext0">
            Database engine
          </p>
          <p className="mt-1.5 flex items-center gap-2 font-line-seed text-sm font-semibold text-ctp-text">
            <DatabaseIcon size={15} className="text-ctp-blue" />
            {status ? `${status.engine} / ${status.driver}` : "Not verified"}
          </p>
          <p className="mt-1 break-all font-line-seed text-[10px] text-ctp-subtext0">
            {status?.server_version
              ? `Server ${status.server_version}`
              : "Server version unavailable"}
          </p>
        </div>

        <div className="rounded-md border border-ctp-surface0 p-3">
          <p className="font-line-seed text-[11px] text-ctp-subtext0">
            Host / port
          </p>
          <p className="mt-1.5 break-all font-mono text-sm font-semibold text-ctp-text">
            {status ? `${status.host}:${status.port}` : "Not verified"}
          </p>
          <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
            Database server endpoint
          </p>
        </div>

        <div className="rounded-md border border-ctp-surface0 p-3">
          <p className="font-line-seed text-[11px] text-ctp-subtext0">
            Database / schema
          </p>
          <p className="mt-1.5 break-all font-line-seed text-sm font-semibold text-ctp-text">
            {status?.database_name ?? "Not verified"}
          </p>
          <p className="mt-1 break-all font-line-seed text-[10px] text-ctp-subtext0">
            {status?.schema_name ?? "Schema unavailable"}
          </p>
        </div>

        <div className="rounded-md border border-ctp-surface0 p-3">
          <p className="font-line-seed text-[11px] text-ctp-subtext0">
            Connection test
          </p>
          <p
            className={`mt-1.5 flex items-center gap-2 font-line-seed text-sm font-semibold ${connected ? "text-ctp-green" : "text-ctp-yellow"
              }`}
          >
            {connected ? (
              <CheckCircle2 size={15} />
            ) : loading ? (
              <Clock size={15} />
            ) : (
              <CircleAlert size={15} />
            )}
            {connected ? "Connected" : loading ? "Checking…" : "Unavailable"}
          </p>
          <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
            {status?.response_time_ms != null
              ? `${status.response_time_ms} ms round trip`
              : "No successful test"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-ctp-surface0 bg-ctp-mantle p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ctp-green/10 text-ctp-green">
            <LockKeyhole size={16} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-line-seed text-xs font-bold text-ctp-text">
              Credentials remain on the server
            </h3>
            <p className="mt-1 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
              This page does not retrieve or display the PostgreSQL connection
              URI or password. The browser only receives non-secret connection
              metadata from the backend.
            </p>
          </div>

          <StatusBadge label="PROTECTED" tone="green" />
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-ctp-surface0 pt-3">
          <HardDrive size={14} className="shrink-0 text-ctp-overlay1" />
          <p className="font-line-seed text-[11px] leading-5 text-ctp-subtext0">
            <span className="font-semibold text-ctp-text">Database name:</span>{" "}
            {status?.database_name ?? "Not available"}
            <span className="px-2">·</span>
            <span className="font-semibold text-ctp-text">Schema:</span>{" "}
            {status?.schema_name ?? "Not available"}
          </p>
        </div>
      </div>
    </section>
  );
}
