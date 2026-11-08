import { useId } from "react";
import type {
  FieldDefinition,
  SettingsState,
  UpdateSetting,
} from "../../types/settings";
import Field from "./Field";
import SelectField from "./SelectField";
import { inputClass } from "./styles";

const BOOLEAN_KEYS = new Set<string>([
  "allowNegativeInventory",
  "digitalReceipts",
  "supervisorPinForDiscounts",
  "allowCustomLineItems",
  "skuIncludeYear",
]);

export default function FieldRenderer({
  field,
  settings,
  onUpdate,
}: {
  field: FieldDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
}) {
  const id = useId();
  const notInEffectId = field.notInEffect ? `${id}-not-in-effect` : undefined;
  const describedIds = [
    field.description ? `${id}-description` : undefined,
    notInEffectId,
  ].filter(Boolean);
  const descriptionId = describedIds.length ? describedIds.join(" ") : undefined;

  const value = String(settings[field.key]);
  // Settings that nothing acts on are read-only so the page does not
  // suggest that changing them has an effect. The stored value is kept.
  const disabled =
    Boolean(field.notInEffect) || (field.disabled?.(settings) ?? false);

  const handleChange = (nextValue: string) => {
    const finalValue = field.transform
      ? field.transform(nextValue)
      : nextValue;

    if (BOOLEAN_KEYS.has(field.key)) {
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

  const isTextarea = field.type === "textarea";

  return (
    <Field
      label={field.label}
      description={field.description}
      htmlFor={id}
      descriptionId={field.description ? `${id}-description` : undefined}
      notInEffect={field.notInEffect}
      notInEffectId={notInEffectId}
      stacked={isTextarea}
    >
      {field.type === "select" ? (
        <SelectField
          id={id}
          describedBy={descriptionId}
          value={value}
          onChange={handleChange}
          options={field.options ?? []}
          disabled={disabled}
        />
      ) : isTextarea ? (
        <textarea
          id={id}
          aria-describedby={descriptionId}
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
            id={id}
            aria-describedby={descriptionId}
            className={`${inputClass} ${field.suffix ? "pr-14" : ""} ${field.type === "number" ? "tabular-nums" : ""
              }`}
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
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ctp-subtext0">
              {field.suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
