import { useState } from "react";
import { Printer } from "lucide-react";

import Dialog from "../ui/Dialog";
import Notice from "../ui/Notice";
import { buttonPrimary, buttonSecondary } from "../ui/styles";
import { printStockReport } from "../../lib/stockReport";
import { getErrorMessage } from "./format";

export default function StockReportDialog({
  category,
  search,
  onClose,
}: {
  category: string;
  search: string;
  onClose: () => void;
}) {
  const [includeServices, setIncludeServices] = useState(false);
  const [useFilters, setUseFilters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasFilters = Boolean(category || search.trim());

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await printStockReport({
        includeServices,
        category: useFilters ? category || undefined : undefined,
        search: useFilters ? search : undefined,
      });
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };

  const check = (checked: boolean, set: (v: boolean) => void, label: string, hint: string, disabled = false) => (
    <label className={`flex items-start gap-2.5 text-sm text-ctp-text ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || busy}
        onChange={(event) => set(event.target.checked)}
        className="mt-0.5 size-4 accent-ctp-mauve"
      />
      <span>
        {label}
        <span className="block text-xs text-ctp-subtext0">{hint}</span>
      </span>
    </label>
  );

  return (
    <Dialog
      onClose={busy ? () => {} : onClose}
      title="Print stock report"
      description="Opens the print dialog; choose “Save as PDF” as the destination."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={buttonSecondary}>
            Cancel
          </button>
          <button type="button" onClick={run} disabled={busy} className={buttonPrimary}>
            <Printer size={14} aria-hidden="true" />
            {busy ? "Preparing…" : "Create report"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {check(includeServices, setIncludeServices, "Include services", "Adds a list of active services after the products.")}
        {check(
          useFilters,
          setUseFilters,
          "Only the current filters",
          hasFilters ? "Limit the report to the search and category now applied." : "No search or category filter is applied.",
          !hasFilters,
        )}
        {error && <Notice tone="danger" role="alert" title={error} />}
      </div>
    </Dialog>
  );
}
