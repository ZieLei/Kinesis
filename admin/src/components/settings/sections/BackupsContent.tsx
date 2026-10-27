import { Clock, Database } from "lucide-react";
import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldRenderer from "../FieldRenderer";

export default function BackupsContent({
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
      {section.fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          settings={settings}
          onUpdate={onUpdate}
        />
      ))}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Database size={15} className="text-ctp-mauve" />
            <p className="text-xs font-medium text-ctp-text">
              Backup destination
            </p>
          </div>
          <p className="text-xs leading-relaxed text-ctp-subtext0">
            Local server storage. The backend must configure the path, retention, and integrity checks.
          </p>
        </div>
        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Clock size={15} className="text-ctp-mauve" />
            <p className="text-xs font-medium text-ctp-text">
              Backup status
            </p>
          </div>
          <p className="text-xs leading-relaxed text-ctp-subtext0">
            <span className="font-medium text-ctp-yellow">
              Not configured
            </span>
            {" "}— changing the schedule does not create a backup yet.
          </p>
        </div>
      </div>
    </>
  );
}
