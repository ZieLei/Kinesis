import { useSettingsManagement } from "../hooks/useSettingsManagement";
import SettingsHeader from "../components/settings/SettingsHeader";
import InfoBanner from "../components/settings/InfoBanner";
import SettingsNav from "../components/settings/SettingsNav";
import SettingsEmptyState from "../components/settings/SettingsEmptyState";
import Section from "../components/settings/Section";
import SectionContent from "../components/settings/SectionContent";
import SaveBar from "../components/settings/SaveBar";

export default function Settings() {
  const s = useSettingsManagement();

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-28 font-line-seed">
      <SettingsHeader />

      <InfoBanner />

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left navigation */}
        <SettingsNav
          search={s.search}
          onSearchChange={s.setSearch}
          filteredSections={s.filteredSections}
          activeSection={s.activeSection}
          onNavigate={s.navigateTo}
        />

        {/* Settings content */}
        <main className="min-w-0 space-y-4">
          {s.filteredSections.length === 0 ? (
            <SettingsEmptyState onClear={() => s.setSearch("")} />
          ) : (
            s.filteredSections.map((section) => (
              <Section
                key={section.id}
                id={section.id}
                icon={section.icon}
                title={section.title}
                description={section.description}
                badge={section.badge}
              >
                <SectionContent
                  section={section}
                  settings={s.settings}
                  onUpdate={s.update}
                  currencyPreview={s.currencyPreview}
                  skuPreview={s.skuPreview}
                />
              </Section>
            ))
          )}
        </main>
      </div>

      {/* Sticky save bar */}
      <SaveBar
        showSaveNotice={s.showSaveNotice}
        noticeMessage={s.noticeMessage}
        hasChanges={s.hasChanges}
        onDiscard={s.restoreSavedSettings}
        onReset={s.resetSettings}
        onSave={s.saveSettings}
      />
    </div>
  );
}
