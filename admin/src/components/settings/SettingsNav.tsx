import { Search, X } from "lucide-react";
import type { SectionDefinition } from "../../types/settings";
import { inputClass } from "./styles";

export default function SettingsNav({
  search,
  onSearchChange,
  filteredSections,
  activeSection,
  onNavigate,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filteredSections: SectionDefinition[];
  activeSection: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 lg:sticky lg:top-4">
      <div className="rounded-xl border border-ctp-surface0 bg-ctp-mantle p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-ctp-text">SETTINGS</p>
          <span className="text-[10px] text-ctp-subtext0">
            {filteredSections.length} sections
          </span>
        </div>

        <div className="relative mb-3">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ctp-subtext0"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search settings..."
            aria-label="Search settings sections"
            className={`${inputClass} pl-9 pr-8 text-xs`}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ctp-subtext0 hover:text-ctp-text"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onNavigate(section.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition lg:w-full ${active
                  ? "bg-ctp-mauve/15 font-semibold text-ctp-mauve"
                  : "text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
                  }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="whitespace-nowrap lg:whitespace-normal">
                  {section.title}
                </span>
              </button>
            );
          })}
        </nav>

        {filteredSections.length === 0 && (
          <div className="rounded-lg bg-ctp-base px-3 py-4 text-center">
            <Search size={18} className="mx-auto mb-2 text-ctp-subtext0" />
            <p className="text-xs font-medium text-ctp-text">
              No matching sections
            </p>
            <p className="mt-1 text-[11px] text-ctp-subtext0">
              Try another keyword.
            </p>
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="mt-3 text-xs font-medium text-ctp-mauve hover:underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
