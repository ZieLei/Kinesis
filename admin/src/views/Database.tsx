import { useDatabaseManagement } from "../hooks/useDatabaseManagement";
import DatabaseHeader from "../components/database/DatabaseHeader";
import StatusBanner from "../components/database/StatusBanner";
import SummaryCards from "../components/database/SummaryCards";
import ConnectionSection from "../components/database/ConnectionSection";
import SchemaSection from "../components/database/SchemaSection";
import BackupSection from "../components/database/BackupSection";
import QuerySection from "../components/database/QuerySection";
import NoticeBanner from "../components/database/NoticeBanner";
import SecurityFooter from "../components/database/SecurityFooter";

export default function Database() {
  const db = useDatabaseManagement();

  return (
    <div className="flex flex-col gap-4">
      <DatabaseHeader
        databaseConfigured={db.databaseConfigured}
        connected={db.connected}
        loading={db.loading}
      />

      <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-line-seed text-sm font-bold text-ctp-text">
              Admin authentication
            </h2>
            <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
              Required to inspect or manage the PostgreSQL database.
            </p>
          </div>

          {db.adminAuthenticated && (
            <button
              type="button"
              onClick={db.disconnectAdmin}
              className="rounded-md border border-ctp-surface1 px-3 py-2 font-line-seed text-xs font-semibold text-ctp-subtext1 transition hover:border-ctp-red/40 hover:text-ctp-red"
            >
              Clear token
            </button>
          )}
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            db.connectAdmin();
          }}
        >
          <input
            type="password"
            value={db.tokenInput}
            onChange={(event) => db.setTokenInput(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Admin API token"
            placeholder="Enter KINESIS_ADMIN_API_TOKEN"
            className="min-w-0 flex-1 rounded-md border border-ctp-surface0 bg-ctp-mantle px-3 py-2 font-line-seed text-sm text-ctp-text outline-none placeholder:text-ctp-overlay1 focus:border-ctp-mauve"
          />

          <button
            type="submit"
            disabled={!db.tokenInput.trim()}
            className="rounded-md bg-ctp-mauve px-4 py-2 font-line-seed text-xs font-bold text-ctp-base transition hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Connect
          </button>

          <button
            type="button"
            onClick={db.refresh}
            disabled={!db.token.trim() || db.refreshing}
            className="rounded-md border border-ctp-surface1 px-4 py-2 font-line-seed text-xs font-semibold text-ctp-text transition hover:border-ctp-blue/50 hover:text-ctp-blue disabled:cursor-not-allowed disabled:opacity-40"
          >
            {db.refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        </form>

        <p className="mt-2 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
          The token is stored only for the current browser-tab session. It is
          not embedded in the frontend build.
        </p>
      </section>

      <StatusBanner
        adminAuthenticated={db.adminAuthenticated}
        status={db.status}
        loading={db.loading}
        error={db.error}
        schemaError={db.schemaError}
        backupError={db.backupError}
      />

      <SummaryCards
        status={db.status}
        tableCount={db.schema?.table_count ?? 0}
        backupCount={db.backupCount}
        backupLoading={db.loading}
      />

      <ConnectionSection
        status={db.status}
        loading={db.loading}
      />

      <SchemaSection
        search={db.search}
        onSearchChange={db.setSearch}
        filteredTables={db.filteredTables}
        totalTables={db.schema?.table_count ?? 0}
        loading={db.loading}
        error={db.schemaError}
        schemaName={db.schema?.schema_name ?? null}
        databaseSize={db.schema?.database_size ?? null}
        note={db.schema?.note ?? ""}
      />

      <BackupSection
        databaseConfigured={db.databaseConfigured}
        databaseConnected={db.connected}
        databaseName={db.status?.database_name ?? ""}
        backupServiceAvailable={db.backupServiceAvailable}
        s3Configured={db.s3Configured}
        backupCount={db.backupCount}
        backups={db.backups}
        backupRetentionDays={db.backupRetentionDays}
        backupLoading={db.loading}
        backupError={db.backupError}
        backupBusy={db.backupBusy}
        restoreBusy={db.restoreBusy}
        maxRestoreUploadBytes={db.maxRestoreUploadBytes}
        fileInputRef={db.fileInputRef}
        selectedFile={db.selectedFile}
        dragging={db.dragging}
        showRestoreConfirm={db.showRestoreConfirm}
        restoreConfirmation={db.restoreConfirmation}
        onRestoreConfirmationChange={db.setRestoreConfirmation}
        onDraggingChange={db.setDragging}
        onFile={db.handleFile}
        onClearFile={db.clearSelectedFile}
        onToggleRestoreConfirm={db.toggleRestoreConfirm}
        onCloseRestoreConfirm={db.closeRestoreConfirm}
        onRequestRestore={db.requestRestore}
        onRequestBackup={db.requestBackup}
        onRequestS3Backup={db.requestS3Backup}
      />

      <QuerySection
        query={db.query}
        queryResult={db.queryResult}
        queryMessage={db.queryMessage}
        queryBusy={db.queryBusy}
        databaseConnected={db.connected}
        queryMaxRows={db.queryMaxRows}
        onQueryChange={db.handleQueryChange}
        onRun={db.runQuery}
      />

      <NoticeBanner
        notice={db.notice}
        onDismiss={db.dismissNotice}
      />

      <SecurityFooter />
    </div>
  );
}
