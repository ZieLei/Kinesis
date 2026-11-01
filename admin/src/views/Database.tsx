
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
      {/* Database header */}
      <DatabaseHeader
        databaseConfigured={db.databaseConfigured}
        connected={db.connected}
        loading={db.loading}
      />

      {/* Database status */}
      <StatusBanner
        adminAuthenticated={true}
        status={db.status}
        loading={db.loading}
        error={db.error}
        schemaError={db.schemaError}
        backupError={db.backupError}
      />

      {/* Summary */}
      <SummaryCards
        status={db.status}
        tableCount={db.schema?.table_count ?? 0}
        backupCount={db.backupCount}
        backupLoading={db.loading}
      />

      {/* Connection information */}
      <ConnectionSection
        status={db.status}
        loading={db.loading}
      />

      {/* Database schema */}
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

      {/* Backups and restoration */}
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

      {/* Read-only SQL query */}
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

      {/* Operation notices */}
      <NoticeBanner
        notice={db.notice}
        onDismiss={db.dismissNotice}
      />

      <SecurityFooter />
    </div>
  );
}
