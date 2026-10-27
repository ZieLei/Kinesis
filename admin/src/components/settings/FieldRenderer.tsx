import type {
  FieldDefinition,
  SettingsState,
  UpdateSetting,
} from "../../types/settings";
import Field from "./Field";
import SelectField from "./SelectField";
import { inputClass } from "./styles";

export default function FieldRenderer({
  field,
  settings,
  onUpdate,
}: {
  field: FieldDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
}) {
  const rawValue = settings[field.key];
  const value =
    typeof rawValue === "boolean" ? String(rawValue) : String(rawValue);
  const disabled = field.disabled?.(settings) ?? false;

  const handleChange = (nextValue: string) => {
    const finalValue = field.transform
      ? field.transform(nextValue)
      : nextValue;

    if (
      field.key === "allowNegativeInventory" ||
      field.key === "digitalReceipts" ||
      field.key === "supervisorPinForDiscounts" ||
      field.key === "allowCustomLineItems" ||
      field.key === "skuIncludeYear"
    ) {
      onUpdate(field.key, (finalValue === "true") as never);
      return;
    }

    if (field.key === "currencyPlacement") {
      onUpdate(
        field.key,
        finalValue as SettingsState["currencyPlacement"],
      );
      return;
    }

    if (field.key === "receiptOutput") {
      onUpdate(field.key, finalValue as SettingsState["receiptOutput"]);
      return;
    }

    onUpdate(field.key, finalValue as never);
  };

  return (
    <Field label={field.label} description={field.description}>
      {field.type === "select" ? (
        <SelectField
          value={value}
          onChange={handleChange}
          options={field.options ?? []}
          disabled={disabled}
        />
      ) : field.type === "textarea" ? (
        <textarea
          className={`${inputClass} resize-y`}
          value={value}
          rows={field.rows ?? 2}
          maxLength={
            field.key === "receiptNotes"
              ? 1000
              : field.key === "corsOrigins"
                ? undefined
                : 500
          }
          onChange={(event) => handleChange(event.target.value)}
          disabled={disabled}
        />
      ) : (
        <div className="relative">
          <input
            className={`${inputClass} ${field.suffix ? "pr-16" : ""}`}
            type={field.type === "number" ? "number" : "text"}
            value={value}
            min={field.min}
            max={field.max}
            step={field.step}
            maxLength={field.key === "skuPrefix" ? 12 : undefined}
            onChange={(event) => handleChange(event.target.value)}
            disabled={disabled}
            placeholder={field.key === "skuPrefix" ? "KNS" : undefined}
          />
          {field.suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ctp-subtext0">
              {field.suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
