import { Play, RefreshCw } from "lucide-react";

import type { QueryResult } from "../../types/database";
import Section, { Badge } from "../ui/Section";
import Notice from "../ui/Notice";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "./StatusBadge";
import { buttonPrimary, tableHead } from "../ui/styles";

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
    <Section
      id="db-query"
      title="SQL query"
      description="Execute a bounded, read-only SELECT query."
      actions={
        <StatusBadge
          label="Read-only"
          tone={databaseConnected ? "green" : "yellow"}
        />
      }
      bodyClassName="space-y-4"
    >
      <div className="overflow-hidden rounded-md border border-ctp-surface1 bg-ctp-mantle focus-within:border-ctp-mauve focus-within:ring-1 focus-within:ring-ctp-mauve">
        <div className="flex items-center justify-between border-b border-ctp-surface0 px-3 py-1.5 font-mono text-xs text-ctp-subtext0">
          <span>query.sql</span>
          <span className="text-ctp-overlay1">PostgreSQL</span>
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
          className="block w-full resize-y bg-transparent p-3 font-mono text-xs leading-6 text-ctp-text outline-none placeholder:text-ctp-overlay1 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex flex-col justify-between gap-3 border-t border-ctp-surface0 px-3 py-2 sm:flex-row sm:items-center">
          <p className="text-xs leading-relaxed text-ctp-subtext0">
            SELECT only. The backend enforces a read-only transaction,
            execution timeout, and a maximum of {queryMaxRows} returned rows.
          </p>

          <button
            type="button"
            onClick={() => void onRun()}
            disabled={!databaseConnected || queryBusy || !query.trim()}
            className={buttonPrimary}
          >
            {queryBusy ? (
              <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
            {queryBusy ? "Running…" : "Run query"}
          </button>
        </div>
      </div>

      {queryMessage && (
        <Notice
          role="status"
          tone={queryResult ? "success" : queryBusy ? "info" : "warning"}
        >
          {queryMessage}
        </Notice>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-ctp-text">Results</h3>
            {queryResult?.truncated && <Badge tone="warning">Truncated</Badge>}
          </div>

          <span className="text-xs tabular-nums text-ctp-subtext0">
            {queryResult ? `${queryResult.row_count} row(s)` : "No results"}
          </span>
        </div>

        {queryResult && queryResult.columns.length > 0 ? (
          <div className="overflow-x-auto border-y border-ctp-surface0">
            <table className="w-full min-w-max text-left">
              <thead>
                <tr className="border-b border-ctp-surface0">
                  {queryResult.columns.map((column) => (
                    <th key={column} className={`${tableHead} font-mono`}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-ctp-surface0">
                {queryResult.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-ctp-surface0/30">
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
          <EmptyState
            title="No results to display"
            description="Connect to the database and run a supported SELECT query to display returned rows."
          />
        )}
      </div>
    </Section>
  );
}
