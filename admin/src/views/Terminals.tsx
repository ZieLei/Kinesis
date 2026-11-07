import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";

import {
  ChevronRight,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";

import UiNotice from "../components/ui/Notice";
import PageHeader from "../components/ui/PageHeader";
import Section from "../components/ui/Section";
import StatusDot, { type StatusTone } from "../components/ui/StatusDot";
import StatList, { KeyValueList } from "../components/ui/StatList";
import EmptyState from "../components/ui/EmptyState";
import SearchInput from "../components/ui/SearchInput";
import Dialog from "../components/ui/Dialog";
import {
  buttonDanger,
  buttonDangerSolid,
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  buttonSmall,
  inputClass,
} from "../components/ui/styles";

import type {
  ManagedTerminal,
  TerminalConnectionHealth,
} from "../types/terminal";

import {
  broadcastToTerminals,
  createTerminalPairingChallenge,
  disableTerminal,
  enableTerminal,
  requestTerminalSync,
  revokeTerminalPairingChallenge,
  updateTerminalMaintenance,
} from "../lib/terminalApi";

import type {
  TerminalPairingChallenge,
} from "../lib/terminalApi";

import { useTerminalManagement } from "../hooks/useTerminalManagement";

// --------------------------------------------------
// Types and styles
// --------------------------------------------------

type Notice = {
  message: string;
  error: boolean;
};

const healthTone: Record<TerminalConnectionHealth, StatusTone> = {
  Healthy: "success",
  Degraded: "warning",
  Poor: "danger",
  Unavailable: "neutral",
  Measuring: "info",
};

const terminalGridClass =
  "grid grid-cols-1 gap-3 xl:grid-cols-[minmax(230px,1.45fr)_minmax(145px,0.85fr)_minmax(130px,0.8fr)_minmax(140px,0.85fr)_minmax(310px,1.5fr)] xl:items-start";

// --------------------------------------------------
// Date and formatting helpers
// --------------------------------------------------

function parseDateTime(value: string | null): Date | null {
  if (!value) return null;

  const hasTimezone =
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);

  const normalizedValue = hasTimezone
    ? value
    : `${value}Z`;

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isHeartbeatFresh(
  lastSeenAt: string | null,
  timeoutSeconds: number,
  now: number,
): boolean {
  const lastSeen = parseDateTime(lastSeenAt);

  if (!lastSeen) return false;

  const age = now - lastSeen.getTime();
  const allowedFutureSkew = 30_000;
  const timeoutMs = Math.max(1, timeoutSeconds) * 1000;

  return age >= -allowedFutureSkew && age <= timeoutMs;
}

function formatDateTime(value: string | null): string {
  const date = parseDateTime(value);

  if (!date) {
    return value ? "Unknown" : "Never";
  }

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(
  value: string | null,
  now: number,
): string {
  const date = parseDateTime(value);

  if (!date) {
    return value ? "Unknown" : "Never";
  }

  const difference = Math.max(
    0,
    now - date.getTime(),
  );

  const seconds = Math.floor(difference / 1000);

  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  return `${Math.floor(hours / 24)} day(s) ago`;
}

function formatLatency(latency: number | null): string {
  if (latency === null) return "—";

  if (!Number.isFinite(latency)) {
    return "Unknown";
  }

  return `${Math.round(latency)} ms`;
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

// --------------------------------------------------
// Status indicators
// --------------------------------------------------

function StatusBadge({
  connected,
}: {
  connected: boolean;
}) {
  return (
    <StatusDot tone={connected ? "success" : "danger"}>
      {connected ? "Connected" : "Disconnected"}
    </StatusDot>
  );
}

function HealthBadge({
  health,
}: {
  health: TerminalConnectionHealth;
}) {
  return (
    <StatusDot tone={healthTone[health]} muted>
      {health}
    </StatusDot>
  );
}

function WebSocketBadge({
  connected,
}: {
  connected: boolean;
}) {
  return (
    <StatusDot tone={connected ? "success" : "neutral"}>
      {connected ? "Connected" : "Disconnected"}
    </StatusDot>
  );
}

// --------------------------------------------------
// Shared interface components
// --------------------------------------------------

function StatusMessage({
  notice,
}: {
  notice: Notice;
}) {
  return (
    <UiNotice
      tone={notice.error ? "danger" : "success"}
      role={notice.error ? "alert" : "status"}
    >
      {notice.message}
    </UiNotice>
  );
}

function TerminalDetail({
  label,
  value,
  secondary,
  title,
}: {
  label: string;
  value: string;
  secondary?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ctp-subtext0">
        {label}
      </dt>

      <dd
        className="mt-0.5 break-all text-xs text-ctp-text"
        title={title}
      >
        {value}
      </dd>

      {secondary && (
        <dd className="mt-0.5 text-xs text-ctp-subtext0">
          {secondary}
        </dd>
      )}
    </div>
  );
}

function SectionLabel({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="text-xs font-medium text-ctp-subtext0">
      {children}
    </p>
  );
}

// --------------------------------------------------
// Terminal pairing dialog
// --------------------------------------------------

function TerminalPairingDialog({
  challenge,
  remainingSeconds,
  busy,
  error,
  onGenerate,
  onClose,
}: {
  challenge: TerminalPairingChallenge | null;
  remainingSeconds: number;
  busy: boolean;
  error: string | null;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const expired =
    challenge !== null && remainingSeconds <= 0;

  return (
    <Dialog
      onClose={onClose}
      dismissible={!busy}
      labelledBy="terminal-pairing-title"
      title="Pair a new terminal"
      description="Scan this code using the Kinesis mobile app."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={buttonSecondary}
          >
            Cancel pairing
          </button>

          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className={buttonPrimary}
          >
            {busy && (
              <RefreshCw
                size={14}
                aria-hidden="true"
                className="animate-spin"
              />
            )}

            {challenge && !expired
              ? "Generate new code"
              : "Generate QR code"}
          </button>
        </>
      }
    >
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-ctp-surface0 bg-ctp-base p-4">
        {challenge && !expired ? (
          <>
            <div className="bg-white p-3">
              <QRCodeSVG
                value={challenge.pairing_payload}
                size={248}
                level="M"
                includeMargin
                title="Kinesis one-time terminal pairing QR code"
              />
            </div>

            <p
              role="timer"
              className="mt-4 text-sm font-medium tabular-nums text-ctp-yellow"
            >
              Expires in {formatCountdown(remainingSeconds)}
            </p>

            <p className="mt-2 max-w-xs text-center text-xs leading-relaxed text-ctp-subtext0">
              Keep this dialog open while the mobile terminal scans
              the code. It can only be redeemed once.
            </p>

            {/* For terminals without a camera (for example a counter PC
                using the web app). Same single-use, five-minute code. */}
            <details className="mt-3 w-full max-w-xs">
              <summary className="cursor-pointer text-center text-xs text-ctp-mauve hover:underline">
                Can&apos;t scan? Show pairing code
              </summary>

              <textarea
                readOnly
                value={challenge.pairing_payload}
                rows={3}
                spellCheck={false}
                aria-label="One-time pairing code"
                onFocus={(event) => event.currentTarget.select()}
                className={`${inputClass} mt-2 resize-none break-all font-mono !text-xs`}
              />

              <p className="mt-1 text-xs leading-relaxed text-ctp-subtext0">
                Paste it into &quot;No camera? Paste the pairing code&quot; on
                the terminal. Treat it like a password until it expires.
              </p>
            </details>
          </>
        ) : expired ? (
          <>
            <p className="text-sm font-medium text-ctp-text">
              Pairing code expired
            </p>

            <p className="mt-1 max-w-xs text-center text-xs leading-relaxed text-ctp-subtext0">
              This QR code is no longer valid. Generate a new one
              to continue pairing.
            </p>
          </>
        ) : busy ? (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-ctp-subtext0"
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className="animate-spin"
            />
            Creating secure pairing code…
          </p>
        ) : (
          <p className="text-xs text-ctp-subtext0">
            No pairing code generated.
          </p>
        )}
      </div>

      {error && (
        <UiNotice tone="danger" role="alert" className="mt-3">
          {error}
        </UiNotice>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ctp-subtext0">
        This QR contains a temporary pairing secret. It expires
        after five minutes and is invalidated after its first
        successful use. The permanent terminal credential is
        issued separately and stored securely on the mobile device.
        Pairing is available only to administrators with an
        authenticated session.
      </p>
    </Dialog>
  );
}

// --------------------------------------------------
// Terminal row
// --------------------------------------------------

function TerminalRow({
  terminal,
  now,
  heartbeatTimeoutSeconds,
  notice,
  confirmDisable,
  busyAction,
  onConfirmDisable,
  onSync,
  onMaintenance,
  onDisable,
  onEnable,
}: {
  terminal: ManagedTerminal;
  now: number;
  heartbeatTimeoutSeconds: number;
  notice?: Notice;
  confirmDisable: boolean;
  busyAction: string | null;
  onConfirmDisable: (confirm: boolean) => void;
  onSync: (terminal: ManagedTerminal) => Promise<void>;
  onMaintenance: (terminal: ManagedTerminal) => Promise<void>;
  onDisable: (terminal: ManagedTerminal) => Promise<void>;
  onEnable: (terminal: ManagedTerminal) => Promise<void>;
}) {
  const connected =
    terminal.is_enabled &&
    isHeartbeatFresh(
      terminal.last_seen_at,
      heartbeatTimeoutSeconds,
      now,
    );

  const disabled = !terminal.is_enabled;
  const busy = busyAction !== null;

  const latency = terminal.latency_ms;

  const latencyColor =
    latency === null
      ? "text-ctp-overlay1"
      : latency <= 100
        ? "text-ctp-green"
        : latency <= 300
          ? "text-ctp-yellow"
          : "text-ctp-red";

  return (
    <article className="py-4 transition-colors">
      <div className={terminalGridClass}>
        {/* Device identity */}

        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium text-ctp-text">
            {terminal.name}
          </h3>

          <p className="mt-0.5 break-words text-xs text-ctp-subtext0">
            {terminal.terminal_code}
            {" · "}
            {terminal.device_type}
            {" · "}
            {terminal.platform}
            {terminal.app_version && ` · App ${terminal.app_version}`}
          </p>

          <p className="mt-0.5 break-all font-mono text-xs text-ctp-overlay1">
            {terminal.device_id}
          </p>
        </div>

        {/* Connection status */}

        <div className="min-w-0">
          <div className="xl:hidden">
            <SectionLabel>Connection</SectionLabel>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 xl:mt-0">
            <StatusBadge connected={connected} />

            <HealthBadge
              health={terminal.connection_health}
            />
          </div>

          {(terminal.maintenance_mode || disabled) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {terminal.maintenance_mode && (
                <StatusDot tone="warning">Maintenance</StatusDot>
              )}

              {disabled && (
                <StatusDot tone="danger">Access disabled</StatusDot>
              )}
            </div>
          )}
        </div>

        {/* HTTP heartbeat */}

        <div className="min-w-0">
          <div className="xl:hidden">
            <SectionLabel>HTTP heartbeat</SectionLabel>
          </div>

          <p className="mt-1 text-sm text-ctp-text xl:mt-0">
            {formatRelativeTime(
              terminal.last_seen_at,
              now,
            )}
          </p>

          <p className="mt-0.5 text-xs text-ctp-subtext0">
            {connected
              ? `Within ${heartbeatTimeoutSeconds}s timeout`
              : "Expired or unavailable"}
          </p>

          <p className="mt-0.5 text-xs tabular-nums text-ctp-overlay1">
            {formatDateTime(terminal.last_seen_at)}
          </p>
        </div>

        {/* WebSocket and latency */}

        <div className="min-w-0">
          <div className="xl:hidden">
            <SectionLabel>WebSocket</SectionLabel>
          </div>

          <div className="mt-1 xl:mt-0">
            <WebSocketBadge
              connected={terminal.websocket_connected}
            />
          </div>

          <p className="mt-0.5 text-xs text-ctp-subtext0">
            Ping{" "}
            <span
              className={`font-medium tabular-nums ${latencyColor}`}
            >
              {terminal.websocket_connected
                ? latency === null
                  ? "Measuring…"
                  : formatLatency(latency)
                : "—"}
            </span>
            {terminal.consecutive_ping_timeouts > 0 && (
              <span className="text-ctp-red">
                {" · "}
                {terminal.consecutive_ping_timeouts} missed ping(s)
              </span>
            )}
          </p>
        </div>

        {/* Terminal actions */}

        <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
          <button
            type="button"
            onClick={() => void onSync(terminal)}
            disabled={!connected || disabled || busy}
            className={`${buttonSecondary} ${buttonSmall}`}
            title={
              connected
                ? "Queue a synchronization request"
                : "Terminal must have a recent heartbeat to request sync"
            }
          >
            {busyAction === "sync" && (
              <RefreshCw
                size={12}
                aria-hidden="true"
                className="animate-spin"
              />
            )}

            Sync
          </button>

          <button
            type="button"
            onClick={() => void onMaintenance(terminal)}
            disabled={disabled || busy}
            aria-pressed={terminal.maintenance_mode}
            className={`${buttonSecondary} ${buttonSmall} ${terminal.maintenance_mode
                ? "!border-ctp-yellow/50 !text-ctp-yellow"
                : ""
              }`}
            title={
              terminal.maintenance_mode
                ? "End maintenance mode"
                : "Place terminal into maintenance mode"
            }
          >
            {busyAction === "maintenance" && (
              <RefreshCw
                size={12}
                aria-hidden="true"
                className="animate-spin"
              />
            )}

            {terminal.maintenance_mode
              ? "End maintenance"
              : "Maintenance"}
          </button>

          {disabled ? (
            <button
              type="button"
              onClick={() => void onEnable(terminal)}
              disabled={busy}
              className={`${buttonSecondary} ${buttonSmall}`}
            >
              {busyAction === "enable" && (
                <RefreshCw
                  size={12}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}

              Enable access
            </button>
          ) : confirmDisable ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={`Confirm disabling ${terminal.name}`}
            >
              <span className="text-xs text-ctp-red">
                Revoke access? The device must be re-paired.
              </span>

              <button
                type="button"
                onClick={() => void onDisable(terminal)}
                disabled={busy}
                className={`${buttonDangerSolid} ${buttonSmall}`}
              >
                {busyAction === "disable" && (
                  <RefreshCw
                    size={12}
                    aria-hidden="true"
                    className="animate-spin"
                  />
                )}

                Confirm
              </button>

              <button
                type="button"
                onClick={() => onConfirmDisable(false)}
                disabled={busy}
                className={`${buttonQuiet} ${buttonSmall}`}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onConfirmDisable(true)}
              disabled={busy}
              className={`${buttonDanger} ${buttonSmall}`}
            >
              Disable access
            </button>
          )}
        </div>
      </div>

      {/* Additional device information */}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <TerminalDetail
          label="IP address"
          value={terminal.ip_address ?? "Not reported"}
        />

        <TerminalDetail
          label="Last ping measurement"
          value={formatRelativeTime(
            terminal.latency_updated_at,
            now,
          )}
          title={formatDateTime(
            terminal.latency_updated_at,
          )}
        />

        <TerminalDetail
          label="Last successful sync"
          value={formatRelativeTime(
            terminal.last_sync_at,
            now,
          )}
          title={formatDateTime(terminal.last_sync_at)}
        />

        <TerminalDetail
          label="First registered"
          value={formatDateTime(
            terminal.first_seen_at,
          )}
          title={formatDateTime(
            terminal.first_seen_at,
          )}
        />
      </dl>

      {notice && (
        <div className="mt-3">
          <StatusMessage notice={notice} />
        </div>
      )}
    </article>
  );
}

// --------------------------------------------------
// Main page
// --------------------------------------------------

export default function Terminals() {
  const [search, setSearch] = useState("");
  const [broadcast, setBroadcast] = useState("");

  const [broadcastNotice, setBroadcastNotice] =
    useState<Notice | null>(null);

  const [confirmDisable, setConfirmDisable] =
    useState<number | null>(null);

  const [notices, setNotices] =
    useState<Record<number, Notice>>({});

  const [busyActions, setBusyActions] =
    useState<Record<number, string | null>>({});

  const [broadcastBusy, setBroadcastBusy] =
    useState(false);

  const [now, setNow] = useState(() => Date.now());

  // Pairing dialog state

  const [pairingOpen, setPairingOpen] = useState(false);

  const [pairingChallenge, setPairingChallenge] =
    useState<TerminalPairingChallenge | null>(null);

  const [pairingSecondsRemaining, setPairingSecondsRemaining] =
    useState(0);

  const [pairingBusy, setPairingBusy] = useState(false);

  const [pairingError, setPairingError] =
    useState<string | null>(null);

  const [pairingNotice, setPairingNotice] =
    useState<Notice | null>(null);

  // Keep relative timestamps and heartbeat indicators current.

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const {
    data,
    loading,
    refreshing,
    error,
    metricsError,
    lastUpdated,
    metricsUpdatedAt,
    refresh,
  } = useTerminalManagement(search);

  // Keep the pairing countdown synchronized with backend expiry.

  useEffect(() => {
    if (!pairingChallenge) {
      setPairingSecondsRemaining(0);
      return;
    }

    const updateCountdown = () => {
      const expiry = Date.parse(pairingChallenge.expires_at);

      if (Number.isNaN(expiry)) {
        setPairingSecondsRemaining(0);
        return;
      }

      setPairingSecondsRemaining(
        Math.max(0, Math.ceil((expiry - Date.now()) / 1000)),
      );
    };

    updateCountdown();

    const interval = window.setInterval(
      updateCountdown,
      1000,
    );

    return () => window.clearInterval(interval);
  }, [pairingChallenge]);

  // Refresh the list while the pairing dialog is open.

  useEffect(() => {
    if (!pairingOpen) return;

    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [pairingOpen, refresh]);

  // --------------------------------------------------
  // Derived terminal metrics
  // --------------------------------------------------

  const terminals = data?.items ?? [];

  const heartbeatTimeoutSeconds = Math.max(
    1,
    data?.heartbeat_timeout_seconds ?? 30,
  );

  const connectedCount = terminals.filter(
    (terminal) =>
      terminal.is_enabled &&
      isHeartbeatFresh(
        terminal.last_seen_at,
        heartbeatTimeoutSeconds,
        now,
      ),
  ).length;

  const disconnectedCount = Math.max(
    0,
    terminals.length - connectedCount,
  );

  const maintenanceCount = terminals.filter(
    (terminal) => terminal.maintenance_mode,
  ).length;

  const measuredLatencies = terminals
    .filter(
      (terminal) =>
        terminal.websocket_connected &&
        terminal.latency_ms !== null,
    )
    .map((terminal) => terminal.latency_ms as number);

  const averageLatency =
    measuredLatencies.length > 0
      ? Math.round(
        measuredLatencies.reduce(
          (sum, value) => sum + value,
          0,
        ) / measuredLatencies.length,
      )
      : null;

  const healthyCount = terminals.filter(
    (terminal) =>
      terminal.connection_health === "Healthy",
  ).length;

  const degradedCount = terminals.filter(
    (terminal) =>
      terminal.connection_health === "Degraded",
  ).length;

  const poorCount = terminals.filter(
    (terminal) =>
      terminal.connection_health === "Poor",
  ).length;

  const networkStatus = !data
    ? loading
      ? "Checking"
      : "Unknown"
    : connectedCount > 0
      ? "Online"
      : "Offline";

  // --------------------------------------------------
  // Terminal pairing actions
  // --------------------------------------------------

  function openPairingDialog() {
    setPairingError(null);
    setPairingNotice(null);
    setPairingChallenge(null);
    setPairingOpen(true);

    void generatePairingCode();
  }

  async function generatePairingCode() {
    setPairingBusy(true);
    setPairingError(null);

    try {
      // Revoke an earlier unused code before replacing it.

      if (
        pairingChallenge &&
        pairingSecondsRemaining > 0
      ) {
        await revokeTerminalPairingChallenge(
          pairingChallenge.id,
        );
      }

      const challenge =
        await createTerminalPairingChallenge();

      setPairingChallenge(challenge);
    } catch (requestError) {
      setPairingError(
        getErrorMessage(
          requestError,
          "A pairing QR code could not be created.",
        ),
      );
    } finally {
      setPairingBusy(false);
    }
  }

  async function closePairingDialog() {
    const challenge = pairingChallenge;

    const stillValid =
      challenge !== null &&
      pairingSecondsRemaining > 0;

    setPairingBusy(true);
    setPairingError(null);

    if (challenge && stillValid) {
      try {
        await revokeTerminalPairingChallenge(
          challenge.id,
        );
      } catch (requestError) {
        // The code still expires automatically if revocation fails.

        setPairingNotice({
          message:
            `The dialog was closed, but the pairing code could not be revoked. ` +
            `It will expire automatically. ${getErrorMessage(
              requestError,
              "",
            )}`.trim(),
          error: true,
        });
      }
    }

    setPairingChallenge(null);
    setPairingOpen(false);
    setPairingBusy(false);
  }

  // --------------------------------------------------
  // Notice and busy-state helpers
  // --------------------------------------------------

  function saveTerminalNotice(
    id: number,
    notice: Notice,
  ) {
    setNotices((current) => ({
      ...current,
      [id]: notice,
    }));
  }

  function setBusy(
    id: number,
    action: string | null,
  ) {
    setBusyActions((current) => ({
      ...current,
      [id]: action,
    }));
  }

  // --------------------------------------------------
  // Terminal actions
  // --------------------------------------------------

  async function handleSync(
    terminal: ManagedTerminal,
  ) {
    setBusy(terminal.id, "sync");

    saveTerminalNotice(terminal.id, {
      message: "Sending sync request…",
      error: false,
    });

    try {
      const response = await requestTerminalSync(
        terminal.id,
      );

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      void refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message: getErrorMessage(
          requestError,
          "The sync request failed.",
        ),
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  async function handleMaintenance(
    terminal: ManagedTerminal,
  ) {
    const nextValue = !terminal.maintenance_mode;

    setBusy(terminal.id, "maintenance");

    try {
      const response = await updateTerminalMaintenance(
        terminal.id,
        nextValue,
      );

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      void refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message: getErrorMessage(
          requestError,
          "Maintenance mode could not be updated.",
        ),
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  async function handleDisable(
    terminal: ManagedTerminal,
  ) {
    setBusy(terminal.id, "disable");

    try {
      const response = await disableTerminal(
        terminal.id,
      );

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      setConfirmDisable(null);
      void refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message: getErrorMessage(
          requestError,
          "Terminal access could not be disabled.",
        ),
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  async function handleEnable(
    terminal: ManagedTerminal,
  ) {
    setBusy(terminal.id, "enable");

    try {
      const response = await enableTerminal(
        terminal.id,
      );

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      void refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message: getErrorMessage(
          requestError,
          "Terminal access could not be enabled.",
        ),
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  // --------------------------------------------------
  // Broadcast
  // --------------------------------------------------

  async function sendBroadcast(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!broadcast.trim()) {
      setBroadcastNotice({
        message: "Enter a message before broadcasting.",
        error: true,
      });

      return;
    }

    if (connectedCount === 0) {
      setBroadcastNotice({
        message: "No recently connected terminals are available.",
        error: true,
      });

      return;
    }

    setBroadcastBusy(true);
    setBroadcastNotice(null);

    try {
      const response = await broadcastToTerminals(
        broadcast.trim(),
      );

      setBroadcastNotice({
        message:
          `${response.message} ` +
          `${response.commands_created} command(s) queued for ` +
          `${response.recipient_count} terminal(s).`,
        error: false,
      });

      setBroadcast("");
      void refresh();
    } catch (requestError) {
      setBroadcastNotice({
        message: getErrorMessage(
          requestError,
          "The broadcast could not be queued.",
        ),
        error: true,
      });
    } finally {
      setBroadcastBusy(false);
    }
  }

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="w-full min-w-0 space-y-8 font-line-seed">
      {/* Page header */}

      <div className="space-y-4">
        <PageHeader
          title="Terminal management"
          description="Monitor connected devices, manage access, and handle synchronization."
          status={<StatusDot tone="success">Admin authenticated</StatusDot>}
          actions={
            <button
              type="button"
              onClick={openPairingDialog}
              className={buttonPrimary}
            >
              <Plus size={15} aria-hidden="true" />
              Add terminal
            </button>
          }
        />

        {pairingNotice && (
          <StatusMessage notice={pairingNotice} />
        )}

        {/* Terminal summary */}

        <section aria-label="Terminal summary">
          <StatList
            items={[
              {
                label: "Registered",
                value: data ? data.total_count : "—",
                hint: "Total registered devices",
              },
              {
                label: "Connected",
                value: data ? connectedCount : "—",
                hint: "Fresh HTTP heartbeats",
                valueClassName: "text-ctp-green",
              },
              {
                label: "Disconnected",
                value: data ? disconnectedCount : "—",
                hint: "No fresh heartbeat",
                valueClassName:
                  disconnectedCount > 0 ? "text-ctp-red" : undefined,
              },
              {
                label: "Maintenance",
                value: data ? maintenanceCount : "—",
                hint: "Devices in maintenance",
                valueClassName:
                  maintenanceCount > 0 ? "text-ctp-yellow" : undefined,
              },
              {
                label: "Average ping",
                value:
                  averageLatency === null ? "—" : `${averageLatency} ms`,
                hint: `${measuredLatencies.length} measured device(s)`,
              },
            ]}
          />
        </section>
      </div>

      {/* Network status */}

      <Section
        id="terminal-network"
        title="Network status"
        actions={
          <StatusDot
            tone={
              networkStatus === "Online"
                ? "success"
                : networkStatus === "Offline"
                  ? "danger"
                  : "warning"
            }
            pulse={!data && loading}
          >
            {data
              ? networkStatus
              : loading
                ? "Checking…"
                : "Unknown"}
          </StatusDot>
        }
        bodyClassName="space-y-3"
      >
        <KeyValueList
          items={[
            {
              label: "API endpoint",
              value: (
                <>
                  <span className="break-all font-mono">
                    {window.location.origin}
                  </span>
                  <span className="ml-2 font-normal text-ctp-subtext0">
                    Same-origin FastAPI proxy
                  </span>
                </>
              ),
            },
            {
              label: "Heartbeat policy",
              value: (
                <>
                  {heartbeatTimeoutSeconds} second timeout
                  <span className="ml-2 font-normal text-ctp-subtext0">
                    Devices must report within this window
                  </span>
                </>
              ),
            },
            {
              label: "Connection quality",
              value: (
                <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  <StatusDot tone="success">{healthyCount} healthy</StatusDot>
                  <StatusDot tone="warning">{degradedCount} degraded</StatusDot>
                  <StatusDot tone="danger">{poorCount} poor</StatusDot>
                  <span className="font-normal text-ctp-subtext0">
                    Based on WebSocket measurements
                  </span>
                </span>
              ),
            },
            {
              label: "Last metrics update",
              value: (
                <>
                  {metricsUpdatedAt
                    ? formatRelativeTime(metricsUpdatedAt, now)
                    : "Not available"}
                  <span className="ml-2 font-normal text-ctp-subtext0">
                    Updated independently from terminal details
                  </span>
                </>
              ),
            },
          ]}
        />

        {/* Metrics error */}

        {metricsError && (
          <UiNotice
            tone="warning"
            role="status"
            title="Connection metrics unavailable"
          >
            {metricsError}
          </UiNotice>
        )}
      </Section>

      {/* Terminal list */}

      <Section
        id="registered-terminals"
        title="Registered terminals"
        badge={data ? data.total_count : "—"}
        description="Manage device connections, synchronization, and access."
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              label="Search terminals"
              placeholder="Search name, ID, IP…"
              className="w-full sm:w-72"
            />

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              title="Refresh terminal list"
              className={buttonSecondary}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </>
        }
        bodyClassName="space-y-3"
      >
        {/* API error */}

        {error && (
          <UiNotice
            tone="danger"
            role="alert"
            title="Could not load terminals"
            action={
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className={buttonSecondary}
              >
                Retry
              </button>
            }
          >
            {error}
          </UiNotice>
        )}

        {/* Result information */}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ctp-subtext0">
          <p className="tabular-nums">
            {data
              ? `Showing ${terminals.length} of ${data.total_count} registered terminal(s)`
              : "Terminal data unavailable"}
          </p>

          <StatusDot tone={connectedCount > 0 ? "success" : "neutral"}>
            {connectedCount} heartbeat-connected
          </StatusDot>
        </div>

        <div className="border-y border-ctp-surface0">
          {/* Column labels */}

          {terminals.length > 0 && !loading && (
            <div
              className={`${terminalGridClass} hidden border-b border-ctp-surface0 py-2 xl:grid`}
            >
              <SectionLabel>Device</SectionLabel>
              <SectionLabel>Connection</SectionLabel>
              <SectionLabel>HTTP heartbeat</SectionLabel>
              <SectionLabel>WebSocket</SectionLabel>
              <SectionLabel>
                <span className="sr-only">Actions</span>
              </SectionLabel>
            </div>
          )}

          {/* Terminal content */}

          {loading && !data ? (
            <p
              role="status"
              className="flex items-center gap-2 py-10 text-xs text-ctp-subtext0"
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className="animate-spin"
              />
              Loading terminals…
            </p>
          ) : terminals.length > 0 ? (
            <div className="divide-y divide-ctp-surface0">
              {terminals.map((terminal) => (
                <TerminalRow
                  key={terminal.id}
                  terminal={terminal}
                  now={now}
                  heartbeatTimeoutSeconds={
                    heartbeatTimeoutSeconds
                  }
                  notice={notices[terminal.id]}
                  confirmDisable={
                    confirmDisable === terminal.id
                  }
                  busyAction={
                    busyActions[terminal.id] ?? null
                  }
                  onConfirmDisable={(confirm) =>
                    setConfirmDisable(
                      confirm ? terminal.id : null,
                    )
                  }
                  onSync={handleSync}
                  onMaintenance={handleMaintenance}
                  onDisable={handleDisable}
                  onEnable={handleEnable}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              bordered={false}
              title={
                error
                  ? "Terminal information unavailable"
                  : search
                    ? "No matching terminals"
                    : "No terminals registered"
              }
              description={
                error
                  ? "The terminal list could not be retrieved from the backend."
                  : search
                    ? "Try another name, device ID, platform, or IP address."
                    : "Create a pairing QR code to register your first terminal."
              }
              action={
                search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className={buttonSecondary}
                  >
                    Clear search
                  </button>
                ) : !error ? (
                  <button
                    type="button"
                    onClick={openPairingDialog}
                    className={buttonPrimary}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add terminal
                  </button>
                ) : undefined
              }
            />
          )}
        </div>

        {/* Fetch timestamps */}

        {data && lastUpdated && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ctp-subtext0">
            <p>
              Terminal list fetched{" "}
              {lastUpdated.toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>

            <p>
              {metricsUpdatedAt
                ? `Metrics checked ${formatRelativeTime(
                  metricsUpdatedAt,
                  now,
                )}`
                : "Metrics not yet available"}
            </p>
          </div>
        )}
      </Section>

      <div className="divide-y divide-ctp-surface0 border-y border-ctp-surface0">
        {/* Broadcast composer */}

        <details
          open={Boolean(broadcastNotice)}
          className="group"
        >
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-1.5">
              <ChevronRight
                size={14}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-ctp-overlay1 transition-transform group-open:rotate-90"
              />

              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ctp-text">
                  Broadcast message
                </h2>

                <p className="mt-0.5 text-xs text-ctp-subtext0">
                  Send an announcement to connected terminals.
                </p>
              </div>
            </div>

            <span className="text-xs tabular-nums text-ctp-subtext0">
              {connectedCount} available recipient(s)
            </span>
          </summary>

          <div className="pb-4 pl-5">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => void sendBroadcast(event)}
            >
              <input
                aria-label="Broadcast message"
                value={broadcast}
                onChange={(event) => {
                  setBroadcast(event.target.value);
                  setBroadcastNotice(null);
                }}
                placeholder="Enter an announcement…"
                maxLength={250}
                className={`${inputClass} flex-1`}
              />

              <button
                type="submit"
                disabled={
                  connectedCount === 0 ||
                  broadcastBusy ||
                  !broadcast.trim()
                }
                className={buttonPrimary}
              >
                {broadcastBusy ? (
                  <RefreshCw
                    size={13}
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <Send size={13} aria-hidden="true" />
                )}

                {broadcastBusy
                  ? "Queuing…"
                  : "Queue broadcast"}
              </button>
            </form>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ctp-subtext0">
              <p>
                Queued messages are not considered delivered until the
                terminal displays the message and acknowledges it.
              </p>

              <p className="tabular-nums">
                {broadcast.length}/250
              </p>
            </div>

            {broadcastNotice && (
              <div className="mt-3">
                <StatusMessage notice={broadcastNotice} />
              </div>
            )}
          </div>
        </details>

        {/* Connectivity explanation */}

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-3 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="shrink-0 text-ctp-overlay1 transition-transform group-open:rotate-90"
            />

            <span className="text-sm font-semibold text-ctp-text">
              Connection metric definitions
            </span>
          </summary>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 pb-4 pl-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-ctp-text">
                HTTP heartbeat
              </dt>

              <dd className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
                Connectivity is calculated from the age of each terminal&apos;s
                last HTTP heartbeat and the configured timeout.
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-ctp-text">
                WebSocket connection
              </dt>

              <dd className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
                WebSocket status is tracked independently from HTTP
                heartbeat connectivity.
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-ctp-text">
                Ping latency
              </dt>

              <dd className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
                Ping measures WebSocket round-trip time, not Wi-Fi
                signal strength.
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-ctp-text">
                Synchronization and broadcasts
              </dt>

              <dd className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
                Commands remain queued until the mobile terminal
                processes and acknowledges them.
              </dd>
            </div>
          </dl>
        </details>
      </div>

      {/* Pairing dialog */}

      {pairingOpen && (
        <TerminalPairingDialog
          challenge={pairingChallenge}
          remainingSeconds={pairingSecondsRemaining}
          busy={pairingBusy}
          error={pairingError}
          onGenerate={() => void generatePairingCode()}
          onClose={() => void closePairingDialog()}
        />
      )}
    </div>
  );
}
