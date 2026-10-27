import { Search, Table2, RefreshCw } from "lucide-react";

import type { TableSchema } from "../../types/database";
import SectionHeading from "./SectionHeading";
import StatusBadge from "./StatusBadge";
import UnavailableNotice from "./UnavailableNotice";
import { inputClass } from "./styles";

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
    <section className="overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-base">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeading
          icon={Table2}
          title="Database schema"
          description="Actual tables, column definitions, estimated row counts, and storage."
        />

        <div className="relative w-full sm:max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ctp-overlay1"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Filter tables"
            placeholder="Filter tables..."
            className={`${inputClass} w-full pl-9`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-ctp-surface0 bg-ctp-mantle px-3 py-2">
        <p className="font-line-seed text-[11px] text-ctp-subtext0">
          {schemaName ? `Schema: ${schemaName}` : "Schema not loaded"}
          <span className="px-2">·</span>
          {filteredTables.length} of {totalTables} table(s)
          {databaseSize ? ` · Database size: ${databaseSize}` : ""}
        </p>

        <StatusBadge
          label={error ? "INSPECTION FAILED" : loading ? "LOADING" : "LIVE DATA"}
          tone={error ? "red" : loading ? "yellow" : "green"}
        />
      </div>

      {error ? (
        <div className="p-3">
          <UnavailableNotice>
            Table inspection failed: {error}
          </UnavailableNotice>
        </div>
      ) : loading && totalTables === 0 ? (
        <div className="flex items-center justify-center gap-2 px-4 py-10 font-line-seed text-xs text-ctp-subtext0">
          <RefreshCw size={15} className="animate-spin" />
          Loading database schema…
        </div>
      ) : filteredTables.length > 0 ? (
        <div className="divide-y divide-ctp-surface0">
          {filteredTables.map((table) => (
            <details key={table.name} className="group">
              <summary className="flex cursor-pointer list-none flex-col gap-3 px-3 py-3 transition-colors hover:bg-ctp-surface0/20 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
                    <Table2 size={15} />
                  </div>

                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs font-semibold text-ctp-text">
                      {table.name}
                    </p>
                    <p className="mt-0.5 font-line-seed text-[11px] text-ctp-subtext0">
                      {table.description}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:w-[260px] sm:shrink-0">
                  <div>
                    <p className="font-line-seed text-[10px] text-ctp-subtext0">
                      Columns
                    </p>
                    <p className="mt-1 font-mono text-xs text-ctp-text">
                      {table.columns}
                    </p>
                  </div>

                  <div>
                    <p className="font-line-seed text-[10px] text-ctp-subtext0">
                      Rows
                    </p>
                    <p
                      className="mt-1 font-mono text-xs text-ctp-text"
                      title={
                        table.row_count_is_estimate
                          ? "Estimated by PostgreSQL statistics"
                          : "Reported row count"
                      }
                    >
                      {table.rows == null
                        ? "—"
                        : `${table.row_count_is_estimate ? "~" : ""}${table.rows.toLocaleString()}`}
                    </p>
                  </div>

                  <div>
                    <p className="font-line-seed text-[10px] text-ctp-subtext0">
                      Size
                    </p>
                    <p className="mt-1 font-mono text-xs text-ctp-text">
                      {table.size}
                    </p>
                  </div>
                </div>
              </summary>

              <div className="border-t border-ctp-surface0 bg-ctp-mantle p-3">
                {table.column_details.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-ctp-surface0">
                    <table className="w-full min-w-[560px] text-left">
                      <thead className="bg-ctp-crust">
                        <tr className="border-b border-ctp-surface0">
                          <th className="px-3 py-2 font-line-seed text-[11px] font-semibold text-ctp-subtext0">
                            Column
                          </th>
                          <th className="px-3 py-2 font-line-seed text-[11px] font-semibold text-ctp-subtext0">
                            PostgreSQL type
                          </th>
                          <th className="px-3 py-2 font-line-seed text-[11px] font-semibold text-ctp-subtext0">
                            Nullable
                          </th>
                          <th className="px-3 py-2 font-line-seed text-[11px] font-semibold text-ctp-subtext0">
                            Key
                          </th>
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
                            <td className="px-3 py-2 font-line-seed text-xs text-ctp-subtext1">
                              {column.nullable ? "Yes" : "No"}
                            </td>
                            <td className="px-3 py-2">
                              {column.primary_key ? (
                                <StatusBadge label="PRIMARY KEY" tone="blue" />
                              ) : (
                                <span className="font-line-seed text-xs text-ctp-overlay1">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="font-line-seed text-xs text-ctp-subtext0">
                    Column details are unavailable for this table.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <Table2 size={22} className="mx-auto text-ctp-overlay1" />
          <p className="mt-2 font-line-seed text-sm font-semibold text-ctp-text">
            {search ? "No matching tables" : "No tables reported"}
          </p>
          <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
            {search
              ? "Try another table name or description."
              : "The configured schema has no visible tables or is unavailable."}
          </p>
        </div>
      )}

      {note && !error && (
        <div className="border-t border-ctp-surface0 p-3">
          <UnavailableNotice>{note}</UnavailableNotice>
        </div>
      )}
    </section>
  );
}
