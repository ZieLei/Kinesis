import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldList from "../FieldList";
import Notice from "../Notice";

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
      <Notice
        tone="warning"
        role="note"
        title="Automatic backups are not available"
      >
        Kinesis only creates a backup when you click Create and download on
        the Database page. Make backups regularly and keep a copy on another
        device, such as a USB drive. See docs/deployment/BACKUPS.md for
        details.
      </Notice>

      <FieldList
        fields={section.fields}
        settings={settings}
        onUpdate={onUpdate}
      />
    </>
  );
}
