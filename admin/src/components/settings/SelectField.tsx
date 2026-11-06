import { ChevronDown } from "lucide-react";
import type { Option } from "../../types/settings";
import { selectClass } from "./styles";

export default function SelectField({
  id,
  value,
  onChange,
  options,
  disabled = false,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-describedby={describedBy}
        className={`${selectClass} ${disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ctp-subtext0"
      />
    </div>
  );
}
