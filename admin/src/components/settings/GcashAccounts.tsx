import { ArrowRightLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

import Dialog from "../ui/Dialog";
import Notice from "./Notice";
import { ApiError } from "../../lib/api";
import {
  activateGcashAccount,
  addGcashAccount,
  deleteGcashAccount,
  fetchGcashUsage,
  updateGcashAccount,
} from "../../lib/adminApi";
import type {
  GcashBackupAccount,
  GcashUsage,
  SettingsApiResponse,
  SettingsState,
  UpdateSetting,
} from "../../types/settings";
import {
  buttonDanger,
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  buttonSmall,
  inputClass,
  labelClass,
} from "./styles";

const BACKUP_LIMIT = 5;
const MAX_QR_BYTES = 5 * 1024 * 1024;

/** 09171234567 -> 0917 123 4567 */
function formatNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11
    ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    : value;
}

/** Mirrors the server rule so a typo is caught while typing. */
function numberProblem(value: string): string {
  const compact = value.replace(/[\s\-().]/g, "");

  if (!compact) return "";

  const local = compact.startsWith("+63")
    ? `0${compact.slice(3)}`
    : compact.startsWith("63") && compact.length === 12
      ? `0${compact.slice(2)}`
      : compact;

  return /^09\d{9}$/.test(local)
    ? ""
    : "Enter an 11-digit mobile number that starts with 09, for example 0917 123 4567.";
}

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

function when(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 409) {
    return error.message.includes("already") || error.message.includes("At most")
      ? error.message
      : "Settings changed on the server. Reload the latest settings and try again.";
  }

  return error instanceof Error ? error.message : fallback;
}

type Editing = { kind: "add" } | { kind: "edit"; account: GcashBackupAccount } | null;

export default function GcashAccounts({
  settings,
  version,
  onUpdate,
  onChanged,
  qrBlock,
}: {
  settings: SettingsState;
  version: number | null;
  onUpdate: UpdateSetting;
  onChanged: (response: SettingsApiResponse) => void;
  /** The QR image controls, shown between the number and the backups. */
  qrBlock: ReactNode;
}) {
  const [usage, setUsage] = useState<GcashUsage | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [switching, setSwitching] = useState<GcashBackupAccount | null>(null);
  const [removing, setRemoving] = useState<GcashBackupAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const backups = settings.gcashBackupAccounts;
  const problem = numberProblem(settings.gcashNumber);

  const loadUsage = useCallback((signal?: AbortSignal) => {
    fetchGcashUsage(signal)
      .then(setUsage)
      .catch(() => {
        if (!signal?.aborted) setUsage(null);
      });
  }, []);

  // Refresh the figures whenever the active account changes.
  useEffect(() => {
    const controller = new AbortController();
    loadUsage(controller.signal);
    return () => controller.abort();
  }, [loadUsage, settings.gcashActiveSince]);

  const run = async (work: () => Promise<SettingsApiResponse>, success: string): Promise<boolean> => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      onChanged(await work());
      setNotice(success);
      return true;
    } catch (caught) {
      setError(errorText(caught, "The change could not be saved."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmSwitch = async () => {
    if (!switching || version === null) return;
    const target = switching;

    const ok = await run(
      () => activateGcashAccount(target.id, version),
      `Switched to ${target.accountName || formatNumber(target.number)}. Terminals update within a few seconds.`,
    );

    if (ok) setSwitching(null);
  };

  const confirmRemove = async () => {
    if (!removing || version === null) return;
    const target = removing;

    const ok = await run(() => deleteGcashAccount(target.id, version), "Backup account removed.");
    if (ok) setRemoving(null);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-ctp-text">GCash payment account</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
        Terminals show this name and number with the QR code when a cashier selects GCash. Changes apply after you
        press Save.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="gcash-number" className={labelClass}>
            GCash number
          </label>
          <input
            id="gcash-number"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={20}
            value={settings.gcashNumber}
            onChange={(event) => onUpdate("gcashNumber", event.target.value)}
            aria-invalid={problem !== ""}
            aria-describedby={problem ? "gcash-number-problem" : undefined}
            placeholder="0917 123 4567"
            className={`${inputClass} mt-1`}
          />
          {problem && (
            <p id="gcash-number-problem" className="mt-1 text-xs text-ctp-red">
              {problem}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="gcash-name" className={labelClass}>
            Account name
          </label>
          <input
            id="gcash-name"
            type="text"
            autoComplete="off"
            maxLength={60}
            value={settings.gcashAccountName}
            onChange={(event) => onUpdate("gcashAccountName", event.target.value)}
            placeholder="Name shown on the GCash account"
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      {usage && (
        <p className="mt-3 text-xs leading-relaxed text-ctp-subtext0">
          {usage.since_active ? (
            <>
              Received through this account since {when(usage.active_since)}:{" "}
              <span className="font-medium tabular-nums text-ctp-text">{peso(usage.since_active.total)}</span> in{" "}
              {usage.since_active.count} sale{usage.since_active.count === 1 ? "" : "s"}.{" "}
            </>
          ) : null}
          GCash sales in the last 7 days:{" "}
          <span className="font-medium tabular-nums text-ctp-text">{peso(usage.last_7_days.total)}</span> in{" "}
          {usage.last_7_days.count}. GCash sets each account&rsquo;s limit; compare these figures with it.
        </p>
      )}

      <div className="mt-6">{qrBlock}</div>

      <div className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-ctp-text">Backup accounts</h4>
            <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
              Keep other GCash accounts ready. When the active one reaches its weekly limit, switch to a backup; the
              account you leave is kept in the list.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setError("");
              setEditing({ kind: "add" });
            }}
            disabled={busy || version === null || backups.length >= BACKUP_LIMIT}
            className={`${buttonSecondary} ${buttonSmall}`}
          >
            <Plus size={13} aria-hidden="true" />
            Add backup
          </button>
        </div>

        {backups.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-ctp-surface1 px-3 py-4 text-center text-xs text-ctp-subtext0">
            No backup accounts yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-ctp-surface0 rounded-md border border-ctp-surface0">
            {backups.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-ctp-surface0">
                  {account.qrImagePath ? (
                    <img
                      src={`/api/admin/settings/gcash/accounts/${account.id}/qr?v=${account.qrImagePath}`}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] text-ctp-subtext0">No QR</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ctp-text">{account.accountName || account.label}</p>
                  <p className="text-xs tabular-nums text-ctp-subtext0">{formatNumber(account.number)}</p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setSwitching(account);
                    }}
                    disabled={busy || version === null}
                    className={`${buttonPrimary} ${buttonSmall}`}
                  >
                    <ArrowRightLeft size={13} aria-hidden="true" />
                    Switch to this
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${account.accountName || formatNumber(account.number)}`}
                    onClick={() => {
                      setError("");
                      setEditing({ kind: "edit", account });
                    }}
                    disabled={busy}
                    className={`${buttonQuiet} ${buttonSmall}`}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${account.accountName || formatNumber(account.number)}`}
                    onClick={() => {
                      setError("");
                      setRemoving(account);
                    }}
                    disabled={busy}
                    className={`${buttonDanger} ${buttonSmall}`}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && !editing && !switching && !removing && (
          <div className="mt-3">
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          </div>
        )}

        {notice && (
          <div className="mt-3">
            <Notice tone="success" role="status">
              {notice}
            </Notice>
          </div>
        )}
      </div>

      {editing && (
        <AccountDialog
          key={editing.kind === "edit" ? editing.account.id : "new"}
          editing={editing}
          busy={busy}
          error={error}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            if (version === null) return;

            const ok = await run(
              () =>
                editing.kind === "edit"
                  ? updateGcashAccount(editing.account.id, version, input)
                  : addGcashAccount(version, input),
              editing.kind === "edit" ? "Backup account updated." : "Backup account added.",
            );

            if (ok) setEditing(null);
          }}
        />
      )}

      <Dialog
        open={switching !== null}
        onClose={() => {
          if (!busy) setSwitching(null);
        }}
        role="alertdialog"
        labelledBy="gcash-switch-title"
        title="Switch the active GCash account?"
        description={
          switching
            ? `Terminals will show ${switching.accountName || "the new account"} (${formatNumber(switching.number)}) for new GCash payments within a few seconds. ${
                settings.gcashNumber || settings.gcashAccountName
                  ? "The current account moves to the backup list."
                  : ""
              }`
            : undefined
        }
        footer={
          <>
            <button type="button" disabled={busy} onClick={() => setSwitching(null)} className={buttonSecondary}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void confirmSwitch()} className={buttonPrimary}>
              {busy ? "Switching…" : "Switch account"}
            </button>
          </>
        }
      >
        <p className="text-xs text-ctp-subtext0">
          Unsaved edits to the number, name or QR image above are replaced. Payments already made to the old account
          are not affected.
        </p>
        {error && (
          <div className="mt-3">
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          </div>
        )}
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => {
          if (!busy) setRemoving(null);
        }}
        role="alertdialog"
        labelledBy="gcash-remove-title"
        title="Remove this backup account?"
        description={
          removing
            ? `${removing.accountName || removing.label} (${formatNumber(removing.number)}) and its QR image are deleted.`
            : undefined
        }
        footer={
          <>
            <button type="button" disabled={busy} onClick={() => setRemoving(null)} className={buttonSecondary}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void confirmRemove()} className={buttonDanger}>
              {busy ? "Removing…" : "Remove"}
            </button>
          </>
        }
      >
        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}
      </Dialog>
    </div>
  );
}

function AccountDialog({
  editing,
  busy,
  error,
  onCancel,
  onSave,
}: {
  editing: NonNullable<Editing>;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (input: { number: string; accountName: string; label: string; file: File | null; removeQr: boolean }) => Promise<void>;
}) {
  const existing = editing.kind === "edit" ? editing.account : null;
  const [number, setNumber] = useState(existing?.number ?? "");
  const [accountName, setAccountName] = useState(existing?.accountName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const problem = numberProblem(number);
  const canSave = number.trim() !== "" && problem === "" && !busy;

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!picked) return;

    const ok = /^image\/(png|jpeg|x-png|pjpeg)$/i.test(picked.type) || /\.(png|jpe?g)$/i.test(picked.name);

    if (!ok) return setFileError("Choose a PNG or JPEG image.");
    if (picked.size === 0) return setFileError("The selected file is empty.");
    if (picked.size > MAX_QR_BYTES) return setFileError("The image must be 5 MiB or smaller.");

    setFileError("");
    setRemoveQr(false);
    setFile(picked);
  };

  const shownImage = preview ?? (!removeQr && existing?.qrImagePath
    ? `/api/admin/settings/gcash/accounts/${existing.id}/qr?v=${existing.qrImagePath}`
    : null);

  return (
    <Dialog
      onClose={() => {
        if (!busy) onCancel();
      }}
      labelledBy="gcash-account-title"
      title={existing ? "Edit backup account" : "Add backup account"}
      description="A saved account you can switch to when the active one is full."
      footer={
        <>
          <button type="button" disabled={busy} onClick={onCancel} className={buttonSecondary}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              void onSave({ number, accountName, label: existing?.label ?? "", file, removeQr })
            }
            className={buttonPrimary}
          >
            {busy ? "Saving…" : "Save account"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="backup-number" className={labelClass}>
            GCash number
          </label>
          <input
            id="backup-number"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={20}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            aria-invalid={problem !== ""}
            placeholder="0917 123 4567"
            className={`${inputClass} mt-1`}
          />
          {problem && <p className="mt-1 text-xs text-ctp-red">{problem}</p>}
        </div>

        <div>
          <label htmlFor="backup-name" className={labelClass}>
            Account name
          </label>
          <input
            id="backup-name"
            type="text"
            autoComplete="off"
            maxLength={60}
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </div>

        <div>
          <span className={labelClass}>QR code</span>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-ctp-surface1 bg-ctp-mantle">
              {shownImage ? (
                <img src={shownImage} alt="QR code" className="size-full object-contain" />
              ) : (
                <span className="text-[10px] text-ctp-subtext0">None</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                className="hidden"
                onChange={choose}
                aria-label="Choose QR image"
              />
              <button type="button" onClick={() => fileInput.current?.click()} className={`${buttonSecondary} ${buttonSmall}`}>
                {shownImage ? "Replace image" : "Upload image"}
              </button>
              {(file || (existing?.qrImagePath && !removeQr)) && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setRemoveQr(true);
                  }}
                  className={`${buttonQuiet} ${buttonSmall}`}
                >
                  Remove image
                </button>
              )}
            </div>
          </div>
          {fileError && <p className="mt-1 text-xs text-ctp-red">{fileError}</p>}
        </div>

        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
