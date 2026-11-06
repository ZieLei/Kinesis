import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";
import FieldList from "../FieldList";
import Notice from "../Notice";
import PreviewRow from "../PreviewRow";

export default function InventoryContent({
  section,
  settings,
  onUpdate,
  skuPreview,
}: {
  section: SectionDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
  skuPreview: string;
}) {
  return (
    <>
      <FieldList
        fields={section.fields}
        settings={settings}
        onUpdate={onUpdate}
      >
        <PreviewRow label="SKU example">
          <code className="font-mono tracking-wide">{skuPreview}</code>
        </PreviewRow>
      </FieldList>

      {settings.allowNegativeInventory && (
        <Notice tone="warning" title="Negative stock is allowed">
          Sales can go through for items with no stock on hand. This can hide
          inventory errors, so review stock counts regularly.
        </Notice>
      )}
    </>
  );
}
