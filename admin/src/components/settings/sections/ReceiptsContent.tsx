import { Printer } from "lucide-react";
import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldRenderer from "../FieldRenderer";

export default function ReceiptsContent({
  section,
  settings,
  onUpdate,
  currencyPreview,
}: {
  section: SectionDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
  currencyPreview: string;
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
      <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <div className="mb-3 flex items-center gap-2">
          <Printer size={15} className="text-ctp-mauve" />
          <p className="text-xs font-semibold text-ctp-text">
            Receipt preview
          </p>
        </div>
        <div className="mx-auto max-w-xs border border-dashed border-ctp-surface1 bg-ctp-mantle p-4 text-center">
          <p className="whitespace-pre-wrap text-xs font-bold text-ctp-text">
            {settings.receiptHeader || "STORE NAME"}
          </p>
          <div className="my-3 border-t border-dashed border-ctp-surface1" />
          <div className="space-y-2 text-left text-[11px] text-ctp-subtext0">
            <div className="flex justify-between gap-3">
              <span>Sample motorcycle part</span>
              <span className="shrink-0">{currencyPreview}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax rate</span>
              <span>{settings.taxRate || "0"}%</span>
            </div>
          </div>
          <div className="my-3 border-t border-dashed border-ctp-surface1" />
          <p className="whitespace-pre-wrap text-[11px] text-ctp-text">
            {settings.receiptFooter}
          </p>
          {settings.receiptNotes && (
            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-ctp-subtext0">
              {settings.receiptNotes}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
