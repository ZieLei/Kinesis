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
  // These stored values are not applied to the running server (see the
  // field notes), so no warning is derived from them here.
  return (
    <>
      <Notice tone="info" role="note" title="Set by the deployment">
        The backend's bind address, port and allowed browser origins come
        from its startup command or service definition and its environment
        file (kinesis.env). Changing them here has no effect.
      </Notice>

      <FieldList
        fields={section.fields}
        settings={settings}
        onUpdate={onUpdate}
      />
    </>
  );
}
