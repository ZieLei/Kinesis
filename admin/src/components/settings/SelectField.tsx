import { ChevronDown } from "lucide-react";
import type { Option } from "../../types/settings";
import { selectClass } from "./styles";

export default function SelectField({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
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
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ctp-subtext0"
      />
    </div>
  );
}
