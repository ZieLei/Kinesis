import { useSettingsManagement } from "../hooks/useSettingsManagement";
import SettingsHeader from "../components/settings/SettingsHeader";
import SettingsNav from "../components/settings/SettingsNav";
import SettingsEmptyState from "../components/settings/SettingsEmptyState";
import Section from "../components/settings/Section";
import SectionContent from "../components/settings/SectionContent";
import SaveBar from "../components/settings/SaveBar";
import Notice from "../components/settings/Notice";
import { buttonSecondary } from "../components/settings/styles";

export default function Settings() {
  const s = useSettingsManagement();

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24 font-line-seed">
      <SettingsHeader />

      {s.isLoading ? (
        <p role="status" className="py-6 text-sm text-ctp-subtext1">
          Loading settings…
        </p>
      ) : s.loadError ? (
        <Notice
          tone="danger"
          role="alert"
          title="Could not load settings"
          action={
            <button
              type="button"
              onClick={s.reloadSettings}
              className={buttonSecondary}
            >
              Retry
            </button>
          }
        >
          {s.loadError}
        </Notice>
      ) : (
        <>
          {s.hasServerConflict && (
            <div className="mb-6">
              <Notice
                tone="warning"
                role="alert"
                title="Settings were changed elsewhere"
                action={
                  <button
                    type="button"
                    onClick={s.reloadSettings}
                    className={buttonSecondary}
                  >
                    Reload settings
                  </button>
                }
              >
                The server has a newer version. Reload before saving again to
                avoid overwriting someone else's changes.
              </Notice>
            </div>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
            <SettingsNav
              search={s.search}
              onSearchChange={s.setSearch}
              filteredSections={s.filteredSections}
              activeSection={s.activeSection}
              onNavigate={s.navigateTo}
            />

            <main className="min-w-0 max-w-4xl space-y-10">
              {s.filteredSections.length === 0 ? (
                <SettingsEmptyState onClear={() => s.setSearch("")} />
              ) : (
                s.filteredSections.map((section) => (
                  <Section
                    key={section.id}
                    id={section.id}
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
                      version={s.version}
                      isUploadingGcashQr={s.isUploadingGcashQr}
                      gcashQrError={s.gcashQrError}
                      gcashQrNotice={s.gcashQrNotice}
                      onUploadGcashQr={s.uploadGcashQr}
                      onRemoveGcashQr={s.removeGcashQr}
                      onGcashAccountsChanged={s.applyGcashAccountsResponse}
                    />
                  </Section>
                ))
              )}
            </main>
          </div>

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
