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
  MoreHorizontal,
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
  Connected: "bg-ctp-green/15 text-ctp-green",
  Disconnected: "bg-ctp-red/15 text-ctp-red",
};

function StatusBadge({ status }: { status: Terminal["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-inter text-xs font-bold ${statusStyles[status]}`}
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
    <div className="rounded-xl border border-ctp-surface0 bg-ctp-base p-4 transition-colors hover:border-ctp-surface1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-inter text-sm font-medium text-ctp-subtext0">
            {label}
          </p>
          <p className="mt-2 font-inter text-2xl font-bold text-ctp-text">
            {value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="mt-3 font-inter text-xs text-ctp-subtext0">
        {description}
      </p>
    </div>
  );
}

export default function Terminals() {
  const [terminals, setTerminals] = useState(initialTerminals);
  const [search, setSearch] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [broadcastNotice, setBroadcastNotice] = useState("");
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [notice, setNotice] = useState<Record<string, string>>({});

  const connectedCount = terminals.filter(
    (terminal) => terminal.status === "Connected",
  ).length;

  const maintenanceCount = terminals.filter(
    (terminal) => terminal.maintenance && terminal.status === "Connected",
  ).length;

  const filteredTerminals = terminals.filter((terminal) =>
    `${terminal.name} ${terminal.id} ${terminal.ip} ${terminal.device}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  function updateTerminal(id: string, updates: Partial<Terminal>) {
    setTerminals((current) =>
      current.map((terminal) =>
        terminal.id === id ? { ...terminal, ...updates } : terminal,
      ),
    );
  }

  function showNotice(id: string, message: string) {
    setNotice((current) => ({ ...current, [id]: message }));
  }

  function forceSync(terminal: Terminal) {
    if (terminal.status !== "Connected") {
      showNotice(terminal.id, "Terminal is offline.");
      return;
    }

    showNotice(terminal.id, "Sync requested (UI demo).");
  }

  function toggleMaintenance(terminal: Terminal) {
    if (terminal.status !== "Connected") {
      showNotice(terminal.id, "Terminal is offline.");
      return;
    }

    const next = !terminal.maintenance;

    updateTerminal(terminal.id, { maintenance: next });
    showNotice(
      terminal.id,
      next ? "Maintenance mode enabled (UI demo)." : "Maintenance mode disabled (UI demo).",
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
      return;
    }

    if (connectedCount === 0) {
      setBroadcastNotice("No connected terminals to receive this message.");
      return;
    }

    setBroadcastNotice(
      `Broadcast prepared for ${connectedCount} connected terminal${connectedCount === 1 ? "" : "s"} (UI demo).`,
    );
    setBroadcast("");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-inter text-2xl font-bold text-ctp-text">
            Terminal Management
          </h1>
          <p className="mt-1 font-inter text-sm text-ctp-subtext0">
            Monitor connected POS devices and manage their sessions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-lg border border-ctp-green/20 bg-ctp-green/10 px-3 py-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ctp-green opacity-40" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ctp-green" />
          </span>
          <span className="font-inter text-sm font-semibold text-ctp-green">
            Network monitoring
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Terminals"
          value={`${connectedCount} / ${terminals.length}`}
          description="Currently connected devices"
          icon={Smartphone}
          color="bg-ctp-green/15 text-ctp-green"
        />
        <StatCard
          label="Network Status"
          value={connectedCount > 0 ? "Online" : "Offline"}
          description="Based on current UI session states"
          icon={connectedCount > 0 ? Wifi : WifiOff}
          color={
            connectedCount > 0
              ? "bg-ctp-blue/15 text-ctp-blue"
              : "bg-ctp-red/15 text-ctp-red"
          }
        />
        <StatCard
          label="Maintenance Mode"
          value={maintenanceCount}
          description="Connected devices in maintenance"
          icon={Wrench}
          color="bg-ctp-yellow/15 text-ctp-yellow"
        />
        <StatCard
          label="Disconnected"
          value={terminals.length - connectedCount}
          description="Devices not currently connected"
          icon={Activity}
          color="bg-ctp-red/15 text-ctp-red"
        />
      </div>

      {/* Network status */}
      <section className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-blue/15 text-ctp-blue">
            <Signal size={21} />
          </div>
          <div>
            <h2 className="font-inter text-lg font-bold text-ctp-text">
              Network Overview
            </h2>
            <p className="font-inter text-sm text-ctp-subtext0">
              Local network and terminal connectivity
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <p className="font-inter text-xs font-medium text-ctp-subtext0">
              Server Address
            </p>
            <p className="mt-2 break-all font-mono text-sm font-semibold text-ctp-text">
              192.168.1.100:8000
            </p>
            <p className="mt-2 flex items-center gap-1.5 font-inter text-xs text-ctp-green">
              <CircleCheck size={14} />
              FastAPI endpoint
            </p>
          </div>

          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <p className="font-inter text-xs font-medium text-ctp-subtext0">
              Connected Devices
            </p>
            <p className="mt-2 font-inter text-2xl font-bold text-ctp-text">
              {connectedCount}
              <span className="text-base font-medium text-ctp-subtext0">
                {" "}/ {terminals.length}
              </span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ctp-surface0">
              <div
                className="h-full rounded-full bg-ctp-green transition-all"
                style={{
                  width: `${terminals.length ? (connectedCount / terminals.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <p className="font-inter text-xs font-medium text-ctp-subtext0">
              Connection Health
            </p>
            <p className="mt-2 font-inter text-lg font-bold text-ctp-text">
              {terminals.some(
                (terminal) =>
                  terminal.status === "Connected" &&
                  terminal.signal === "Weak",
              )
                ? "Needs attention"
                : connectedCount > 0
                  ? "Stable"
                  : "Unavailable"}
            </p>
            <p className="mt-2 flex items-center gap-1.5 font-inter text-xs text-ctp-subtext0">
              <Clock size={14} />
              Live data requires backend integration
            </p>
          </div>
        </div>
      </section>

      {/* Broadcast */}
      <section className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-mauve/15 text-ctp-mauve">
            <Radio size={21} />
          </div>
          <div>
            <h2 className="font-inter text-lg font-bold text-ctp-text">
              Broadcast Message
            </h2>
            <p className="font-inter text-sm text-ctp-subtext0">
              Send an announcement to all connected terminals.
            </p>
          </div>
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            sendBroadcast();
          }}
        >
          <input
            value={broadcast}
            onChange={(event) => {
              setBroadcast(event.target.value);
              setBroadcastNotice("");
            }}
            placeholder="e.g. System maintenance starts at 8:00 PM..."
            maxLength={250}
            className="min-w-0 flex-1 rounded-lg border border-ctp-surface0 bg-ctp-base px-4 py-3 font-inter text-sm text-ctp-text outline-none transition-colors placeholder:text-ctp-overlay1 focus:border-ctp-mauve"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ctp-mauve px-5 py-3 font-inter text-sm font-bold text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={connectedCount === 0}
          >
            <Send size={16} />
            Broadcast
          </button>
        </form>

        <div className="mt-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <p className="font-inter text-xs text-ctp-subtext0">
            <Users size={13} className="mr-1 inline" />
            Recipients: {connectedCount} connected terminal
            {connectedCount === 1 ? "" : "s"}
          </p>
          <p className="font-inter text-xs text-ctp-subtext0">
            {broadcast.length}/250 characters
          </p>
        </div>

        {broadcastNotice && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
            <CircleAlert
              size={16}
              className="mt-0.5 shrink-0 text-ctp-yellow"
            />
            <p className="font-inter text-sm text-ctp-subtext1">
              {broadcastNotice}
            </p>
          </div>
        )}
      </section>

      {/* Terminal list */}
      <section className="overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-surface2/20">
        <div className="flex flex-col justify-between gap-4 border-b border-ctp-surface0 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-inter text-lg font-bold text-ctp-text">
              Connected Terminals
            </h2>
            <p className="mt-1 font-inter text-sm text-ctp-subtext0">
              View device sessions and manage terminal access.
            </p>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ctp-overlay1"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search terminals..."
              className="w-full rounded-lg border border-ctp-surface0 bg-ctp-base py-2.5 pl-9 pr-3 font-inter text-sm text-ctp-text outline-none transition-colors placeholder:text-ctp-overlay1 focus:border-ctp-mauve"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-ctp-surface0 px-5 py-3">
          <p className="font-inter text-xs text-ctp-subtext0">
            Showing {filteredTerminals.length} of {terminals.length} terminals
          </p>
          <span className="flex items-center gap-1.5 font-inter text-xs font-semibold text-ctp-green">
            <span className="h-1.5 w-1.5 rounded-full bg-ctp-green" />
            {connectedCount} online
          </span>
        </div>

        <div className="flex flex-col divide-y divide-ctp-surface0">
          {filteredTerminals.map((terminal) => (
            <div
              key={terminal.id}
              className="p-5 transition-colors hover:bg-ctp-surface0/30"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                {/* Terminal identity */}
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${terminal.status === "Connected"
                        ? "bg-ctp-blue/15 text-ctp-blue"
                        : "bg-ctp-surface0 text-ctp-overlay1"
                      }`}
                  >
                    {terminal.device.includes("Tablet") ? (
                      <Monitor size={22} />
                    ) : (
                      <Smartphone size={22} />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-inter font-bold text-ctp-text">
                        {terminal.name}
                      </h3>
                      <StatusBadge status={terminal.status} />
                      {terminal.maintenance && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ctp-yellow/15 px-2.5 py-1 font-inter text-xs font-bold text-ctp-yellow">
                          <Wrench size={12} />
                          MAINTENANCE
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-inter text-xs text-ctp-subtext0">
                      {terminal.id} · {terminal.device}
                    </p>
                  </div>
                </div>

                {/* Admin actions */}
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <button
                    onClick={() => forceSync(terminal)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 font-inter text-xs font-semibold text-ctp-text transition-colors hover:border-ctp-blue/50 hover:text-ctp-blue"
                  >
                    <RefreshCw size={14} />
                    Force Sync
                  </button>

                  <button
                    onClick={() => toggleMaintenance(terminal)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border bg-ctp-base px-3 py-2 font-inter text-xs font-semibold transition-colors ${terminal.maintenance
                        ? "border-ctp-yellow/30 text-ctp-yellow hover:bg-ctp-yellow/10"
                        : "border-ctp-surface1 text-ctp-text hover:border-ctp-yellow/50 hover:text-ctp-yellow"
                      }`}
                  >
                    {terminal.maintenance ? (
                      <Unlock size={14} />
                    ) : (
                      <Lock size={14} />
                    )}
                    {terminal.maintenance ? "Unlock" : "Maintenance"}
                  </button>

                  {confirmKick === terminal.id ? (
                    <>
                      <button
                        onClick={() => disconnectTerminal(terminal.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ctp-red px-3 py-2 font-inter text-xs font-bold text-ctp-base transition-colors hover:bg-ctp-red/80"
                      >
                        <Check size={14} />
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmKick(null)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 py-2 font-inter text-xs font-semibold text-ctp-subtext1 hover:bg-ctp-surface0"
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmKick(terminal.id)}
                      disabled={terminal.status !== "Connected"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-ctp-red/20 bg-ctp-red/5 px-3 py-2 font-inter text-xs font-semibold text-ctp-red transition-colors hover:bg-ctp-red/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <LogOut size={14} />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Session details */}
              <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-ctp-surface0 bg-ctp-base p-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="font-inter text-xs text-ctp-subtext0">
                    IP Address
                  </p>
                  <p className="mt-1 break-all font-mono text-sm font-medium text-ctp-text">
                    {terminal.ip}
                  </p>
                </div>

                <div>
                  <p className="font-inter text-xs text-ctp-subtext0">
                    Session ID
                  </p>
                  <p className="mt-1 break-all font-mono text-sm font-medium text-ctp-text">
                    {terminal.sessionId}
                  </p>
                </div>

                <div>
                  <p className="font-inter text-xs text-ctp-subtext0">
                    Connected Since
                  </p>
                  <p className="mt-1 font-inter text-sm font-medium text-ctp-text">
                    {terminal.connectedAt}
                  </p>
                </div>

                <div>
                  <p className="font-inter text-xs text-ctp-subtext0">
                    Last Sync
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-inter text-sm font-medium text-ctp-text">
                    <RefreshCw size={13} className="text-ctp-overlay1" />
                    {terminal.lastSync}
                  </p>
                </div>
              </div>

              {/* Terminal feedback */}
              {notice[terminal.id] && (
                <p className="mt-3 font-inter text-xs text-ctp-subtext0">
                  <MoreHorizontal size={14} className="mr-1 inline" />
                  {notice[terminal.id]}
                </p>
              )}
            </div>
          ))}

          {filteredTerminals.length === 0 && (
            <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
              <Search size={28} className="mb-3 text-ctp-overlay1" />
              <p className="font-inter font-semibold text-ctp-text">
                No terminals found
              </p>
              <p className="mt-1 font-inter text-sm text-ctp-subtext0">
                Try searching by terminal name, ID, IP address, or device type.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
