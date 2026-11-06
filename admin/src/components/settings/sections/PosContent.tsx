import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldList from "../FieldList";
import PreviewRow from "../PreviewRow";

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
    <FieldList
      fields={section.fields}
      settings={settings}
      onUpdate={onUpdate}
    >
      <PreviewRow label="Price format example">{currencyPreview}</PreviewRow>
    </FieldList>
  );
}
