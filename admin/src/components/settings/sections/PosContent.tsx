import { PhilippinePeso } from "lucide-react";
import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldRenderer from "../FieldRenderer";

export default function PosContent({
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs text-ctp-subtext0">
          <PhilippinePeso size={15} />
          Formatting preview
        </div>
        <span className="text-base font-semibold tabular-nums text-ctp-green">
          {currencyPreview}
        </span>
      </div>
    </>
  );
}
