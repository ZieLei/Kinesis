import type { SectionDefinition } from "../../types/settings";
import { inputClass, navFocusRing } from "./styles";

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
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search settings"
        aria-label="Search settings"
        className={`${inputClass} mb-3`}
      />

      <nav
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto border-b border-ctp-surface0 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-b-0 lg:border-l"
      >
        {filteredSections.map((section) => {
          const active = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onNavigate(section.id)}
              aria-current={active ? "true" : undefined}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-left text-sm transition lg:mb-0 lg:-ml-px lg:w-full lg:whitespace-normal lg:border-b-0 lg:border-l-2 ${navFocusRing} ${active
                  ? "border-ctp-mauve font-medium text-ctp-text"
                  : "border-transparent text-ctp-subtext1 hover:text-ctp-text"
                }`}
            >
              {section.title}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
