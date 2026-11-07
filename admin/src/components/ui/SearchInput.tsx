import { Search, X } from "lucide-react";
import { inputClass } from "./styles";

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  label,
  className = "",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ctp-overlay1"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${inputClass} pl-8 ${value ? "pr-8" : ""} [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ctp-subtext0 transition hover:bg-ctp-surface0 hover:text-ctp-text"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
