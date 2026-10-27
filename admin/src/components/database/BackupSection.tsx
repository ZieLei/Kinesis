import type { RefObject } from "react";
import {
  HardDrive,
  Download,
  Upload,
  Cloud,
  RefreshCw,
  FileArchive,
  ChevronRight,
  CircleAlert,
  X,
  ShieldCheck,
  Clock,
} from "lucide-react";

import { formatFileSize } from "../../lib/formatFileSize";
import type {
  BackupFormat,
  BackupMetadata,
} from "../../types/database";
import SectionHeading from "./SectionHeading";
import StatusBadge from "./StatusBadge";
import UnavailableNotice from "./UnavailableNotice";
import { actionClass, inputClass } from "./styles";

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BackupSection({
  databaseConfigured,
  databaseConnected,
  databaseName,
  backupServiceAvailable,
  s3Configured,
  backupCount,
  backups,
  backupRetentionDays,
  backupLoading,
  backupError,
  backupBusy,
  restoreBusy,
  maxRestoreUploadBytes,
  fileInputRef,
  selectedFile,
  dragging,
  showRestoreConfirm,
  restoreConfirmation,
  onRestoreConfirmationChange,
  onDraggingChange,
  onFile,
  onClearFile,
  onToggleRestoreConfirm,
  onCloseRestoreConfirm,
  onRequestRestore,
  onRequestBackup,
  onRequestS3Backup,
}: {
  databaseConfigured: boolean;
  databaseConnected: boolean;
  databaseName: string;
  backupServiceAvailable: boolean;
  s3Configured: boolean;
  backupCount: number;
  backups: BackupMetadata[];
  backupRetentionDays: number;
  backupLoading: boolean;
  backupError: string;
  backupBusy: BackupFormat | null;
  restoreBusy: boolean;
  maxRestoreUploadBytes: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  dragging: boolean;
  showRestoreConfirm: boolean;
  restoreConfirmation: string;
  onRestoreConfirmationChange: (value: string) => void;
  onDraggingChange: (value: boolean) => void;
  onFile: (file: File | undefined) => void;
  onClearFile: () => void;
  onToggleRestoreConfirm: () => void;
  onCloseRestoreConfirm: () => void;
  onRequestRestore: () => void;
  onRequestBackup: (format: BackupFormat) => void;
  onRequestS3Backup: () => void;
}) {
  const backupDisabled =
    !databaseConfigured ||
    !databaseConnected ||
    !backupServiceAvailable ||
    backupBusy !== null;

  const restoreDisabled =
    !selectedFile ||
    !databaseConnected ||
    !backupServiceAvailable ||
    restoreBusy;

  return (
    <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3 sm:p-4">
      <SectionHeading
        icon={HardDrive}
        title="Backup & restore"
        description="Create downloadable PostgreSQL backups and restore a trusted archive."
      />

      <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
        <div className="flex flex-col rounded-md border border-ctp-surface0 p-3">
          <div className="flex items-center gap-2">
            <FileArchive size={17} className="text-ctp-blue" />
            <h3 className="font-line-seed text-xs font-bold text-ctp-text">
              PostgreSQL backup
            </h3>
          </div>

          <p className="mt-2 flex-1 font-line-seed text-xs leading-5 text-ctp-subtext0">
            Create a PostgreSQL custom-format archive and download it to this
            browser. This format is suitable for pg_restore.
          </p>

          <button
            type="button"
            onClick={() => onRequestBackup("custom")}
            disabled={backupDisabled}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-ctp-blue/10 px-3 py-2 font-line-seed text-xs font-semibold text-ctp-blue hover:bg-ctp-blue/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {backupBusy === "custom" ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {backupBusy === "custom" ? "Creating backup…" : "Create and download"}
          </button>
        </div>

        <div className="flex flex-col rounded-md border border-ctp-surface0 p-3">
          <div className="flex items-center gap-2">
            <Download size={17} className="text-ctp-green" />
            <h3 className="font-line-seed text-xs font-bold text-ctp-text">
              Plain SQL export
            </h3>
          </div>

          <p className="mt-2 flex-1 font-line-seed text-xs leading-5 text-ctp-subtext0">
            Create a plain SQL dump for inspection or migration. This export
            is not accepted by the custom-format restore endpoint.
          </p>

          <button
            type="button"
            onClick={() => onRequestBackup("sql")}
            disabled={backupDisabled}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-ctp-surface1 px-3 py-2 font-line-seed text-xs font-semibold text-ctp-text hover:border-ctp-green/50 hover:text-ctp-green disabled:cursor-not-allowed disabled:opacity-40"
          >
            {backupBusy === "sql" ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {backupBusy === "sql" ? "Creating export…" : "Download SQL"}
          </button>
        </div>

        <div className="flex flex-col rounded-md border border-ctp-surface0 p-3">
          <div className="flex items-center gap-2">
            <Cloud size={17} className="text-ctp-peach" />
            <h3 className="font-line-seed text-xs font-bold text-ctp-text">
              Remote backup
            </h3>
          </div>

          <p className="mt-2 flex-1 font-line-seed text-xs leading-5 text-ctp-subtext0">
            Store encrypted copies in S3-compatible storage. Credentials and
            encryption settings must be configured on the backend.
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <StatusBadge
              label={s3Configured ? "CONFIGURED" : "NOT CONFIGURED"}
              tone={s3Configured ? "green" : "yellow"}
            />

            <button
              type="button"
              onClick={onRequestS3Backup}
              className="inline-flex items-center gap-1 font-line-seed text-xs font-semibold text-ctp-mauve hover:text-ctp-lavender"
            >
              Details
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {(!backupServiceAvailable || !databaseConnected) && (
        <div className="mt-3">
          <UnavailableNotice>
            {!databaseConnected
              ? "The database must be reachable before a backup or restore can run."
              : "The backend has not detected both pg_dump and pg_restore. Database backup and restore actions are disabled."}
          </UnavailableNotice>
        </div>
      )}

      <div className="mt-3 rounded-md border border-ctp-surface0 p-3">
        <div className="flex items-center gap-2">
          <RefreshCw size={17} className="text-ctp-red" />
          <div>
            <h3 className="font-line-seed text-xs font-bold text-ctp-text">
              Restore from a backup
            </h3>
            <p className="mt-0.5 font-line-seed text-[11px] text-ctp-subtext0">
              Only PostgreSQL custom-format .dump archives are accepted.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".dump,application/octet-stream"
          className="hidden"
          onChange={(event) => onFile(event.target.files?.[0])}
        />

        <div
          onDragOver={(event) => {
            event.preventDefault();
            onDraggingChange(true);
          }}
          onDragLeave={(event) => {
            const relatedTarget = event.relatedTarget;

            if (
              !(relatedTarget instanceof Node) ||
              !event.currentTarget.contains(relatedTarget)
            ) {
              onDraggingChange(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDraggingChange(false);
            onFile(event.dataTransfer.files?.[0]);
          }}
          className={`mt-3 rounded-md border border-dashed p-4 transition-colors ${dragging
              ? "border-ctp-mauve bg-ctp-mauve/10"
              : "border-ctp-surface1"
            }`}
        >
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-2.5">
              <Upload size={18} className="shrink-0 text-ctp-mauve" />

              <div className="min-w-0">
                <p className="break-all font-line-seed text-xs font-semibold text-ctp-text">
                  {selectedFile
                    ? selectedFile.name
                    : "Drop a PostgreSQL .dump file here"}
                </p>

                <p className="mt-1 font-line-seed text-[11px] text-ctp-subtext0">
                  {selectedFile
                    ? `${formatFileSize(selectedFile.size)} · Selected locally`
                    : `Or browse for a file · Limit: ${formatFileSize(maxRestoreUploadBytes)}`}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${actionClass} border-ctp-surface1 text-ctp-text hover:border-ctp-mauve/50`}
              >
                Browse
              </button>

              {selectedFile && (
                <>
                  <button
                    type="button"
                    onClick={onClearFile}
                    disabled={restoreBusy}
                    className={`${actionClass} border-ctp-surface1 text-ctp-subtext0 hover:text-ctp-red`}
                  >
                    <X size={13} />
                    Remove
                  </button>

                  <button
                    type="button"
                    onClick={onToggleRestoreConfirm}
                    disabled={!databaseConnected || restoreBusy}
                    className={`${actionClass} border-ctp-red/20 bg-ctp-red/10 text-ctp-red hover:bg-ctp-red/20`}
                  >
                    <RefreshCw size={13} />
                    {showRestoreConfirm ? "Hide confirmation" : "Prepare restore"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {showRestoreConfirm && selectedFile && (
          <div className="mt-3 rounded-md border border-ctp-red/30 bg-ctp-red/5 p-3">
            <div className="flex items-start gap-2">
              <CircleAlert
                size={16}
                className="mt-0.5 shrink-0 text-ctp-red"
              />

              <div className="min-w-0 flex-1">
                <p className="font-line-seed text-xs font-semibold text-ctp-text">
                  Confirm destructive database restore
                </p>

                <p className="mt-1 break-words font-line-seed text-xs leading-5 text-ctp-subtext1">
                  This operation can replace objects in the configured database.
                  Use only a trusted backup. The backend must create a
                  pre-restore snapshot before applying the archive.
                </p>

                <div className="mt-3 rounded-md border border-ctp-surface0 bg-ctp-mantle p-3">
                  <p className="font-line-seed text-[11px] text-ctp-subtext0">
                    Target database
                  </p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold text-ctp-text">
                    {databaseName || "Unknown"}
                  </p>

                  <label
                    htmlFor="database-restore-confirmation"
                    className="mt-3 block font-line-seed text-xs font-semibold text-ctp-text"
                  >
                    Type the database name to confirm
                  </label>

                  <input
                    id="database-restore-confirmation"
                    value={restoreConfirmation}
                    onChange={(event) =>
                      onRestoreConfirmationChange(event.target.value)
                    }
                    autoComplete="off"
                    spellCheck={false}
                    disabled={restoreBusy}
                    placeholder={databaseName || "Database name"}
                    className={`${inputClass} mt-1.5 w-full`}
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onRequestRestore}
                      disabled={
                        restoreDisabled ||
                        !databaseName ||
                        restoreConfirmation !== databaseName
                      }
                      className={`${actionClass} border-ctp-red/20 bg-ctp-red/10 text-ctp-red hover:bg-ctp-red/20`}
                    >
                      {restoreBusy ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={13} />
                      )}
                      {restoreBusy ? "Restoring…" : "Confirm and restore"}
                    </button>

                    <button
                      type="button"
                      onClick={onCloseRestoreConfirm}
                      disabled={restoreBusy}
                      className={`${actionClass} border-ctp-surface1 text-ctp-text`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
          The browser-side file extension and size checks are convenience
          checks, not security validation. The backend must validate the
          archive. Do not upload backups from untrusted sources.
        </p>
      </div>

      <div className="mt-3 rounded-md border border-ctp-surface0 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-line-seed text-xs font-bold text-ctp-text">
              Managed backup inventory
            </h3>
            <p className="mt-1 font-line-seed text-[11px] text-ctp-subtext0">
              Files retained on the backend server
            </p>
          </div>

          <StatusBadge
            label={backupLoading ? "LOADING" : `${backupCount} FILE(S)`}
            tone={backupError ? "red" : "gray"}
          />
        </div>

        <p className="mt-2 flex items-center gap-1.5 font-line-seed text-[11px] text-ctp-subtext0">
          <Clock size={12} />
          Retention policy: {backupRetentionDays} day(s), based on backend
          configuration.
        </p>

        {backupError ? (
          <div className="mt-3">
            <UnavailableNotice>
              Backup inventory could not be loaded: {backupError}
            </UnavailableNotice>
          </div>
        ) : backups.length > 0 ? (
          <div className="mt-3 divide-y divide-ctp-surface0 rounded-md border border-ctp-surface0">
            {backups.map((backup) => (
              <div
                key={backup.file_name}
                className="flex flex-col justify-between gap-2 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs font-semibold text-ctp-text">
                    {backup.file_name}
                  </p>
                  <p className="mt-1 font-line-seed text-[11px] text-ctp-subtext0">
                    {backup.purpose === "pre_restore"
                      ? "Pre-restore snapshot"
                      : "Created backup"}
                    <span className="px-1.5">·</span>
                    {backup.format === "custom" ? "Custom dump" : "SQL export"}
                  </p>
                </div>

                <div className="shrink-0 sm:text-right">
                  <p className="font-mono text-xs text-ctp-text">
                    {formatFileSize(backup.size_bytes)}
                  </p>
                  <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
                    {formatDateTime(backup.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-md bg-ctp-mantle p-3 font-line-seed text-xs text-ctp-subtext0">
            {backupLoading
              ? "Loading managed backups…"
              : "No managed backups were found in the configured backup directory."}
          </p>
        )}

        <p className="mt-3 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
          Newly created backups are downloaded through the browser. Retained
          server-side files remain on the backend host; this inventory does
          not expose their filesystem paths.
        </p>
      </div>
    </section>
  );
}
