import { Search } from "lucide-react";

export default function SettingsEmptyState({
  onClear,
}: {
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-ctp-surface0 bg-ctp-mantle px-5 py-12 text-center">
      <Search size={24} className="mx-auto mb-3 text-ctp-subtext0" />
      <h2 className="text-sm font-semibold text-ctp-text">
        No settings found
      </h2>
      <p className="mt-1 text-xs text-ctp-subtext0">
        Search by a section name or topic such as currency, stock, receipt, or network.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-lg bg-ctp-mauve px-3 py-2 text-xs font-semibold text-ctp-base"
      >
        Show all settings
      </button>
    </div>
  );
}
