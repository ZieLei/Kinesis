import type { ReactNode, RefObject } from "react";
import { Download, RefreshCw, Upload } from "lucide-react";

import { formatFileSize } from "../../lib/formatFileSize";
import type {
  BackupFormat,
  BackupMetadata,
} from "../../types/database";
import Section from "../ui/Section";
import Notice from "../ui/Notice";
import StatusBadge from "./StatusBadge";
import UnavailableNotice from "./UnavailableNotice";
import {
  buttonDanger,
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  inputClass,
  labelClass,
} from "../ui/styles";

function ActionRow({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium text-ctp-text">{title}</h3>
          {status}
        </div>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-ctp-subtext0">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </div>
  );
}

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
    <Section
      id="db-backups"
      title="Backup & restore"
      description="Create downloadable PostgreSQL backups and restore a trusted archive."
      bodyClassName="space-y-8"
    >
      <div className="space-y-3">
        <div className="divide-y divide-ctp-surface0 border-y border-ctp-surface0">
          <ActionRow
            title="PostgreSQL backup"
            description="Create a PostgreSQL custom-format archive and download it to this browser. This format is suitable for pg_restore."
          >
            <button
              type="button"
              onClick={() => onRequestBackup("custom")}
              disabled={backupDisabled}
              className={buttonPrimary}
            >
              {backupBusy === "custom" ? (
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              {backupBusy === "custom" ? "Creating backup…" : "Create and download"}
            </button>
          </ActionRow>

          <ActionRow
            title="Plain SQL export"
            description="Create a plain SQL dump for inspection or migration. This export is not accepted by the custom-format restore endpoint."
          >
            <button
              type="button"
              onClick={() => onRequestBackup("sql")}
              disabled={backupDisabled}
              className={buttonSecondary}
            >
              {backupBusy === "sql" ? (
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              {backupBusy === "sql" ? "Creating export…" : "Download SQL"}
            </button>
          </ActionRow>

          <ActionRow
            title="Remote backup"
            description="Store encrypted copies in S3-compatible storage. Credentials and encryption settings must be configured on the backend."
            status={
              <StatusBadge
                label={s3Configured ? "Configured" : "Not configured"}
                tone={s3Configured ? "green" : "yellow"}
              />
            }
          >
            <button
              type="button"
              onClick={onRequestS3Backup}
              className={buttonSecondary}
            >
              Details
            </button>
          </ActionRow>
        </div>

        {(!backupServiceAvailable || !databaseConnected) && (
          <UnavailableNotice>
            {!databaseConnected
              ? "The database must be reachable before a backup or restore can run."
              : "The backend has not detected both pg_dump and pg_restore. Database backup and restore actions are disabled."}
          </UnavailableNotice>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-ctp-text">
          Restore from a backup
        </h3>
        <p className="mt-0.5 text-xs text-ctp-subtext0">
          Only PostgreSQL custom-format .dump archives are accepted.
        </p>

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
          className={`mt-3 rounded-md border border-dashed px-4 py-3 transition-colors ${dragging
              ? "border-ctp-mauve bg-ctp-mauve/5"
              : "border-ctp-surface1"
            }`}
        >
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-2.5">
              <Upload
                size={16}
                aria-hidden="true"
                className="shrink-0 text-ctp-subtext0"
              />

              <div className="min-w-0">
                <p className="break-all text-sm text-ctp-text">
                  {selectedFile
                    ? selectedFile.name
                    : "Drop a PostgreSQL .dump file here"}
                </p>

                <p className="mt-0.5 text-xs text-ctp-subtext0">
                  {selectedFile
                    ? `${formatFileSize(selectedFile.size)} · Selected locally`
                    : `Or browse for a file · Limit: ${formatFileSize(maxRestoreUploadBytes)}`}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              {selectedFile && (
                <button
                  type="button"
                  onClick={onClearFile}
                  disabled={restoreBusy}
                  className={buttonQuiet}
                >
                  Remove
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={buttonSecondary}
              >
                Browse
              </button>

              {selectedFile && (
                <button
                  type="button"
                  onClick={onToggleRestoreConfirm}
                  disabled={!databaseConnected || restoreBusy}
                  className={buttonDanger}
                >
                  {showRestoreConfirm ? "Hide confirmation" : "Prepare restore"}
                </button>
              )}
            </div>
          </div>
        </div>

        {showRestoreConfirm && selectedFile && (
          <Notice
            tone="danger"
            role="alert"
            title="Confirm destructive database restore"
            className="mt-3"
          >
            <p>
              This operation can replace objects in the configured database.
              Use only a trusted backup. The backend must create a
              pre-restore snapshot before applying the archive.
            </p>

            <p className="mt-3">
              Target database:{" "}
              <span className="break-all font-mono font-medium text-ctp-text">
                {databaseName || "Unknown"}
              </span>
            </p>

            <label
              htmlFor="database-restore-confirmation"
              className={`${labelClass} mt-3 !text-xs`}
            >
              Type the database name to confirm
            </label>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
                className={`${inputClass} max-w-xs`}
              />

              <button
                type="button"
                onClick={onRequestRestore}
                disabled={
                  restoreDisabled ||
                  !databaseName ||
                  restoreConfirmation !== databaseName
                }
                className={buttonDanger}
              >
                {restoreBusy && (
                  <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                )}
                {restoreBusy ? "Restoring…" : "Confirm and restore"}
              </button>

              <button
                type="button"
                onClick={onCloseRestoreConfirm}
                disabled={restoreBusy}
                className={buttonSecondary}
              >
                Cancel
              </button>
            </div>
          </Notice>
        )}

        <p className="mt-3 text-xs leading-relaxed text-ctp-subtext0">
          The browser-side file extension and size checks are convenience
          checks, not security validation. The backend must validate the
          archive. Do not upload backups from untrusted sources.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-ctp-text">
              Managed backup inventory
            </h3>
            <p className="mt-0.5 text-xs text-ctp-subtext0">
              Files retained on the backend server · Retention policy:{" "}
              {backupRetentionDays} day(s), based on backend configuration.
            </p>
          </div>

          <StatusBadge
            label={backupLoading ? "Loading" : `${backupCount} file(s)`}
            tone={backupError ? "red" : "gray"}
          />
        </div>

        {backupError ? (
          <div className="mt-3">
            <UnavailableNotice>
              Backup inventory could not be loaded: {backupError}
            </UnavailableNotice>
          </div>
        ) : backups.length > 0 ? (
          <div className="mt-3 divide-y divide-ctp-surface0 border-y border-ctp-surface0">
            {backups.map((backup) => (
              <div
                key={backup.file_name}
                className="flex flex-col justify-between gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs text-ctp-text">
                    {backup.file_name}
                  </p>
                  <p className="mt-0.5 text-xs text-ctp-subtext0">
                    {backup.purpose === "pre_restore"
                      ? "Pre-restore snapshot"
                      : "Created backup"}
                    {" · "}
                    {backup.format === "custom" ? "Custom dump" : "SQL export"}
                  </p>
                </div>

                <div className="shrink-0 text-xs tabular-nums sm:text-right">
                  <p className="text-ctp-text">
                    {formatFileSize(backup.size_bytes)}
                  </p>
                  <p className="mt-0.5 text-ctp-subtext0">
                    {formatDateTime(backup.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 border-y border-ctp-surface0 py-6 text-xs text-ctp-subtext0">
            {backupLoading
              ? "Loading managed backups…"
              : "No managed backups were found in the configured backup directory."}
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-ctp-subtext0">
          Newly created backups are downloaded through the browser. Retained
          server-side files remain on the backend host; this inventory does
          not expose their filesystem paths.
        </p>
      </div>
    </Section>
  );
}
