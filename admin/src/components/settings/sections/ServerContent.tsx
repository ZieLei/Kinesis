import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldList from "../FieldList";
import Notice from "../Notice";

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
      <FieldList
        fields={section.fields}
        settings={settings}
        onUpdate={onUpdate}
      />

      {settings.listenAddress === "0.0.0.0" && (
        <Notice
          tone="warning"
          role="note"
          title="Listening on all network interfaces"
        >
          Other devices on the network can reach this server. Allow access
          only from trusted devices.
        </Notice>
      )}
    </>
  );
}
