import { LockKeyhole } from "lucide-react";
import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldRenderer from "../FieldRenderer";

export default function PermissionsContent({
  section,
  settings,
  onUpdate,
}: {
  section: SectionDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
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
      <div className="flex items-start gap-2 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 p-3">
        <LockKeyhole size={15} className="mt-0.5 shrink-0 text-ctp-blue" />
        <p className="text-xs leading-relaxed text-ctp-subtext0">
          The backend must enforce discount limits and authorization. UI settings alone cannot secure sales actions.
        </p>
      </div>
    </>
  );
}
