import { useEffect, useState } from "react";

import EmptyState from "../ui/EmptyState";
import Notice from "../ui/Notice";
import { tableHead } from "../ui/styles";
import { fetchStockHistory } from "../../lib/adminApi";
import type { StockHistoryEntry } from "../../types/admin";
import {
  REASON_LABEL,
  formatCurrency,
  formatDateTime,
  formatNumber,
  getErrorMessage,
} from "./format";


/** Recent receipts and adjustments for one product. */
export default function StockHistoryTable({ productId }: { productId: number }) {
  const [entries, setEntries] = useState<StockHistoryEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetchStockHistory(productId, controller.signal)
      .then((response) => setEntries(response.items))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(caught));
      });

    return () => controller.abort();
  }, [productId]);

  if (error) {
    return <Notice tone="danger" role="alert" title={`History could not be loaded: ${error}`} />;
  }

  if (entries === null) {
    return <p className="py-6 text-center text-sm text-ctp-subtext0">Loading history…</p>;
  }

  if (entries.length === 0) {
    return <EmptyState title="No stock changes yet" description="Receipts and adjustments appear here." />;
  }

  return (
    <div className="relative overflow-x-auto border-y border-ctp-surface0">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-ctp-surface0">
            <th scope="col" className={`${tableHead} pl-0`}>When</th>
            <th scope="col" className={tableHead}>Change</th>
            <th scope="col" className={`${tableHead} text-right`}>Units</th>
            <th scope="col" className={`${tableHead} pr-0`}>Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ctp-surface0">
          {entries.map((entry) => (
            <tr key={`${entry.type}-${entry.id}`}>
              <td className="py-2 pr-3 text-xs tabular-nums text-ctp-subtext0">
                {formatDateTime(entry.at)}
              </td>
              <td className="px-3 py-2 text-sm text-ctp-text">
                {entry.type === "receipt" ? "Stock received" : REASON_LABEL[entry.reason ?? "other"]}
              </td>
              <td
                className={`px-3 py-2 text-right text-sm font-medium tabular-nums ${entry.quantity_change < 0 ? "text-ctp-red" : "text-ctp-green"}`}
              >
                {entry.quantity_change > 0 ? "+" : "−"}
                {formatNumber(Math.abs(entry.quantity_change))}
              </td>
              <td className="py-2 pl-3 text-xs text-ctp-subtext1">
                {[
                  entry.unit_cost !== null ? `${formatCurrency(entry.unit_cost)} each` : null,
                  entry.stock_before !== null && entry.stock_after !== null
                    ? `${formatNumber(entry.stock_before)} → ${formatNumber(entry.stock_after)}`
                    : null,
                  entry.actor_name ? `by ${entry.actor_name}` : null,
                  entry.note,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
