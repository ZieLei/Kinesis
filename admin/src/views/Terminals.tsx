import { useState, type FormEvent } from "react";
import {
  Activity,
  Wifi,
  WifiOff,
  Smartphone,
  Monitor,
  RefreshCw,
  Lock,
  Unlock,
  LogOut,
  Radio,
  Send,
  Search,
  CircleCheck,
  CircleAlert,
  Clock,
  Signal,
  X,
  Check,
  Wrench,
  Users,
  Server,
  KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useTerminalManagement } from "../hooks/useTerminalManagement";
import {
  broadcastToTerminals,
  disableTerminal,
  enableTerminal,
  requestTerminalSync,
  updateTerminalMaintenance,
} from "../lib/terminalApi";
import type { ManagedTerminal } from "../types/terminal";

type Notice = {
  message: string;
  error: boolean;
};

const TOKEN_STORAGE_KEY = "kinesis-admin-api-token";

const statusStyles = {
  Connected: "bg-ctp-green/10 text-ctp-green",
  Disconnected: "bg-ctp-red/10 text-ctp-red",
} as const;

function readStoredToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function StatusBadge({
  status,
}: {
  status: ManagedTerminal["status"];
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-line-seed text-[10px] font-bold ${statusStyles[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "Connected" ? "bg-ctp-green" : "bg-ctp-red"
          }`}
      />
      {status.toUpperCase()}
    </span>
  );
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0">
        <p className="font-line-seed text-xs font-medium text-ctp-subtext0">
          {label}
        </p>
        <p className="mt-0.5 font-line-seed text-xl font-bold leading-tight text-ctp-text">
          {value}
        </p>
        <p className="mt-1 truncate font-line-seed text-[11px] text-ctp-subtext0">
          {description}
        </p>
      </div>
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
      role="status"
      className={`mt-3 flex items-start gap-2 rounded-md border p-2.5 ${notice.error
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

function formatDateTime(value: string | null): string {
  if (!value) return "Never";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: undefined,
  });
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "Never";

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "Unknown";

  const difference = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(difference / 1000);

  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} hr ago`;

  return `${Math.floor(hours / 24)} day(s) ago`;
}

function TerminalRow({
  terminal,
  token,
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
  token: string;
  notice?: Notice;
  confirmDisable: boolean;
  busyAction: string | null;
  onNotice: (notice: Notice) => void;
  onConfirmDisable: (confirm: boolean) => void;
  onSync: (terminal: ManagedTerminal) => Promise<void>;
  onMaintenance: (terminal: ManagedTerminal) => Promise<void>;
  onDisable: (terminal: ManagedTerminal) => Promise<void>;
  onEnable: (terminal: ManagedTerminal) => Promise<void>;
}) {
  const connected = terminal.status === "Connected";
  const disabled = !terminal.is_enabled;
  const busy = busyAction !== null;
  const tablet = /tablet|monitor/i.test(terminal.device_type);

  const actionClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 font-line-seed text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <article className="p-3 transition-colors hover:bg-ctp-surface0/20">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${connected
              ? "bg-ctp-blue/10 text-ctp-blue"
              : "bg-ctp-surface0 text-ctp-overlay1"
              }`}
          >
            {tablet ? <Monitor size={18} /> : <Smartphone size={18} />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="break-words font-line-seed text-sm font-bold text-ctp-text">
                {terminal.name}
              </h3>

              <StatusBadge status={terminal.status} />

              {terminal.maintenance_mode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ctp-yellow/10 px-2 py-0.5 font-line-seed text-[10px] font-bold text-ctp-yellow">
                  <Wrench size={10} />
                  MAINTENANCE
                </span>
              )}

              {disabled && (
                <span className="rounded-full bg-ctp-red/10 px-2 py-0.5 font-line-seed text-[10px] font-bold text-ctp-red">
                  ACCESS DISABLED
                </span>
              )}
            </div>

            <p className="mt-1 break-words font-line-seed text-[11px] text-ctp-subtext0">
              {terminal.terminal_code}
              <span className="px-1">·</span>
              {terminal.device_type}
              <span className="px-1">·</span>
              {terminal.platform}
              {terminal.app_version && (
                <>
                  <span className="px-1">·</span>
                  v{terminal.app_version}
                </>
              )}
            </p>

            <p className="mt-1 break-all font-mono text-[10px] text-ctp-overlay1">
              Device ID: {terminal.device_id}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
          <button
            type="button"
            onClick={() => void onSync(terminal)}
            disabled={!connected || disabled || busy || !token}
            className={`${actionClass} border-ctp-surface1 text-ctp-text hover:border-ctp-blue/50 hover:text-ctp-blue`}
            title={
              connected
                ? "Queue a synchronization request"
                : "Terminal must be connected to request sync"
            }
          >
            <RefreshCw
              size={13}
              className={busyAction === "sync" ? "animate-spin" : ""}
            />
            Sync
          </button>

          <button
            type="button"
            onClick={() => void onMaintenance(terminal)}
            disabled={disabled || busy || !token}
            className={`${actionClass} ${terminal.maintenance_mode
              ? "border-ctp-yellow/30 text-ctp-yellow hover:bg-ctp-yellow/5"
              : "border-ctp-surface1 text-ctp-text hover:border-ctp-yellow/50 hover:text-ctp-yellow"
              }`}
          >
            {terminal.maintenance_mode ? (
              <Unlock size={13} />
            ) : (
              <Lock size={13} />
            )}
            {terminal.maintenance_mode ? "End maintenance" : "Maintenance"}
          </button>

          {disabled ? (
            <button
              type="button"
              onClick={() => void onEnable(terminal)}
              disabled={busy || !token}
              className={`${actionClass} border-ctp-green/30 text-ctp-green hover:bg-ctp-green/10`}
            >
              <Check size={13} />
              Enable access
            </button>
          ) : confirmDisable ? (
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-md border border-ctp-red/20 bg-ctp-red/5 p-1.5"
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
                <Check size={13} />
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
              disabled={busy || !token}
              className={`${actionClass} border-ctp-red/20 bg-ctp-red/5 text-ctp-red hover:bg-ctp-red/10`}
            >
              <LogOut size={13} />
              Disable access
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-ctp-surface0/30 px-3 py-2.5 sm:grid-cols-4">
        <div className="min-w-0">
          <p className="font-line-seed text-[10px] text-ctp-subtext0">
            IP address
          </p>
          <p className="mt-1 break-all font-mono text-xs text-ctp-text">
            {terminal.ip_address ?? "Not reported"}
          </p>
        </div>

        <div className="min-w-0">
          <p className="font-line-seed text-[10px] text-ctp-subtext0">
            First registered
          </p>
          <p
            className="mt-1 break-words font-line-seed text-xs text-ctp-text"
            title={formatDateTime(terminal.first_seen_at)}
          >
            {formatDateTime(terminal.first_seen_at)}
          </p>
        </div>

        <div className="min-w-0">
          <p className="font-line-seed text-[10px] text-ctp-subtext0">
            Last heartbeat
          </p>
          <p
            className="mt-1 font-line-seed text-xs text-ctp-text"
            title={formatDateTime(terminal.last_seen_at)}
          >
            {formatRelativeTime(terminal.last_seen_at)}
          </p>
        </div>

        <div className="min-w-0">
          <p className="font-line-seed text-[10px] text-ctp-subtext0">
            Last successful sync
          </p>
          <p
            className="mt-1 font-line-seed text-xs text-ctp-text"
            title={formatDateTime(terminal.last_sync_at)}
          >
            {formatRelativeTime(terminal.last_sync_at)}
          </p>
        </div>
      </div>

      {notice && <StatusMessage notice={notice} />}
    </article>
  );
}

export default function Terminals() {
  const [token, setToken] = useState(readStoredToken);
  const [tokenInput, setTokenInput] = useState(readStoredToken);
  const [search, setSearch] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [broadcastNotice, setBroadcastNotice] = useState<Notice | null>(null);
  const [tokenNotice, setTokenNotice] = useState("");
  const [confirmDisable, setConfirmDisable] = useState<number | null>(null);
  const [notices, setNotices] = useState<Record<number, Notice>>({});
  const [busyActions, setBusyActions] = useState<
    Record<number, string | null>
  >({});
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  const {
    data,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
  } = useTerminalManagement(token, search);

  const terminals = data?.items ?? [];
  const connectedCount = data?.connected_count ?? 0;
  const disconnectedCount = data?.disconnected_count ?? 0;
  const totalCount = data?.total_count ?? 0;
  const maintenanceCount = data?.maintenance_count ?? 0;

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

  const inputClass =
    "min-w-0 rounded-md border border-ctp-surface0 bg-ctp-base px-3 py-2 font-line-seed text-sm text-ctp-text outline-none placeholder:text-ctp-overlay1 focus:border-ctp-mauve";

  const actionClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 font-line-seed text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  function saveTerminalNotice(id: number, notice: Notice) {
    setNotices((current) => ({
      ...current,
      [id]: notice,
    }));
  }

  function setBusy(id: number, action: string | null) {
    setBusyActions((current) => ({
      ...current,
      [id]: action,
    }));
  }

  function connectAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextToken = tokenInput.trim();

    if (!nextToken) {
      setTokenNotice("Enter the admin API token.");
      return;
    }

    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    } catch {
      // Keep the token in React state if session storage is unavailable.
    }

    setNotices({});
    setTokenNotice("");
    setToken(nextToken);
  }

  function disconnectAdmin() {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // The application can still clear its in-memory token.
    }

    setToken("");
    setTokenInput("");
    setTokenNotice("");
    setNotices({});
    setBroadcast("");
    setBroadcastNotice(null);
    setConfirmDisable(null);
  }

  async function handleSync(terminal: ManagedTerminal) {
    if (!token) return;

    setBusy(terminal.id, "sync");
    saveTerminalNotice(terminal.id, {
      message: "Sending sync request…",
      error: false,
    });

    try {
      const response = await requestTerminalSync(token, terminal.id);

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message:
          requestError instanceof Error
            ? requestError.message
            : "The sync request failed.",
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  async function handleMaintenance(terminal: ManagedTerminal) {
    if (!token) return;

    const nextValue = !terminal.maintenance_mode;

    setBusy(terminal.id, "maintenance");

    try {
      const response = await updateTerminalMaintenance(
        token,
        terminal.id,
        nextValue,
      );

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message:
          requestError instanceof Error
            ? requestError.message
            : "Maintenance mode could not be updated.",
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  async function handleDisable(terminal: ManagedTerminal) {
    if (!token) return;

    setBusy(terminal.id, "disable");

    try {
      const response = await disableTerminal(token, terminal.id);

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      setConfirmDisable(null);
      refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message:
          requestError instanceof Error
            ? requestError.message
            : "Terminal access could not be disabled.",
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  async function handleEnable(terminal: ManagedTerminal) {
    if (!token) return;

    setBusy(terminal.id, "enable");

    try {
      const response = await enableTerminal(token, terminal.id);

      saveTerminalNotice(terminal.id, {
        message: response.message,
        error: false,
      });

      refresh();
    } catch (requestError) {
      saveTerminalNotice(terminal.id, {
        message:
          requestError instanceof Error
            ? requestError.message
            : "Terminal access could not be enabled.",
        error: true,
      });
    } finally {
      setBusy(terminal.id, null);
    }
  }

  async function sendBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setBroadcastNotice({
        message: "Connect to the admin API first.",
        error: true,
      });
      return;
    }

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
      const response = await broadcastToTerminals(token, broadcast.trim());

      setBroadcastNotice({
        message:
          `${response.message} ` +
          `${response.commands_created} command(s) queued for ` +
          `${response.recipient_count} terminal(s).`,
        error: false,
      });

      setBroadcast("");
      refresh();
    } catch (requestError) {
      setBroadcastNotice({
        message:
          requestError instanceof Error
            ? requestError.message
            : "The broadcast could not be queued.",
        error: true,
      });
    } finally {
      setBroadcastBusy(false);
    }
  }

  const apiConnected = Boolean(token) && !error && data !== null;

  return (
    <div className="flex flex-col gap-4 font-line-seed">
      {/* Header */}
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-ctp-text">
            Terminal Management
          </h1>
          <p className="mt-1 text-xs text-ctp-subtext0">
            Monitor registered devices and manage terminal access.
          </p>
        </div>

        <div
          className={`inline-flex w-fit items-center gap-2 rounded-md border px-2.5 py-1.5 ${apiConnected
            ? "border-ctp-green/20 bg-ctp-green/5"
            : "border-ctp-yellow/20 bg-ctp-yellow/5"
            }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${apiConnected ? "bg-ctp-green" : "bg-ctp-yellow"
              }`}
          />
          <span
            className={`text-xs font-semibold ${apiConnected ? "text-ctp-green" : "text-ctp-yellow"
              }`}
          >
            {apiConnected ? "Admin API connected" : "Admin API not connected"}
          </span>
        </div>
      </header>

      {/* Admin API authentication */}
      <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
            <KeyRound size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-ctp-text">
              Admin API access
            </h2>
            <p className="text-xs text-ctp-subtext0">
              Authenticate with the token configured on your FastAPI server.
            </p>
          </div>

          {token && (
            <button
              type="button"
              onClick={disconnectAdmin}
              className={`${actionClass} border-ctp-surface1 text-ctp-subtext1 hover:text-ctp-red`}
            >
              <LogOut size={13} />
              Clear token
            </button>
          )}
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={connectAdmin}
        >
          <input
            type="password"
            value={tokenInput}
            onChange={(event) => {
              setTokenInput(event.target.value);
              setTokenNotice("");
            }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Admin API token"
            placeholder="Enter KINESIS_ADMIN_API_TOKEN"
            className={`${inputClass} flex-1`}
          />

          <button
            type="submit"
            disabled={!tokenInput.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ctp-mauve px-4 py-2 text-xs font-bold text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={14} />
            Connect
          </button>
        </form>

        {tokenNotice && (
          <p role="alert" className="mt-2 text-xs text-ctp-red">
            {tokenNotice}
          </p>
        )}

        {!token && (
          <p className="mt-2 text-[11px] leading-relaxed text-ctp-subtext0">
            The token is held for this browser tab session. It is not included
            in the production bundle.
          </p>
        )}
      </section>

      {/* Summary */}
      <section
        aria-label="Terminal summary"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Connected terminals"
          value={data ? `${connectedCount} / ${totalCount}` : "—"}
          description="Registered devices with recent heartbeats"
          icon={Smartphone}
          color="bg-ctp-blue/10 text-ctp-blue"
        />

        <StatCard
          label="Network status"
          value={networkStatus}
          description={
            data
              ? `Heartbeat timeout: ${data.heartbeat_timeout_seconds}s`
              : "Waiting for API data"
          }
          icon={connectedCount > 0 ? Wifi : WifiOff}
          color={
            connectedCount > 0
              ? "bg-ctp-green/10 text-ctp-green"
              : "bg-ctp-yellow/10 text-ctp-yellow"
          }
        />

        <StatCard
          label="Maintenance"
          value={data ? maintenanceCount : "—"}
          description="Connected devices in maintenance"
          icon={Wrench}
          color="bg-ctp-yellow/10 text-ctp-yellow"
        />

        <StatCard
          label="Disconnected"
          value={data ? disconnectedCount : "—"}
          description="Registered devices not recently seen"
          icon={Activity}
          color="bg-ctp-red/10 text-ctp-red"
        />
      </section>

      {/* Network overview */}
      <section className="rounded-lg border border-ctp-surface0 bg-ctp-base">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ctp-blue/10 text-ctp-blue">
              <Signal size={18} />
            </div>

            <div>
              <h2 className="text-sm font-bold text-ctp-text">
                Network overview
              </h2>
              <p className="text-xs text-ctp-subtext0">
                Backend-reported terminal health
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6 sm:text-right">
            <div>
              <p className="text-[11px] text-ctp-subtext0">API endpoint</p>
              <p className="mt-1 break-all font-mono text-xs font-semibold text-ctp-text">
                {import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
                  "http://127.0.0.1:8000"}
              </p>
              <p className="mt-1 text-[10px] text-ctp-subtext0">
                FastAPI server
              </p>
            </div>

            <div>
              <p className="text-[11px] text-ctp-subtext0">Connection health</p>
              <p className={`mt-1 text-sm font-bold ${healthColor}`}>
                {data ? networkStatus : loading ? "Checking…" : "Unknown"}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-ctp-subtext0 sm:justify-end">
                <Clock size={11} />
                {data
                  ? `Heartbeat timeout ${data.heartbeat_timeout_seconds}s`
                  : "Awaiting authentication"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* API error */}
      {token && error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-ctp-red/20 bg-ctp-red/5 p-3"
        >
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-ctp-red" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ctp-red">
              Could not load terminals
            </p>
            <p className="mt-1 break-words text-xs leading-relaxed text-ctp-subtext1">
              {error}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className={`${actionClass} border-ctp-red/20 text-ctp-red`}
          >
            Retry
          </button>
        </div>
      )}

      {/* Broadcast */}
      <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
            <Radio size={17} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ctp-text">
              Broadcast message
            </h2>
            <p className="text-xs text-ctp-subtext0">
              Queue an announcement for recently connected terminals.
            </p>
          </div>
        </div>

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
              !token ||
              connectedCount === 0 ||
              broadcastBusy ||
              !broadcast.trim()
            }
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ctp-mauve px-4 py-2 text-xs font-bold text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={14} />
            {broadcastBusy ? "Queuing…" : "Queue broadcast"}
          </button>
        </form>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] text-ctp-subtext0">
            <Users size={12} />
            {connectedCount} available recipient(s)
          </p>
          <p className="text-[11px] text-ctp-subtext0">
            {broadcast.length}/250
          </p>
        </div>

        {broadcastNotice && (
          <StatusMessage notice={broadcastNotice} />
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-ctp-subtext0">
          Queued messages are not confirmed as delivered until a terminal
          processes and acknowledges them.
        </p>
      </section>

      {/* Terminal list */}
      <section className="overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-base">
        <div className="flex flex-col gap-3 border-b border-ctp-surface0 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-ctp-text">Terminals</h2>
            <p className="mt-1 text-xs text-ctp-subtext0">
              Search registered devices and manage their access.
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:max-w-sm">
            <div className="relative min-w-0 flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ctp-overlay1"
              />
              <input
                aria-label="Search terminals"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, ID, IP…"
                disabled={!token}
                className={`${inputClass} w-full py-2 pl-9 pr-9`}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ctp-subtext0 hover:text-ctp-text"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={!token || refreshing}
              title="Refresh terminal list"
              className={`${actionClass} border-ctp-surface1 text-ctp-text hover:border-ctp-blue/50 hover:text-ctp-blue`}
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ctp-surface0 px-3 py-2">
          <p className="text-[11px] text-ctp-subtext0">
            {data
              ? `Showing ${terminals.length} result(s) · ${totalCount} registered`
              : "Terminal data unavailable"}
          </p>

          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ctp-green">
            <span className="h-1.5 w-1.5 rounded-full bg-ctp-green" />
            {connectedCount} connected
          </span>
        </div>

        {!token ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <KeyRound size={24} className="mb-2 text-ctp-overlay1" />
            <p className="text-sm font-semibold text-ctp-text">
              Admin authentication required
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-ctp-subtext0">
              Enter the admin API token above to load and manage registered
              terminals.
            </p>
          </div>
        ) : loading && !data ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-ctp-subtext0">
            <RefreshCw size={15} className="animate-spin" />
            Loading terminals…
          </div>
        ) : terminals.length > 0 ? (
          <div className="divide-y divide-ctp-surface0">
            {terminals.map((terminal) => (
              <TerminalRow
                key={terminal.id}
                terminal={terminal}
                token={token}
                notice={notices[terminal.id]}
                confirmDisable={confirmDisable === terminal.id}
                busyAction={busyActions[terminal.id] ?? null}
                onNotice={(notice) => saveTerminalNotice(terminal.id, notice)}
                onConfirmDisable={(confirm) =>
                  setConfirmDisable(confirm ? terminal.id : null)
                }
                onSync={handleSync}
                onMaintenance={handleMaintenance}
                onDisable={handleDisable}
                onEnable={handleEnable}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Search size={24} className="mb-2 text-ctp-overlay1" />
            <p className="text-sm font-semibold text-ctp-text">
              {search ? "No matching terminals" : "No terminals registered"}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-ctp-subtext0">
              {search
                ? "Try another name, device ID, platform, or IP address."
                : "Once the Expo app registers a device successfully, it will appear here."}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-3 rounded-md border border-ctp-surface1 px-3 py-1.5 text-xs font-semibold text-ctp-text hover:bg-ctp-surface0"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {data && lastUpdated && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ctp-surface0 px-3 py-2">
            <p className="text-[10px] text-ctp-subtext0">
              Last fetched{" "}
              {new Date(lastUpdated).toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
            <p className="text-[10px] text-ctp-subtext0">
              Status is inferred from the last heartbeat, not a persistent
              connection.
            </p>
          </div>
        )}
      </section>

      {/* Current limitations */}
      <footer className="flex items-start gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <Server size={15} className="mt-0.5 shrink-0 text-ctp-overlay1" />
        <p className="text-[11px] leading-relaxed text-ctp-subtext0">
          This screen uses registered terminals from PostgreSQL. Sync and
          broadcast requests are queued until the mobile app polls for commands
          and acknowledges their results. The mobile-app integration is a
          separate step; these controls do not force-close a running app or
          measure Wi-Fi signal strength.
        </p>
      </footer>
    </div>
  );
}
