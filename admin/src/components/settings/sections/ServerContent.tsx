import { CircleAlert, Network } from "lucide-react";
import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldRenderer from "../FieldRenderer";

export default function ServerContent({
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
      <div className="flex items-start gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/5 p-3">
        <CircleAlert size={15} className="mt-0.5 shrink-0 text-ctp-yellow" />
        <p className="text-xs leading-relaxed text-ctp-subtext0">
          These values are previews. Validate them on the server and apply network changes through a controlled restart.
        </p>
      </div>
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
      {settings.listenAddress === "0.0.0.0" && (
        <div className="flex items-start gap-2 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 p-3">
          <Network size={15} className="mt-0.5 shrink-0 text-ctp-blue" />
          <p className="text-xs leading-relaxed text-ctp-subtext0">
            Binding to all interfaces may expose the API to other devices on the network. Restrict access to trusted devices and protect administrative routes.
          </p>
        </div>
      )}
    </>
  );
}
