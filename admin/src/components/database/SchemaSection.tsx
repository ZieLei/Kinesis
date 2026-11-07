import { ChevronRight, RefreshCw } from "lucide-react";

import type { TableSchema } from "../../types/database";
import Section from "../ui/Section";
import SearchInput from "../ui/SearchInput";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "./StatusBadge";
import UnavailableNotice from "./UnavailableNotice";
import { tableHead } from "../ui/styles";

export default function SchemaSection({
  search,
  onSearchChange,
  filteredTables,
  totalTables,
  loading,
  error,
  schemaName,
  databaseSize,
  note,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filteredTables: TableSchema[];
  totalTables: number;
  loading: boolean;
  error: string;
  schemaName: string | null;
  databaseSize: string | null;
  note: string;
}) {
  return (
    <Section
      id="db-schema"
      title="Database schema"
      description="Actual tables, column definitions, estimated row counts, and storage."
      actions={
        <SearchInput
          value={search}
          onChange={onSearchChange}
          label="Filter tables"
          placeholder="Filter tables"
          className="w-full sm:w-64"
        />
      }
      bodyClassName="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ctp-subtext0">
        <p className="tabular-nums">
          {schemaName ? `Schema: ${schemaName}` : "Schema not loaded"}
          {" · "}
          {filteredTables.length} of {totalTables} table(s)
          {databaseSize ? ` · Database size: ${databaseSize}` : ""}
        </p>

        <StatusBadge
          label={error ? "Inspection failed" : loading ? "Loading" : "Live data"}
          tone={error ? "red" : loading ? "yellow" : "green"}
        />
      </div>

      {error ? (
        <UnavailableNotice>Table inspection failed: {error}</UnavailableNotice>
      ) : loading && totalTables === 0 ? (
        <p
          role="status"
          className="flex items-center gap-2 border-y border-ctp-surface0 py-8 text-xs text-ctp-subtext0"
        >
          <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
          Loading database schema…
        </p>
      ) : filteredTables.length > 0 ? (
        <div className="divide-y divide-ctp-surface0 border-y border-ctp-surface0">
          <div
            aria-hidden="true"
            className="hidden items-center gap-3 py-2 pl-6 sm:flex"
          >
            <span className="flex-1 text-xs font-medium text-ctp-subtext0">
              Table
            </span>
            <div className="grid w-[260px] shrink-0 grid-cols-3 gap-3 text-xs font-medium text-ctp-subtext0">
              <span>Columns</span>
              <span>Rows</span>
              <span>Size</span>
            </div>
          </div>

          {filteredTables.map((table) => (
            <details key={table.name} className="group">
              <summary className="flex cursor-pointer list-none flex-col gap-2 py-2.5 transition-colors hover:bg-ctp-surface0/30 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-1.5">
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-ctp-overlay1 transition-transform group-open:rotate-90"
                  />
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm text-ctp-text">
                      {table.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ctp-subtext0">
                      {table.description}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-3 pl-5 sm:w-[260px] sm:shrink-0 sm:pl-0">
                  <div>
                    <dt className="text-xs text-ctp-subtext0 sm:sr-only">
                      Columns
                    </dt>
                    <dd className="font-mono text-xs tabular-nums text-ctp-text">
                      {table.columns}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-ctp-subtext0 sm:sr-only">
                      Rows
                    </dt>
                    <dd
                      className="font-mono text-xs tabular-nums text-ctp-text"
                      title={
                        table.row_count_is_estimate
                          ? "Estimated by PostgreSQL statistics"
                          : "Reported row count"
                      }
                    >
                      {table.rows == null
                        ? "—"
                        : `${table.row_count_is_estimate ? "~" : ""}${table.rows.toLocaleString()}`}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-ctp-subtext0 sm:sr-only">
                      Size
                    </dt>
                    <dd className="font-mono text-xs tabular-nums text-ctp-text">
                      {table.size}
                    </dd>
                  </div>
                </dl>
              </summary>

              <div className="pb-3 pl-5">
                {table.column_details.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-ctp-surface0">
                    <table className="w-full min-w-[560px] text-left">
                      <thead className="bg-ctp-mantle">
                        <tr className="border-b border-ctp-surface0">
                          <th className={tableHead}>Column</th>
                          <th className={tableHead}>PostgreSQL type</th>
                          <th className={tableHead}>Nullable</th>
                          <th className={tableHead}>Key</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-ctp-surface0">
                        {table.column_details.map((column) => (
                          <tr key={column.name}>
                            <td className="px-3 py-2 font-mono text-xs text-ctp-text">
                              {column.name}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-ctp-subtext1">
                              {column.type}
                            </td>
                            <td className="px-3 py-2 text-xs text-ctp-subtext1">
                              {column.nullable ? "Yes" : "No"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {column.primary_key ? (
                                <span className="font-medium text-ctp-mauve">
                                  Primary key
                                </span>
                              ) : (
                                <span className="text-ctp-overlay1">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-ctp-subtext0">
                    Column details are unavailable for this table.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState
          title={search ? "No matching tables" : "No tables reported"}
          description={
            search
              ? "Try another table name or description."
              : "The configured schema has no visible tables or is unavailable."
          }
        />
      )}

      {note && !error && <UnavailableNotice>{note}</UnavailableNotice>}
    </Section>
  );
}
