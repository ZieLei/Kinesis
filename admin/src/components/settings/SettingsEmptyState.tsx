import { buttonSecondary } from "./styles";

export default function SettingsEmptyState({
  onClear,
}: {
  onClear: () => void;
}) {
  return (
    <div className="border-y border-ctp-surface0 py-10">
      <h2 className="text-sm font-semibold text-ctp-text">
        No settings found
      </h2>
      <p className="mt-1 text-xs text-ctp-subtext0">
        Try a section name or topic such as currency, stock, receipt, or
        network.
      </p>
      <button
        type="button"
        onClick={onClear}
        className={`${buttonSecondary} mt-4`}
      >
        Clear search
      </button>
    </div>
  );
}
