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

      {s.isLoading ? (
        <div
          className="mt-4 rounded-xl border border-ctp-surface1 bg-ctp-mantle px-4 py-6 text-sm text-ctp-subtext1"
          role="status"
        >
          Loading saved settings from the Kinesis backend...
        </div>
      ) : s.loadError ? (
        <div
          className="mt-4 rounded-xl border border-ctp-red/30 bg-ctp-red/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-ctp-red">
            Could not load application settings.
          </p>

          <p className="mt-1 break-words text-sm text-ctp-subtext1">
            {s.loadError}
          </p>

          <button
            type="button"
            onClick={s.reloadSettings}
            className="mt-3 rounded-lg border border-ctp-surface1 px-3 py-2 text-sm text-ctp-text transition hover:bg-ctp-surface0"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {s.hasServerConflict && (
            <div
              className="mt-4 flex flex-col gap-3 rounded-xl border border-ctp-yellow/30 bg-ctp-yellow/5 p-4 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <div>
                <p className="text-sm font-medium text-ctp-yellow">
                  Settings conflict detected
                </p>

                <p className="mt-1 text-sm text-ctp-subtext1">
                  The server has a newer version. Reload it before making
                  another save to avoid overwriting someone else's changes.
                </p>
              </div>

              <button
                type="button"
                onClick={s.reloadSettings}
                className="shrink-0 rounded-lg border border-ctp-surface1 px-3 py-2 text-sm text-ctp-text transition hover:bg-ctp-surface0"
              >
                Reload server settings
              </button>
            </div>
          )}

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
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
        </>
      )}
    </div>
  );
}
