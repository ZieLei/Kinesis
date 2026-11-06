import type { ReactNode } from "react";
import type {
  FieldDefinition,
  SettingsState,
  UpdateSetting,
} from "../../types/settings";
import FieldRenderer from "./FieldRenderer";

export default function FieldList({
  fields,
  settings,
  onUpdate,
  children,
}: {
  fields: readonly FieldDefinition[];
  settings: SettingsState;
  onUpdate: UpdateSetting;
  children?: ReactNode;
}) {
  return (
    <div className="divide-y divide-ctp-surface0 border-y border-ctp-surface0">
      {fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          settings={settings}
          onUpdate={onUpdate}
        />
      ))}
      {children}
    </div>
  );
}
