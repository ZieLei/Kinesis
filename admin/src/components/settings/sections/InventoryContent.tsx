import { CircleAlert, ScanBarcode } from "lucide-react";
import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldRenderer from "../FieldRenderer";

export default function InventoryContent({
  section,
  settings,
  onUpdate,
  skuPreview,
}: {
  section: SectionDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
  skuPreview: string;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {section.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            settings={settings}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      {settings.allowNegativeInventory && (
        <div className="flex items-start gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/5 p-3">
          <CircleAlert size={15} className="mt-0.5 shrink-0 text-ctp-yellow" />
          <p className="text-xs leading-relaxed text-ctp-subtext0">
            Negative stock can hide inventory errors or allow sales of unavailable parts. Log the cashier, reason, and transaction for each exception.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <div className="mb-2 flex items-center gap-2">
          <ScanBarcode size={15} className="text-ctp-mauve" />
          <p className="text-xs font-semibold text-ctp-text">
            Next SKU preview
          </p>
        </div>
        <code className="text-sm font-semibold tracking-wide text-ctp-green">
          {skuPreview}
        </code>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ctp-subtext0">
          Preview only. The backend must generate unique SKUs atomically.
        </p>
      </div>
    </>
  );
}
