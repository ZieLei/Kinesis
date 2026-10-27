import {
  CircleAlert,
  FileCode2,
  Play,
  Table2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import type { QueryResult } from "../../types/database";
import SectionHeading from "./SectionHeading";
import StatusBadge from "./StatusBadge";

export default function QuerySection({
  query,
  queryResult,
  queryMessage,
  queryBusy,
  databaseConnected,
  queryMaxRows,
  onQueryChange,
  onRun,
}: {
  query: string;
  queryResult: QueryResult | null;
  queryMessage: string;
  queryBusy: boolean;
  databaseConnected: boolean;
  queryMaxRows: number;
  onQueryChange: (value: string) => void;
  onRun: () => void | Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-base">
      <div className="flex flex-col gap-3 border-b border-ctp-surface0 p-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeading
          icon={FileCode2}
          title="SQL query"
          description="Execute a bounded, read-only SELECT query."
        />

        <StatusBadge
          label="READ-ONLY"
          tone={databaseConnected ? "green" : "yellow"}
        />
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-md border border-ctp-surface0 bg-ctp-crust">
          <div className="flex items-center justify-between border-b border-ctp-surface0 bg-ctp-mantle px-3 py-2">
            <span className="font-mono text-[11px] text-ctp-subtext0">
              query.sql
            </span>
            <span className="font-mono text-[10px] text-ctp-overlay1">
              PostgreSQL
            </span>
          </div>

          <textarea
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            spellCheck={false}
            maxLength={10_000}
            rows={6}
            aria-label="SQL query editor"
            placeholder="SELECT id, name, stock FROM products LIMIT 50"
            disabled={!databaseConnected || queryBusy}
            className="w-full resize-y bg-transparent p-3 font-mono text-xs leading-6 text-ctp-text outline-none placeholder:text-ctp-overlay1 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="flex flex-col justify-between gap-2 border-t border-ctp-surface0 bg-ctp-mantle p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-start gap-2">
              <ShieldCheck
                size={14}
                className="mt-0.5 shrink-0 text-ctp-green"
              />
              <p className="font-line-seed text-[11px] leading-5 text-ctp-subtext0">
                SELECT only. The backend enforces a read-only transaction,
                execution timeout, and a maximum of {queryMaxRows} returned
                rows.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void onRun()}
              disabled={!databaseConnected || queryBusy || !query.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-ctp-mauve px-3 py-2 font-line-seed text-xs font-bold text-ctp-base transition hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {queryBusy ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              {queryBusy ? "Running…" : "Run query"}
            </button>
          </div>
        </div>

        {queryMessage && (
          <div
            role="status"
            className={`mt-3 flex items-start gap-2 rounded-md border p-3 ${queryResult
                ? "border-ctp-green/20 bg-ctp-green/5"
                : queryBusy
                  ? "border-ctp-blue/20 bg-ctp-blue/5"
                  : "border-ctp-yellow/20 bg-ctp-yellow/5"
              }`}
          >
            {queryResult ? (
              <ShieldCheck
                size={15}
                className="mt-0.5 shrink-0 text-ctp-green"
              />
            ) : queryBusy ? (
              <RefreshCw
                size={15}
                className="mt-0.5 shrink-0 animate-spin text-ctp-blue"
              />
            ) : (
              <CircleAlert
                size={15}
                className="mt-0.5 shrink-0 text-ctp-yellow"
              />
            )}

            <p className="break-words font-line-seed text-xs leading-5 text-ctp-subtext1">
              {queryMessage}
            </p>
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-md border border-ctp-surface0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ctp-surface0 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Table2 size={15} className="text-ctp-blue" />
              <h3 className="font-line-seed text-xs font-bold text-ctp-text">
                Results
              </h3>
              {queryResult?.truncated && (
                <StatusBadge label="TRUNCATED" tone="yellow" />
              )}
            </div>

            <span className="font-line-seed text-[11px] text-ctp-subtext0">
              {queryResult
                ? `${queryResult.row_count} row(s)`
                : "No results"}
            </span>
          </div>

          {queryResult && queryResult.columns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left">
                <thead className="bg-ctp-mantle">
                  <tr className="border-b border-ctp-surface0">
                    {queryResult.columns.map((column) => (
                      <th
                        key={column}
                        className="px-3 py-2 font-mono text-xs font-semibold text-ctp-mauve"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-ctp-surface0">
                  {queryResult.rows.map((row, index) => (
                    <tr key={index} className="hover:bg-ctp-surface0/20">
                      {queryResult.columns.map((column) => {
                        const value = row[column];

                        return (
                          <td
                            key={column}
                            className="max-w-[420px] whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-ctp-text"
                          >
                            {value === null ? (
                              <span className="text-ctp-overlay1">NULL</span>
                            ) : (
                              String(value)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <Table2 size={22} className="text-ctp-overlay1" />
              <p className="mt-2 font-line-seed text-xs font-semibold text-ctp-text">
                No results to display
              </p>
              <p className="mt-1 max-w-sm font-line-seed text-[11px] leading-5 text-ctp-subtext0">
                Connect to the database and run a supported SELECT query to
                display returned rows.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
