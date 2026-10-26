
import { useState } from "react";
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
} from "lucide-react";

type Terminal = {
  id: string;
  name: string;
  device: string;
  ip: string;
  sessionId: string;
  connectedAt: string;
  lastSync: string;
  status: "Connected" | "Disconnected";
  maintenance: boolean;
  signal: "Excellent" | "Good" | "Weak";
};

const initialTerminals: Terminal[] = [
  {
    id: "TERM-001",
    name: "Counter Terminal 01",
    device: "Android POS",
    ip: "192.168.1.101",
    sessionId: "SES-A82F1",
    connectedAt: "08:42 AM",
    lastSync: "Just now",
    status: "Connected",
    maintenance: false,
    signal: "Excellent",
  },
  {
    id: "TERM-002",
    name: "Counter Terminal 02",
    device: "Android POS",
    ip: "192.168.1.102",
    sessionId: "SES-B91C4",
    connectedAt: "09:15 AM",
    lastSync: "2 min ago",
    status: "Connected",
    maintenance: false,
    signal: "Good",
  },
  {
    id: "TERM-003",
    name: "Stockroom Terminal",
    device: "Android Tablet",
    ip: "192.168.1.103",
    sessionId: "SES-C73D2",
    connectedAt: "09:36 AM",
    lastSync: "5 min ago",
    status: "Connected",
    maintenance: true,
    signal: "Weak",
  },
  {
    id: "TERM-004",
    name: "Backup Terminal",
    device: "Android POS",
    ip: "192.168.1.104",
    sessionId: "SES-D15E8",
    connectedAt: "—",
    lastSync: "24 min ago",
    status: "Disconnected",
    maintenance: false,
    signal: "Weak",
  },
];

const statusStyles = {
  Connected: "bg-ctp-green/10 text-ctp-green",
  Disconnected: "bg-ctp-red/10 text-ctp-red",
};

function StatusBadge({ status }: { status: Terminal["status"] }) {
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
  icon: typeof Activity;
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

export default function Terminals() {
  const [terminals, setTerminals] = useState(initialTerminals);
  const [search, setSearch] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [broadcastNotice, setBroadcastNotice] = useState("");
  const [broadcastError, setBroadcastError] = useState(false);
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    Record<string, { message: string; error: boolean }>
  >({});

  const connectedCount = terminals.filter(
    (terminal) => terminal.status === "Connected",
  ).length;

  const maintenanceCount = terminals.filter(
    (terminal) => terminal.maintenance && terminal.status === "Connected",
  ).length;

  const disconnectedCount = terminals.length - connectedCount;

  const hasWeakSignal = terminals.some(
    (terminal) =>
      terminal.status === "Connected" && terminal.signal === "Weak",
  );

  const filteredTerminals = terminals.filter((terminal) =>
    `${terminal.name} ${terminal.id} ${terminal.ip} ${terminal.device}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  function updateTerminal(id: string, updates: Partial<Terminal>) {
    setTerminals((current) =>
      current.map((terminal) =>
        terminal.id === id ? { ...terminal, ...updates } : terminal,
      ),
    );
  }

  function showNotice(id: string, message: string, error = false) {
    setNotice((current) => ({
      ...current,
      [id]: { message, error },
    }));
  }

  function forceSync(terminal: Terminal) {
    if (terminal.status !== "Connected") {
      showNotice(terminal.id, "Cannot sync: terminal is offline.", true);
      return;
    }

    showNotice(
      terminal.id,
      "Sync requested. Backend integration is required to complete it.",
    );
  }

  function toggleMaintenance(terminal: Terminal) {
    if (terminal.status !== "Connected") {
      showNotice(
        terminal.id,
        "Cannot change maintenance mode while offline.",
        true,
      );
      return;
    }

    const next = !terminal.maintenance;

    updateTerminal(terminal.id, { maintenance: next });
    showNotice(
      terminal.id,
      next ? "Maintenance mode enabled." : "Maintenance mode disabled.",
    );
  }

  function disconnectTerminal(id: string) {
    updateTerminal(id, {
      status: "Disconnected",
      maintenance: false,
    });

    showNotice(id, "Terminal disconnected in this UI demo.");
    setConfirmKick(null);
  }

  function sendBroadcast() {
    if (!broadcast.trim()) {
      setBroadcastNotice("Enter a message before broadcasting.");
      setBroadcastError(true);
      return;
    }

    if (connectedCount === 0) {
      setBroadcastNotice("No connected terminals can receive this message.");
      setBroadcastError(true);
      return;
    }

    setBroadcastNotice(
      `Message prepared for ${connectedCount} connected terminal${connectedCount === 1 ? "" : "s"
      }. Backend integration is required to deliver it.`,
    );
    setBroadcastError(false);
    setBroadcast("");
  }

  const healthLabel =
    connectedCount === 0
      ? "Unavailable"
      : hasWeakSignal
        ? "Needs attention"
        : "Stable";

  const healthColor =
    connectedCount === 0
      ? "text-ctp-subtext0"
      : hasWeakSignal
        ? "text-ctp-yellow"
        : "text-ctp-green";

  const inputClass =
    "min-w-0 rounded-md border border-ctp-surface0 bg-ctp-base px-3 py-2 font-line-seed text-sm text-ctp-text outline-none placeholder:text-ctp-overlay1 focus:border-ctp-mauve";

  const actionClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 font-line-seed text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-line-seed text-xl font-bold text-ctp-text">
            Terminal Management
          </h1>
          <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
            Monitor device connections and manage terminal access.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-ctp-green/20 bg-ctp-green/5 px-2.5 py-1.5">
          <span className="h-2 w-2 rounded-full bg-ctp-green" />
          <span className="font-line-seed text-xs font-semibold text-ctp-green">
            Network monitoring
          </span>
        </div>
      </header>

      {/* Summary */}
      <section
        aria-label="Terminal summary"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Active terminals"
          value={`${connectedCount} / ${terminals.length}`}
          description="Connected devices"
          icon={Smartphone}
          color="bg-ctp-blue/10 text-ctp-blue"
        />

        <StatCard
          label="Network status"
          value={connectedCount > 0 ? "Online" : "Offline"}
          description="Based on UI session states"
          icon={connectedCount > 0 ? Wifi : WifiOff}
          color={
            connectedCount > 0
              ? "bg-ctp-green/10 text-ctp-green"
              : "bg-ctp-red/10 text-ctp-red"
          }
        />

        <StatCard
          label="Maintenance"
          value={maintenanceCount}
          description="Connected devices in maintenance"
          icon={Wrench}
          color="bg-ctp-yellow/10 text-ctp-yellow"
        />

        <StatCard
          label="Disconnected"
          value={disconnectedCount}
          description="Devices currently offline"
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
              <h2 className="font-line-seed text-sm font-bold text-ctp-text">
                Network overview
              </h2>
              <p className="font-line-seed text-xs text-ctp-subtext0">
                Local server and device health
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6 sm:text-right">
            <div>
              <p className="font-line-seed text-[11px] text-ctp-subtext0">
                Server address
              </p>
              <p className="mt-1 font-mono text-xs font-semibold text-ctp-text">
                192.168.1.100:8000
              </p>
              <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
                FastAPI endpoint
              </p>
            </div>

            <div>
              <p className="font-line-seed text-[11px] text-ctp-subtext0">
                Connection health
              </p>
              <p className={`mt-1 font-line-seed text-sm font-bold ${healthColor}`}>
                {healthLabel}
              </p>
              <p className="mt-1 flex items-center justify-start gap-1 font-line-seed text-[10px] text-ctp-subtext0 sm:justify-end">
                <Clock size={11} />
                Demo data · not live monitoring
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Broadcast */}
      <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
            <Radio size={17} />
          </div>
          <div>
            <h2 className="font-line-seed text-sm font-bold text-ctp-text">
              Broadcast message
            </h2>
            <p className="font-line-seed text-xs text-ctp-subtext0">
              Prepare an announcement for connected terminals.
            </p>
          </div>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            sendBroadcast();
          }}
        >
          <input
            aria-label="Broadcast message"
            value={broadcast}
            onChange={(event) => {
              setBroadcast(event.target.value);
              setBroadcastNotice("");
              setBroadcastError(false);
            }}
            placeholder="Enter an announcement..."
            maxLength={250}
            className={`${inputClass} flex-1`}
          />

          <button
            type="submit"
            disabled={connectedCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ctp-mauve px-4 py-2 font-line-seed text-xs font-bold text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={14} />
            Prepare message
          </button>
        </form>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-line-seed text-[11px] text-ctp-subtext0">
            <Users size={12} />
            {connectedCount} recipient{connectedCount === 1 ? "" : "s"}
          </p>
          <p className="font-line-seed text-[11px] text-ctp-subtext0">
            {broadcast.length}/250
          </p>
        </div>

        {broadcastNotice && (
          <div
            role="status"
            className={`mt-3 flex items-start gap-2 rounded-md border p-2.5 ${broadcastError
                ? "border-ctp-red/20 bg-ctp-red/5"
                : "border-ctp-green/20 bg-ctp-green/5"
              }`}
          >
            {broadcastError ? (
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
            <p className="font-line-seed text-xs text-ctp-text">
              {broadcastNotice}
            </p>
          </div>
        )}
      </section>

      {/* Terminal list */}
      <section className="overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-base">
        <div className="flex flex-col gap-3 border-b border-ctp-surface0 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-line-seed text-sm font-bold text-ctp-text">
              Terminals
            </h2>
            <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
              Search devices and manage their sessions.
            </p>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ctp-overlay1"
            />
            <input
              aria-label="Search terminals"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, ID, IP..."
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ctp-surface0 px-3 py-2">
          <p className="font-line-seed text-[11px] text-ctp-subtext0">
            Showing {filteredTerminals.length} of {terminals.length}
          </p>
          <span className="inline-flex items-center gap-1.5 font-line-seed text-[11px] font-semibold text-ctp-green">
            <span className="h-1.5 w-1.5 rounded-full bg-ctp-green" />
            {connectedCount} online
          </span>
        </div>

        <div className="divide-y divide-ctp-surface0">
          {filteredTerminals.map((terminal) => (
            <article
              key={terminal.id}
              className="p-3 transition-colors hover:bg-ctp-surface0/20"
            >
              {/* Identity and actions */}
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${terminal.status === "Connected"
                        ? "bg-ctp-blue/10 text-ctp-blue"
                        : "bg-ctp-surface0 text-ctp-overlay1"
                      }`}
                  >
                    {terminal.device.includes("Tablet") ? (
                      <Monitor size={18} />
                    ) : (
                      <Smartphone size={18} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-line-seed text-sm font-bold text-ctp-text">
                        {terminal.name}
                      </h3>
                      <StatusBadge status={terminal.status} />

                      {terminal.maintenance &&
                        terminal.status === "Connected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ctp-yellow/10 px-2 py-0.5 font-line-seed text-[10px] font-bold text-ctp-yellow">
                            <Wrench size={10} />
                            MAINTENANCE
                          </span>
                        )}
                    </div>

                    <p className="mt-1 font-line-seed text-[11px] text-ctp-subtext0">
                      {terminal.id} <span className="px-1">·</span>
                      {terminal.device}
                      {terminal.status === "Connected" && (
                        <>
                          <span className="px-1">·</span>
                          <span
                            className={
                              terminal.signal === "Weak"
                                ? "text-ctp-yellow"
                                : "text-ctp-subtext0"
                            }
                          >
                            Signal: {terminal.signal}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => forceSync(terminal)}
                    className={`${actionClass} border-ctp-surface1 text-ctp-text hover:border-ctp-blue/50 hover:text-ctp-blue`}
                  >
                    <RefreshCw size={13} />
                    Sync
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleMaintenance(terminal)}
                    disabled={terminal.status !== "Connected"}
                    className={`${actionClass} ${terminal.maintenance
                        ? "border-ctp-yellow/30 text-ctp-yellow hover:bg-ctp-yellow/5"
                        : "border-ctp-surface1 text-ctp-text hover:border-ctp-yellow/50 hover:text-ctp-yellow"
                      }`}
                  >
                    {terminal.maintenance ? (
                      <Unlock size={13} />
                    ) : (
                      <Lock size={13} />
                    )}
                    {terminal.maintenance ? "End maintenance" : "Maintenance"}
                  </button>

                  {confirmKick === terminal.id ? (
                    <div
                      className="flex flex-wrap items-center gap-1.5 rounded-md border border-ctp-red/20 bg-ctp-red/5 p-1.5"
                      role="group"
                      aria-label={`Confirm disconnect for ${terminal.name}`}
                    >
                      <span className="px-1 font-line-seed text-[11px] text-ctp-red">
                        Disconnect?
                      </span>
                      <button
                        type="button"
                        onClick={() => disconnectTerminal(terminal.id)}
                        className={`${actionClass} border-ctp-red bg-ctp-red text-ctp-base hover:bg-ctp-red/80`}
                      >
                        <Check size={13} />
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmKick(null)}
                        className={`${actionClass} border-ctp-surface1 text-ctp-text hover:bg-ctp-surface0`}
                      >
                        <X size={13} />
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmKick(terminal.id)}
                      disabled={terminal.status !== "Connected"}
                      className={`${actionClass} border-ctp-red/20 bg-ctp-red/5 text-ctp-red hover:bg-ctp-red/10`}
                    >
                      <LogOut size={13} />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Session details */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-ctp-surface0/30 px-3 py-2.5 sm:grid-cols-4">
                <div className="min-w-0">
                  <p className="font-line-seed text-[10px] text-ctp-subtext0">
                    IP address
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-ctp-text">
                    {terminal.ip}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="font-line-seed text-[10px] text-ctp-subtext0">
                    Session ID
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-ctp-text">
                    {terminal.sessionId}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="font-line-seed text-[10px] text-ctp-subtext0">
                    Connected since
                  </p>
                  <p className="mt-1 font-line-seed text-xs text-ctp-text">
                    {terminal.connectedAt}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="font-line-seed text-[10px] text-ctp-subtext0">
                    Last sync
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-line-seed text-xs text-ctp-text">
                    <RefreshCw
                      size={11}
                      className="shrink-0 text-ctp-overlay1"
                    />
                    {terminal.lastSync}
                  </p>
                </div>
              </div>

              {/* Action feedback */}
              {notice[terminal.id] && (
                <p
                  role="status"
                  className={`mt-2 flex items-start gap-1.5 font-line-seed text-xs ${notice[terminal.id].error
                      ? "text-ctp-red"
                      : "text-ctp-subtext0"
                    }`}
                >
                  {notice[terminal.id].error ? (
                    <CircleAlert size={13} className="mt-0.5 shrink-0" />
                  ) : (
                    <CircleCheck size={13} className="mt-0.5 shrink-0" />
                  )}
                  {notice[terminal.id].message}
                </p>
              )}
            </article>
          ))}

          {filteredTerminals.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <Search size={24} className="mb-2 text-ctp-overlay1" />
              <p className="font-line-seed text-sm font-semibold text-ctp-text">
                No terminals found
              </p>
              <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
                Try another name, ID, IP address, or device type.
              </p>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-3 rounded-md border border-ctp-surface1 px-3 py-1.5 font-line-seed text-xs font-semibold text-ctp-text hover:bg-ctp-surface0"
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
