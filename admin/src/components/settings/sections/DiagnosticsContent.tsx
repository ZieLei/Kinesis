import { Activity } from "lucide-react";
import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldRenderer from "../FieldRenderer";

export default function DiagnosticsContent({
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
      <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <div className="flex items-start gap-2">
          <Activity size={16} className="mt-0.5 shrink-0 text-ctp-green" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ctp-text">
              Configuration preview
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ctp-subtext0">
                  Log level
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-ctp-blue">
                  {settings.logLevel}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ctp-subtext0">
                  Buffer limit
                </p>
                <p className="mt-1 text-sm font-semibold text-ctp-text">
                  {Number(settings.consoleBufferLines).toLocaleString()} lines
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ctp-subtext0">
                  Status
                </p>
                <p className="mt-1 text-sm font-semibold text-ctp-yellow">
                  Preview only
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
