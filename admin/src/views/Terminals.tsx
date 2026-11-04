import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";

import {
  Activity,
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  Gauge,
  Lock,
  LogOut,
  Monitor,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldCheck,
  Signal,
  Smartphone,
  Unlock,
  Users,
  Wrench,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

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

const statusStyles = {
  Connected: "bg-ctp-green/10 text-ctp-green",
  Disconnected: "bg-ctp-red/10 text-ctp-red",
} as const;

const healthStyles: Record<TerminalConnectionHealth, string> = {
  Healthy: "bg-ctp-green/10 text-ctp-green",
  Degraded: "bg-ctp-yellow/10 text-ctp-yellow",
  Poor: "bg-ctp-red/10 text-ctp-red",
  Unavailable: "bg-ctp-surface0 text-ctp-overlay1",
  Measuring: "bg-ctp-blue/10 text-ctp-blue",
};

const healthDotStyles: Record<TerminalConnectionHealth, string> = {
  Healthy: "bg-ctp-green",
  Degraded: "bg-ctp-yellow",
  Poor: "bg-ctp-red",
  Unavailable: "bg-ctp-overlay1",
  Measuring: "bg-ctp-blue",
};

const terminalGridClass =
  "grid grid-cols-1 gap-3 xl:grid-cols-[minmax(230px,1.45fr)_minmax(145px,0.85fr)_minmax(130px,0.8fr)_minmax(140px,0.85fr)_minmax(310px,1.5fr)] xl:items-center";

const inputClass =
  "min-w-0 rounded-md border border-ctp-surface1 bg-ctp-base px-3 py-2 font-line-seed text-xs text-ctp-text outline-none transition-colors placeholder:text-ctp-overlay1 focus:border-ctp-mauve";

const actionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 font-line-seed text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

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
  const status = connected
    ? "Connected"
    : "Disconnected";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-line-seed text-[10px] font-bold ${statusStyles[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-ctp-green" : "bg-ctp-red"
          }`}
      />

      {status.toUpperCase()}
    </span>
  );
}

function HealthBadge({
  health,
}: {
  health: TerminalConnectionHealth;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-line-seed text-[10px] font-bold ${healthStyles[health]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${healthDotStyles[health]}`}
      />

      {health.toUpperCase()}
    </span>
  );
}

function WebSocketBadge({
  connected,
}: {
  connected: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-line-seed text-xs font-semibold ${connected
          ? "text-ctp-green"
          : "text-ctp-overlay1"
        }`}
    >
      {connected ? (
        <Wifi size={13} />
      ) : (
        <WifiOff size={13} />
      )}

      {connected ? "Connected" : "Disconnected"}
    </span>
  );
}

// --------------------------------------------------
// Shared interface components
// --------------------------------------------------

function SummaryItem({
  label,
  value,
  description,
  valueColor,
}: {
  label: string;
  value: string | number;
  description: string;
  valueColor?: string;
}) {
  return (
    <div className="min-w-0 bg-ctp-base px-3 py-3 sm:px-4">
      <p className="font-line-seed text-[10px] font-semibold uppercase tracking-wider text-ctp-subtext0">
        {label}
      </p>

      <p
        className={`mt-1 font-line-seed text-xl font-bold leading-tight tabular-nums ${valueColor ?? "text-ctp-text"
          }`}
      >
        {value}
      </p>

      <p className="mt-1 truncate font-line-seed text-[10px] text-ctp-subtext0">
        {description}
      </p>
    </div>
  );
}

function StatusMessage({
  notice,
}: {
  notice: Notice;
}) {
  return (
    <div
      role={notice.error ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-md border px-3 py-2.5 ${notice.error
          ? "border-ctp-red/20 bg-ctp-red/5"
          : "border-ctp-green/20 bg-ctp-green/5"
        }`}
    >
      {notice.error ? (
        <CircleAlert
          size={15}
          className="mt-0.5 shrink-0 text-ctp-red"
        />
      ) : (
        <CircleCheck
          size={15}
          className="mt-0.5 shrink-0 text-ctp-green"
        />
      )}

      <p className="min-w-0 break-words font-line-seed text-xs leading-relaxed text-ctp-text">
        {notice.message}
      </p>
    </div>
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
      <p className="font-line-seed text-[10px] font-medium text-ctp-subtext0">
        {label}
      </p>

      <p
        className="mt-1 break-all font-line-seed text-xs font-medium text-ctp-text"
        title={title}
      >
        {value}
      </p>

      {secondary && (
        <p className="mt-0.5 font-line-seed text-[10px] text-ctp-subtext0">
          {secondary}
        </p>
      )}
    </div>
  );
}

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="font-line-seed text-[10px] font-semibold uppercase tracking-wider text-ctp-subtext0">
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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !busy
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-pairing-title"
        className="my-auto w-full max-w-md rounded-lg border border-ctp-surface1 bg-ctp-mantle p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
              <QrCode size={19} />
            </div>

            <div className="min-w-0">
              <h2
                id="terminal-pairing-title"
                className="font-line-seed text-sm font-bold text-ctp-text"
              >
                Pair a new terminal
              </h2>

              <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
                Scan this code using the Kinesis mobile app.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close pairing dialog"
            className="rounded-md p-1.5 text-ctp-subtext0 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 flex min-h-[300px] flex-col items-center justify-center border border-ctp-surface0 bg-ctp-base p-4">
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

              <div className="mt-4 flex items-center gap-2 rounded-md bg-ctp-yellow/10 px-3 py-1.5">
                <Clock
                  size={14}
                  className="text-ctp-yellow"
                />

                <span className="font-line-seed text-sm font-bold tabular-nums text-ctp-yellow">
                  Expires in {formatCountdown(remainingSeconds)}
                </span>
              </div>

              <p className="mt-3 max-w-xs text-center font-line-seed text-xs leading-5 text-ctp-subtext0">
                Keep this dialog open while the mobile terminal scans
                the code. It can only be redeemed once.
              </p>
            </>
          ) : expired ? (
            <>
              <Clock
                size={30}
                className="text-ctp-yellow"
              />

              <p className="mt-4 font-line-seed text-sm font-bold text-ctp-text">
                Pairing code expired
              </p>

              <p className="mt-2 max-w-xs text-center font-line-seed text-xs leading-5 text-ctp-subtext0">
                This QR code is no longer valid. Generate a new one
                to continue pairing.
              </p>
            </>
          ) : busy ? (
            <>
              <RefreshCw
                size={25}
                className="animate-spin text-ctp-mauve"
              />

              <p className="mt-3 font-line-seed text-xs text-ctp-subtext0">
                Creating secure pairing code…
              </p>
            </>
          ) : (
            <>
              <QrCode
                size={30}
                className="text-ctp-overlay1"
              />

              <p className="mt-3 font-line-seed text-xs text-ctp-subtext0">
                No pairing code generated.
              </p>
            </>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 border border-ctp-red/20 bg-ctp-red/5 p-2.5"
          >
            <CircleAlert
              size={15}
              className="mt-0.5 shrink-0 text-ctp-red"
            />

            <p className="break-words font-line-seed text-xs leading-relaxed text-ctp-red">
              {error}
            </p>
          </div>
        )}

        <div className="mt-4 border border-ctp-surface0 bg-ctp-surface0/30 p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck
              size={15}
              className="mt-0.5 shrink-0 text-ctp-green"
            />

            <p className="font-line-seed text-[11px] leading-relaxed text-ctp-subtext0">
              This QR contains a temporary pairing secret. It expires
              after five minutes and is invalidated after its first
              successful use. The permanent terminal credential is
              issued separately and stored securely on the mobile device.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-ctp-surface1 px-4 py-2 font-line-seed text-xs font-semibold text-ctp-text transition-colors hover:bg-ctp-surface0 disabled:opacity-40"
          >
            Cancel pairing
          </button>

          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ctp-mauve px-4 py-2 font-line-seed text-xs font-bold text-ctp-crust transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <RefreshCw
                size={14}
                className="animate-spin"
              />
            ) : (
              <QrCode size={14} />
            )}

            {challenge && !expired
              ? "Generate new code"
              : "Generate QR code"}
          </button>
        </div>

        <p className="mt-3 text-center font-line-seed text-[10px] text-ctp-overlay1">
          Pairing is available only to administrators with an authenticated
          session.
        </p>
      </section>
    </div>
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

  const tablet =
    /tablet|monitor/i.test(terminal.device_type);

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
    <article className="px-3 py-4 transition-colors hover:bg-ctp-surface0/20 sm:px-4">
      <div className={terminalGridClass}>
        {/* Device identity */}

        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${connected
                ? "bg-ctp-blue/10 text-ctp-blue"
                : "bg-ctp-surface0 text-ctp-overlay1"
              }`}
          >
            {tablet ? (
              <Monitor size={18} />
            ) : (
              <Smartphone size={18} />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="break-words font-line-seed text-sm font-bold text-ctp-text">
              {terminal.name}
            </h3>

            <p className="mt-0.5 break-words font-line-seed text-[11px] text-ctp-subtext0">
              {terminal.terminal_code}
              <span className="px-1">·</span>
              {terminal.device_type}
              <span className="px-1">·</span>
              {terminal.platform}
            </p>

            <p className="mt-1 break-all font-mono text-[10px] text-ctp-overlay1">
              {terminal.device_id}
            </p>

            {terminal.app_version && (
              <p className="mt-1 font-line-seed text-[10px] text-ctp-overlay1">
                App version {terminal.app_version}
              </p>
            )}
          </div>
        </div>

        {/* Connection status */}

        <div className="min-w-0">
          <SectionLabel>Connection</SectionLabel>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge connected={connected} />

            <HealthBadge
              health={terminal.connection_health}
            />
          </div>

          {(terminal.maintenance_mode || disabled) && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {terminal.maintenance_mode && (
                <span className="inline-flex items-center gap-1 font-line-seed text-[10px] font-semibold text-ctp-yellow">
                  <Wrench size={11} />
                  Maintenance
                </span>
              )}

              {disabled && (
                <span className="inline-flex items-center gap-1 font-line-seed text-[10px] font-semibold text-ctp-red">
                  <Lock size={11} />
                  Access disabled
                </span>
              )}
            </div>
          )}
        </div>

        {/* HTTP heartbeat */}

        <div className="min-w-0">
          <SectionLabel>HTTP heartbeat</SectionLabel>

          <p className="mt-1.5 font-line-seed text-xs font-semibold text-ctp-text">
            {formatRelativeTime(
              terminal.last_seen_at,
              now,
            )}
          </p>

          <p className="mt-0.5 font-line-seed text-[10px] text-ctp-subtext0">
            {connected
              ? `Within ${heartbeatTimeoutSeconds}s timeout`
              : "Expired or unavailable"}
          </p>

          <p
            className="mt-1 font-line-seed text-[10px] text-ctp-overlay1"
            title={formatDateTime(terminal.last_seen_at)}
          >
            {formatDateTime(terminal.last_seen_at)}
          </p>
        </div>

        {/* WebSocket and latency */}

        <div className="min-w-0">
          <SectionLabel>WebSocket</SectionLabel>

          <div className="mt-1.5">
            <WebSocketBadge
              connected={terminal.websocket_connected}
            />
          </div>

          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="font-line-seed text-[10px] text-ctp-subtext0">
              Ping
            </span>

            <span
              className={`font-line-seed text-sm font-bold tabular-nums ${latencyColor}`}
            >
              {terminal.websocket_connected
                ? latency === null
                  ? "Measuring…"
                  : formatLatency(latency)
                : "—"}
            </span>
          </div>

          {terminal.consecutive_ping_timeouts > 0 && (
            <p className="mt-1 font-line-seed text-[10px] text-ctp-red">
              {terminal.consecutive_ping_timeouts} missed ping(s)
            </p>
          )}
        </div>

        {/* Terminal actions */}

        <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
          <button
            type="button"
            onClick={() => void onSync(terminal)}
            disabled={!connected || disabled || busy}
            className={`${actionClass} border-ctp-surface1 text-ctp-text hover:border-ctp-blue/50 hover:text-ctp-blue`}
            title={
              connected
                ? "Queue a synchronization request"
                : "Terminal must have a recent heartbeat to request sync"
            }
          >
            <RefreshCw
              size={13}
              className={
                busyAction === "sync"
                  ? "animate-spin"
                  : ""
              }
            />

            Sync
          </button>

          <button
            type="button"
            onClick={() => void onMaintenance(terminal)}
            disabled={disabled || busy}
            className={`${actionClass} ${terminal.maintenance_mode
                ? "border-ctp-yellow/30 bg-ctp-yellow/5 text-ctp-yellow hover:bg-ctp-yellow/10"
                : "border-ctp-surface1 text-ctp-text hover:border-ctp-yellow/50 hover:text-ctp-yellow"
              }`}
            title={
              terminal.maintenance_mode
                ? "End maintenance mode"
                : "Place terminal into maintenance mode"
            }
          >
            {busyAction === "maintenance" ? (
              <RefreshCw
                size={13}
                className="animate-spin"
              />
            ) : terminal.maintenance_mode ? (
              <Unlock size={13} />
            ) : (
              <Lock size={13} />
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
              className={`${actionClass} border-ctp-green/30 text-ctp-green hover:bg-ctp-green/10`}
            >
              {busyAction === "enable" ? (
                <RefreshCw
                  size={13}
                  className="animate-spin"
                />
              ) : (
                <Check size={13} />
              )}

              Enable access
            </button>
          ) : confirmDisable ? (
            <div
              className="flex flex-wrap items-center gap-1.5 border border-ctp-red/20 bg-ctp-red/5 p-1.5"
              role="group"
              aria-label={`Confirm disabling ${terminal.name}`}
            >
              <span className="px-1 font-line-seed text-[11px] text-ctp-red">
                Disable access?
              </span>

              <button
                type="button"
                onClick={() => void onDisable(terminal)}
                disabled={busy}
                className={`${actionClass} border-ctp-red bg-ctp-red text-ctp-base hover:bg-ctp-red/80`}
              >
                {busyAction === "disable" ? (
                  <RefreshCw
                    size={13}
                    className="animate-spin"
                  />
                ) : (
                  <Check size={13} />
                )}

                Confirm
              </button>

              <button
                type="button"
                onClick={() => onConfirmDisable(false)}
                disabled={busy}
                className={`${actionClass} border-ctp-surface1 text-ctp-text hover:bg-ctp-surface0`}
              >
                <X size={13} />
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onConfirmDisable(true)}
              disabled={busy}
              className={`${actionClass} border-ctp-red/20 bg-ctp-red/5 text-ctp-red hover:bg-ctp-red/10`}
            >
              <LogOut size={13} />
              Disable access
            </button>
          )}
        </div>
      </div>

      {/* Additional device information */}

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ctp-surface0 pt-3 sm:grid-cols-4">
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
      </div>

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

  const totalCount = terminals.length;

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

  const healthColor = !data
    ? "text-ctp-subtext0"
    : connectedCount === 0
      ? "text-ctp-yellow"
      : "text-ctp-green";

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
    <div className="flex flex-col gap-4 font-line-seed">
      {/* Page header */}

      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="font-line-seed text-[10px] font-bold uppercase tracking-[0.14em] text-ctp-mauve">
            Operations
          </p>

          <h1 className="mt-1 text-lg font-bold text-ctp-text">
            Terminal Management
          </h1>

          <p className="mt-1 text-xs text-ctp-subtext0">
            Monitor connected devices, manage access, and handle synchronization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 border border-ctp-green/20 bg-ctp-green/5 px-2.5 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ctp-green" />

            <span className="font-line-seed text-[11px] font-semibold text-ctp-green">
              Admin authenticated
            </span>
          </div>

          <button
            type="button"
            onClick={openPairingDialog}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ctp-mauve px-3 py-2 font-line-seed text-xs font-bold text-ctp-crust transition-colors hover:bg-ctp-mauve/80"
          >
            <Plus size={15} />
            Add terminal
          </button>
        </div>
      </header>

      {pairingNotice && (
        <StatusMessage notice={pairingNotice} />
      )}

      {/* Terminal summary */}

      <section
        aria-label="Terminal summary"
        className="grid grid-cols-2 gap-px overflow-hidden border border-ctp-surface0 bg-ctp-surface0 sm:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryItem
          label="Registered"
          value={data ? data.total_count : "—"}
          description="Total registered devices"
        />

        <SummaryItem
          label="Connected"
          value={data ? connectedCount : "—"}
          description="Fresh HTTP heartbeats"
          valueColor="text-ctp-green"
        />

        <SummaryItem
          label="Disconnected"
          value={data ? disconnectedCount : "—"}
          description="No fresh heartbeat"
          valueColor={
            disconnectedCount > 0
              ? "text-ctp-red"
              : "text-ctp-text"
          }
        />

        <SummaryItem
          label="Maintenance"
          value={data ? maintenanceCount : "—"}
          description="Devices in maintenance"
          valueColor={
            maintenanceCount > 0
              ? "text-ctp-yellow"
              : "text-ctp-text"
          }
        />

        <SummaryItem
          label="Average ping"
          value={
            averageLatency === null
              ? "—"
              : `${averageLatency} ms`
          }
          description={`${measuredLatencies.length} measured device(s)`}
          valueColor="text-ctp-mauve"
        />
      </section>

      {/* Network status */}

      <section className="overflow-hidden border border-ctp-surface0 bg-ctp-base">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ctp-surface0 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Signal
              size={15}
              className="text-ctp-blue"
            />

            <h2 className="font-line-seed text-xs font-bold text-ctp-text">
              Network status
            </h2>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 font-line-seed text-[11px] font-semibold ${healthColor}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${networkStatus === "Online"
                  ? "bg-ctp-green"
                  : networkStatus === "Offline"
                    ? "bg-ctp-red"
                    : "bg-ctp-yellow"
                }`}
            />

            {data
              ? networkStatus
              : loading
                ? "Checking…"
                : "Unknown"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <SectionLabel>API endpoint</SectionLabel>

            <p className="mt-1 break-all font-mono text-xs font-semibold text-ctp-text">
              {window.location.origin}
            </p>

            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              Same-origin FastAPI proxy
            </p>
          </div>

          <div className="min-w-0">
            <SectionLabel>Heartbeat policy</SectionLabel>

            <p className="mt-1 font-line-seed text-xs font-semibold text-ctp-text">
              {heartbeatTimeoutSeconds} second timeout
            </p>

            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              Devices must report within this window
            </p>
          </div>

          <div className="min-w-0">
            <SectionLabel>Connection quality</SectionLabel>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1 font-line-seed text-[11px] font-semibold text-ctp-green">
                <span className="h-1.5 w-1.5 rounded-full bg-ctp-green" />
                {healthyCount} healthy
              </span>

              <span className="inline-flex items-center gap-1 font-line-seed text-[11px] font-semibold text-ctp-yellow">
                <span className="h-1.5 w-1.5 rounded-full bg-ctp-yellow" />
                {degradedCount} degraded
              </span>

              <span className="inline-flex items-center gap-1 font-line-seed text-[11px] font-semibold text-ctp-red">
                <span className="h-1.5 w-1.5 rounded-full bg-ctp-red" />
                {poorCount} poor
              </span>
            </div>

            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              Based on WebSocket measurements
            </p>
          </div>

          <div className="min-w-0">
            <SectionLabel>Last metrics update</SectionLabel>

            <p className="mt-1 font-line-seed text-xs font-semibold text-ctp-text">
              {metricsUpdatedAt
                ? formatRelativeTime(metricsUpdatedAt, now)
                : "Not available"}
            </p>

            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              Updated independently from terminal details
            </p>
          </div>
        </div>
      </section>

      {/* Metrics error */}

      {metricsError && (
        <div
          role="status"
          className="flex items-start gap-2 border border-ctp-yellow/20 bg-ctp-yellow/5 p-3"
        >
          <CircleAlert
            size={15}
            className="mt-0.5 shrink-0 text-ctp-yellow"
          />

          <div className="min-w-0">
            <p className="font-line-seed text-xs font-semibold text-ctp-yellow">
              Connection metrics unavailable
            </p>

            <p className="mt-1 break-words font-line-seed text-xs leading-relaxed text-ctp-subtext1">
              {metricsError}
            </p>
          </div>
        </div>
      )}

      {/* API error */}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border border-ctp-red/20 bg-ctp-red/5 p-3"
        >
          <CircleAlert
            size={16}
            className="mt-0.5 shrink-0 text-ctp-red"
          />

          <div className="min-w-0 flex-1">
            <p className="font-line-seed text-xs font-semibold text-ctp-red">
              Could not load terminals
            </p>

            <p className="mt-1 break-words font-line-seed text-xs leading-relaxed text-ctp-subtext1">
              {error}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className={`${actionClass} border-ctp-red/20 text-ctp-red`}
          >
            <RefreshCw
              size={13}
              className={
                refreshing ? "animate-spin" : ""
              }
            />
            Retry
          </button>
        </div>
      )}

      {/* Terminal list */}

      <section className="overflow-hidden border border-ctp-surface0 bg-ctp-base">
        {/* List header and controls */}

        <div className="flex flex-col gap-3 border-b border-ctp-surface0 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-line-seed text-sm font-bold text-ctp-text">
                Registered terminals
              </h2>

              <span className="rounded bg-ctp-surface0 px-1.5 py-0.5 font-line-seed text-[10px] font-semibold text-ctp-subtext0">
                {data ? data.total_count : "—"}
              </span>
            </div>

            <p className="mt-1 font-line-seed text-[11px] text-ctp-subtext0">
              Manage device connections, synchronization, and access.
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:max-w-md">
            <div className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ctp-overlay1"
              />

              <input
                aria-label="Search terminals"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, ID, IP…"
                className={`${inputClass} w-full pl-9 pr-9`}
              />

              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ctp-subtext0 transition-colors hover:text-ctp-text"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              title="Refresh terminal list"
              className={`${actionClass} shrink-0 border-ctp-surface1 px-3 py-2 text-ctp-text hover:border-ctp-blue/50 hover:text-ctp-blue`}
            >
              <RefreshCw
                size={13}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />

              Refresh
            </button>
          </div>
        </div>

        {/* Result information */}

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ctp-surface0 bg-ctp-surface0/20 px-3 py-2">
          <p className="font-line-seed text-[10px] text-ctp-subtext0">
            {data
              ? `Showing ${terminals.length} of ${data.total_count} registered terminal(s)`
              : "Terminal data unavailable"}
          </p>

          <span
            className={`inline-flex items-center gap-1.5 font-line-seed text-[10px] font-semibold ${connectedCount > 0
                ? "text-ctp-green"
                : "text-ctp-overlay1"
              }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connectedCount > 0
                  ? "bg-ctp-green"
                  : "bg-ctp-overlay1"
                }`}
            />

            {connectedCount} heartbeat-connected
          </span>
        </div>

        {/* Column labels */}

        {terminals.length > 0 && !loading && (
          <div
            className={`${terminalGridClass} hidden border-b border-ctp-surface0 bg-ctp-surface0/20 px-4 py-2 xl:grid`}
          >
            <SectionLabel>Device</SectionLabel>
            <SectionLabel>Connection</SectionLabel>
            <SectionLabel>Heartbeat</SectionLabel>
            <SectionLabel>WebSocket</SectionLabel>
            <SectionLabel>
              <span className="sr-only">Actions</span>
            </SectionLabel>
          </div>
        )}

        {/* Terminal content */}

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12">
            <RefreshCw
              size={15}
              className="animate-spin text-ctp-mauve"
            />

            <span className="font-line-seed text-xs text-ctp-subtext0">
              Loading terminals…
            </span>
          </div>
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
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <Search
              size={22}
              className="mb-3 text-ctp-overlay1"
            />

            <p className="font-line-seed text-sm font-semibold text-ctp-text">
              {error
                ? "Terminal information unavailable"
                : search
                  ? "No matching terminals"
                  : "No terminals registered"}
            </p>

            <p className="mt-1 max-w-sm font-line-seed text-xs leading-relaxed text-ctp-subtext0">
              {error
                ? "The terminal list could not be retrieved from the backend."
                : search
                  ? "Try another name, device ID, platform, or IP address."
                  : "Create a pairing QR code to register your first terminal."}
            </p>

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-3 rounded-md border border-ctp-surface1 px-3 py-1.5 font-line-seed text-xs font-semibold text-ctp-text transition-colors hover:bg-ctp-surface0"
              >
                Clear search
              </button>
            )}

            {!search && !error && (
              <button
                type="button"
                onClick={openPairingDialog}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-ctp-mauve px-3 py-2 font-line-seed text-xs font-bold text-ctp-crust transition-colors hover:bg-ctp-mauve/80"
              >
                <Plus size={14} />
                Add terminal
              </button>
            )}
          </div>
        )}

        {/* Fetch timestamps */}

        {data && lastUpdated && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ctp-surface0 bg-ctp-surface0/20 px-3 py-2">
            <p className="font-line-seed text-[10px] text-ctp-subtext0">
              Terminal list fetched{" "}
              {lastUpdated.toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>

            <p className="font-line-seed text-[10px] text-ctp-subtext0">
              {metricsUpdatedAt
                ? `Metrics checked ${formatRelativeTime(
                  metricsUpdatedAt,
                  now,
                )}`
                : "Metrics not yet available"}
            </p>
          </div>
        )}
      </section>

      {/* Broadcast composer */}

      <details
        open={Boolean(broadcastNotice)}
        className="group overflow-hidden border border-ctp-surface0 bg-ctp-base"
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-ctp-surface0/20 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
              <Radio size={16} />
            </div>

            <div className="min-w-0">
              <h2 className="font-line-seed text-xs font-bold text-ctp-text">
                Broadcast message
              </h2>

              <p className="mt-0.5 font-line-seed text-[10px] text-ctp-subtext0">
                Send an announcement to connected terminals.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-line-seed text-[10px] font-semibold text-ctp-subtext0">
              {connectedCount} available recipient(s)
            </span>

            <span className="text-ctp-overlay1 transition-transform group-open:rotate-180">
              ▾
            </span>
          </div>
        </summary>

        <div className="border-t border-ctp-surface0 p-3">
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
              className="inline-flex items-center justify-center gap-2 rounded-md bg-ctp-mauve px-4 py-2 font-line-seed text-xs font-bold text-ctp-crust transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {broadcastBusy ? (
                <RefreshCw
                  size={13}
                  className="animate-spin"
                />
              ) : (
                <Send size={13} />
              )}

              {broadcastBusy
                ? "Queuing…"
                : "Queue broadcast"}
            </button>
          </form>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-line-seed text-[10px] text-ctp-subtext0">
              <Users size={12} />
              {connectedCount} available recipient(s)
            </p>

            <p className="font-line-seed text-[10px] text-ctp-subtext0">
              {broadcast.length}/250
            </p>
          </div>

          {broadcastNotice && (
            <div className="mt-3">
              <StatusMessage notice={broadcastNotice} />
            </div>
          )}

          <p className="mt-3 font-line-seed text-[10px] leading-relaxed text-ctp-subtext0">
            Queued messages are not considered delivered until the terminal
            displays the message and acknowledges it.
          </p>
        </div>
      </details>

      {/* Connectivity explanation */}

      <details className="border border-ctp-surface0 bg-ctp-base">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 transition-colors hover:bg-ctp-surface0/20 [&::-webkit-details-marker]:hidden">
          <Server
            size={14}
            className="shrink-0 text-ctp-overlay1"
          />

          <span className="font-line-seed text-[11px] font-semibold text-ctp-subtext0">
            Connection metric definitions
          </span>

          <span className="ml-auto text-ctp-overlay1">
            ▾
          </span>
        </summary>

        <div className="border-t border-ctp-surface0 px-3 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="font-line-seed text-[11px] font-semibold text-ctp-text">
                HTTP heartbeat
              </p>

              <p className="mt-1 font-line-seed text-[10px] leading-relaxed text-ctp-subtext0">
                Connectivity is calculated from the age of each terminal&apos;s
                last HTTP heartbeat and the configured timeout.
              </p>
            </div>

            <div>
              <p className="font-line-seed text-[11px] font-semibold text-ctp-text">
                WebSocket connection
              </p>

              <p className="mt-1 font-line-seed text-[10px] leading-relaxed text-ctp-subtext0">
                WebSocket status is tracked independently from HTTP
                heartbeat connectivity.
              </p>
            </div>

            <div>
              <p className="font-line-seed text-[11px] font-semibold text-ctp-text">
                Ping latency
              </p>

              <p className="mt-1 font-line-seed text-[10px] leading-relaxed text-ctp-subtext0">
                Ping measures WebSocket round-trip time, not Wi-Fi
                signal strength.
              </p>
            </div>

            <div>
              <p className="font-line-seed text-[11px] font-semibold text-ctp-text">
                Synchronization and broadcasts
              </p>

              <p className="mt-1 font-line-seed text-[10px] leading-relaxed text-ctp-subtext0">
                Commands remain queued until the mobile terminal
                processes and acknowledges them.
              </p>
            </div>
          </div>
        </div>
      </details>

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
