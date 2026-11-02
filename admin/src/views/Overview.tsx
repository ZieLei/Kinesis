import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  Monitor,
  Package,
  RefreshCw,
  Server,
  ShoppingCart,
  Smartphone,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

import type { ReactNode } from "react";

import { API_BASE_URL } from "../lib/api";
import { useAdminOverview } from "../hooks/useAdminOverview";

import type {
  ActivityEventRecord,
  TerminalOperationalStatus,
} from "../types/admin";


// --------------------------------------------------
// Formatting
// --------------------------------------------------


function formatCurrency(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);

  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(numeric);
}


function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-PH").format(value ?? 0);
}


function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}


function formatTimeAgo(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const difference = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(difference / 1000);

  if (seconds < 10) {
    return "Just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return `${days}d ago`;
}


function paymentLabel(method: string) {
  switch (method.toLowerCase()) {
    case "cash":
      return "Cash";

    case "gcash":
      return "GCash";

    default:
      return method
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}


// --------------------------------------------------
// Shared UI
// --------------------------------------------------


function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "min-w-0 rounded-xl border border-ctp-surface1",
        "bg-ctp-mantle/80",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 border-b border-ctp-surface1 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ctp-text">
            {title}
          </h2>

          {description && (
            <p className="mt-0.5 text-xs text-ctp-subtext0">
              {description}
            </p>
          )}
        </div>

        {action}
      </div>

      <div className="p-4">
        {children}
      </div>
    </section>
  );
}


function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = "text-ctp-blue",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  accent?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-ctp-surface1 bg-ctp-mantle/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-ctp-subtext0">
          {label}
        </span>

        <Icon
          size={17}
          className={accent}
        />
      </div>

      <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-ctp-text">
        {value}
      </p>

      <p className="mt-1 truncate text-xs text-ctp-subtext0">
        {detail}
      </p>
    </div>
  );
}


function StatusIndicator({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ctp-subtext1">
      <span
        className={[
          "size-1.5 rounded-full",
          active ? "bg-ctp-green" : "bg-ctp-red",
        ].join(" ")}
      />

      {label}
    </span>
  );
}


function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Icon
        size={22}
        className="text-ctp-overlay1"
      />

      <p className="mt-2 text-sm font-medium text-ctp-subtext1">
        {title}
      </p>

      <p className="mt-1 max-w-xs text-xs text-ctp-subtext0">
        {description}
      </p>
    </div>
  );
}


function ErrorMessage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ctp-red/30 bg-ctp-red/5 px-3 py-2 text-xs text-ctp-red">
      {children}
    </div>
  );
}


function SectionCount({
  value,
}: {
  value: number;
}) {
  return (
    <span className="rounded-md bg-ctp-surface0 px-2 py-0.5 text-xs tabular-nums text-ctp-subtext1">
      {formatNumber(value)}
    </span>
  );
}


// --------------------------------------------------
// Terminal status
// --------------------------------------------------


function TerminalStatus({
  terminal,
}: {
  terminal: TerminalOperationalStatus;
}) {
  const isConnected = terminal.connected;
  const isDisabled = !terminal.is_enabled;
  const isMaintenance = terminal.maintenance_mode;

  let statusLabel = "Disconnected";
  let statusColor = "text-ctp-red";
  let StatusIcon = WifiOff;

  if (isDisabled) {
    statusLabel = "Disabled";
    statusColor = "text-ctp-overlay1";
    StatusIcon = XCircle;
  } else if (isMaintenance) {
    statusLabel = "Maintenance";
    statusColor = "text-ctp-yellow";
    StatusIcon = AlertTriangle;
  } else if (isConnected) {
    statusLabel = "Connected";
    statusColor = "text-ctp-green";
    StatusIcon = Wifi;
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ctp-surface0 text-ctp-subtext1">
          <Monitor size={17} />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ctp-text">
            {terminal.name}
          </p>

          <p className="mt-0.5 truncate text-xs text-ctp-subtext0">
            {terminal.ip_address || terminal.device_id || "No device information"}
          </p>

          <p className="mt-1 text-[11px] text-ctp-overlay1">
            Last heartbeat: {formatTimeAgo(terminal.last_seen_at)}
          </p>
        </div>
      </div>

      <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${statusColor}`}>
        <StatusIcon size={13} />
        {statusLabel}
      </span>
    </div>
  );
}


// --------------------------------------------------
// Activity feed
// --------------------------------------------------


function getActivityIcon(eventType: string) {
  if (eventType.startsWith("sale.")) {
    return ShoppingCart;
  }

  if (eventType.startsWith("inventory.")) {
    return Package;
  }

  if (eventType.startsWith("cashier.")) {
    return Users;
  }

  if (eventType.startsWith("terminal.")) {
    return Smartphone;
  }

  if (eventType.startsWith("service.")) {
    return Boxes;
  }

  return Activity;
}


function getActivityAccent(event: ActivityEventRecord) {
  if (event.severity === "error") {
    return "text-ctp-red bg-ctp-red/10";
  }

  if (event.severity === "warning") {
    return "text-ctp-yellow bg-ctp-yellow/10";
  }

  if (event.event_type.startsWith("sale.")) {
    return "text-ctp-green bg-ctp-green/10";
  }

  if (event.event_type.startsWith("terminal.")) {
    return "text-ctp-blue bg-ctp-blue/10";
  }

  if (event.event_type.startsWith("cashier.")) {
    return "text-ctp-mauve bg-ctp-mauve/10";
  }

  return "text-ctp-teal bg-ctp-teal/10";
}


function getActivityDetail(event: ActivityEventRecord) {
  const details = event.details || {};

  if (event.event_type.startsWith("sale.")) {
    const method = details.payment_method;
    const total = details.total;

    const parts = [];

    if (method) {
      parts.push(paymentLabel(String(method)));
    }

    if (total !== undefined && total !== null) {
      parts.push(formatCurrency(String(total)));
    }

    if (parts.length > 0) {
      return parts.join(" · ");
    }
  }

  if (event.event_type === "inventory.stock_adjusted") {
    const changes = details.changes as
      | Record<string, { from?: unknown; to?: unknown }>
      | undefined;

    const stockChange = changes?.stock;

    if (stockChange) {
      return `Stock ${String(stockChange.from ?? "—")} → ${String(stockChange.to ?? "—")}`;
    }
  }

  if (event.event_type.startsWith("terminal.")) {
    const deviceId = details.device_id;

    if (deviceId) {
      return `Device ${String(deviceId)}`;
    }
  }

  if (event.actor_name) {
    return event.actor_name;
  }

  if (event.terminal_id !== null) {
    return `Terminal ${event.terminal_id}`;
  }

  return event.actor_type === "system"
    ? "System event"
    : event.actor_type;
}


function ActivityRow({
  event,
}: {
  event: ActivityEventRecord;
}) {
  const Icon = getActivityIcon(event.event_type);
  const accent = getActivityAccent(event);

  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${accent}`}
      >
        <Icon size={15} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-medium text-ctp-text">
            {event.summary}
          </p>

          <time className="shrink-0 text-[11px] text-ctp-overlay1">
            {formatTimeAgo(event.created_at)}
          </time>
        </div>

        <p className="mt-1 truncate text-xs text-ctp-subtext0">
          {getActivityDetail(event)}
        </p>
      </div>
    </div>
  );
}


// --------------------------------------------------
// Inventory
// --------------------------------------------------


function StockLevel({
  stock,
  threshold,
}: {
  stock: number;
  threshold: number;
}) {
  if (stock <= 0) {
    return (
      <span className="rounded-md bg-ctp-red/10 px-2 py-1 text-xs text-ctp-red">
        Out of stock
      </span>
    );
  }

  if (stock <= threshold) {
    return (
      <span className="rounded-md bg-ctp-yellow/10 px-2 py-1 text-xs text-ctp-yellow">
        {stock} left
      </span>
    );
  }

  return (
    <span className="text-xs tabular-nums text-ctp-subtext1">
      {stock} in stock
    </span>
  );
}


// --------------------------------------------------
// Payment breakdown
// --------------------------------------------------


function PaymentBreakdown({
  items,
}: {
  items: Array<{
    payment_method: string;
    transactions: number;
    revenue: number;
  }>;
}) {
  const total = items.reduce(
    (sum, item) => sum + item.revenue,
    0,
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No payments yet"
        description="Completed transactions will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const percentage = total > 0
          ? (item.revenue / total) * 100
          : 0;

        const isCash = item.payment_method.toLowerCase() === "cash";

        return (
          <div key={item.payment_method}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {isCash ? (
                  <Banknote
                    size={15}
                    className="text-ctp-green"
                  />
                ) : (
                  <CreditCard
                    size={15}
                    className="text-ctp-blue"
                  />
                )}

                <span className="text-sm text-ctp-text">
                  {paymentLabel(item.payment_method)}
                </span>
              </div>

              <span className="text-sm font-medium tabular-nums text-ctp-text">
                {formatCurrency(item.revenue)}
              </span>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ctp-surface0">
              <div
                className={[
                  "h-full rounded-full transition-all",
                  isCash ? "bg-ctp-green" : "bg-ctp-blue",
                ].join(" ")}
                style={{
                  width: `${Math.min(100, percentage)}%`,
                }}
              />
            </div>

            <p className="mt-1.5 text-xs text-ctp-subtext0">
              {formatNumber(item.transactions)} transactions
              {" · "}
              {percentage.toFixed(1)}%
            </p>
          </div>
        );
      })}
    </div>
  );
}


// --------------------------------------------------
// Main page
// --------------------------------------------------


export default function Overview() {
  const {
    health,
    products,
    dailyReport,
    weeklyReport,
    monthlyReport,
    productReport,
    recentSales,
    operations,
    loading,
    refreshing,
    lastUpdated,
    operationsUpdatedAt,
    refresh,
  } = useAdminOverview();

  const data = operations.data;
  const salesToday = data?.sales_today;
  const terminals = data?.terminals ?? [];
  const activeCashiers = data?.active_cashiers ?? [];
  const inventory = data?.inventory_summary;
  const activities = data?.activity ?? [];
  const topProducts = productReport.data?.top_products ?? [];
  const transactions = recentSales.data?.items ?? [];

  const databaseOnline = health.data?.database === "online";
  const apiOnline = health.data?.status === "online";

  const outOfStock = inventory?.out_of_stock_count ?? 0;
  const lowStock = inventory?.low_stock_count ?? 0;

  const lowStockThreshold = inventory?.low_stock_threshold ?? 5;

  const updatedAt = operationsUpdatedAt ?? lastUpdated;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity
              size={20}
              className="text-ctp-blue"
            />

            <h1 className="text-xl font-semibold tracking-tight text-ctp-text">
              Operations Overview
            </h1>
          </div>

          <p className="mt-1 text-sm text-ctp-subtext0">
            Live activity and performance across your Kinesis POS.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ctp-overlay1">
            <span>
              API: {API_BASE_URL}
            </span>

            <span>
              {updatedAt
                ? `Last updated ${formatDateTime(updatedAt.toISOString())}`
                : "Waiting for dashboard data"}
            </span>

            <span>
              Operational data refreshes every 15 seconds
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || loading}
          className={[
            "inline-flex items-center gap-2 rounded-lg border",
            "border-ctp-surface1 bg-ctp-surface0 px-3 py-2",
            "text-sm font-medium text-ctp-text transition",
            "hover:bg-ctp-surface1 disabled:cursor-not-allowed",
            "disabled:opacity-50",
          ].join(" ")}
        >
          <RefreshCw
            size={15}
            className={refreshing ? "animate-spin" : ""}
          />

          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>


      {/* Errors */}

      {operations.error && (
        <ErrorMessage>
          Operational data could not be refreshed: {operations.error}
        </ErrorMessage>
      )}

      {health.error && (
        <ErrorMessage>
          API health information is unavailable: {health.error}
        </ErrorMessage>
      )}


      {/* Performance cards */}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Today's revenue"
          value={formatCurrency(salesToday?.revenue)}
          detail={`${formatNumber(salesToday?.transactions)} completed transactions`}
          icon={Banknote}
          accent="text-ctp-green"
        />

        <MetricCard
          label="Transactions today"
          value={formatNumber(salesToday?.transactions)}
          detail="Completed sales"
          icon={ShoppingCart}
          accent="text-ctp-blue"
        />

        <MetricCard
          label="Average transaction"
          value={formatCurrency(salesToday?.average_transaction_value)}
          detail="Today's average sale value"
          icon={BarChart3}
          accent="text-ctp-mauve"
        />

        <MetricCard
          label="Connected terminals"
          value={`${formatNumber(data?.terminal_summary.connected)} / ${formatNumber(data?.terminal_summary.enabled)}`}
          detail={`${formatNumber(data?.terminal_summary.disconnected)} disconnected · ${formatNumber(data?.terminal_summary.maintenance)} in maintenance`}
          icon={Monitor}
          accent="text-ctp-teal"
        />
      </div>


      {/* System status */}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-xl border border-ctp-surface1 bg-ctp-mantle/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <Server
              size={17}
              className="text-ctp-blue"
            />

            <div>
              <p className="text-sm font-medium text-ctp-text">
                Kinesis API
              </p>

              <p className="text-xs text-ctp-subtext0">
                Backend service
              </p>
            </div>
          </div>

          <StatusIndicator
            active={apiOnline}
            label={apiOnline ? "Online" : "Unavailable"}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-ctp-surface1 bg-ctp-mantle/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <Database
              size={17}
              className="text-ctp-teal"
            />

            <div>
              <p className="text-sm font-medium text-ctp-text">
                PostgreSQL
              </p>

              <p className="text-xs text-ctp-subtext0">
                Database connection
              </p>
            </div>
          </div>

          <StatusIndicator
            active={databaseOnline}
            label={databaseOnline ? "Online" : "Unavailable"}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-ctp-surface1 bg-ctp-mantle/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <Users
              size={17}
              className="text-ctp-mauve"
            />

            <div>
              <p className="text-sm font-medium text-ctp-text">
                Active cashiers
              </p>

              <p className="text-xs text-ctp-subtext0">
                Valid cashier sessions
              </p>
            </div>
          </div>

          <span className="text-lg font-semibold tabular-nums text-ctp-text">
            {formatNumber(activeCashiers.length)}
          </span>
        </div>
      </div>


      {/* Main operational area */}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Activity feed */}

        <Panel
          title="Live activity"
          description="Recent recorded events across the POS."
          action={
            <div className="flex items-center gap-1.5 text-xs text-ctp-green">
              <span className="size-1.5 animate-pulse rounded-full bg-ctp-green" />
              Auto-refresh
            </div>
          }
        >
          {operations.error && activities.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Activity unavailable"
              description="The activity feed could not be loaded."
            />
          ) : activities.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No recorded activity yet"
              description="New sales, stock changes, cashier sessions, and terminal actions will appear here."
            />
          ) : (
            <div className="divide-y divide-ctp-surface1">
              {activities.slice(0, 15).map((event) => (
                <ActivityRow
                  key={event.id}
                  event={event}
                />
              ))}
            </div>
          )}
        </Panel>


        {/* Terminal network */}

        <Panel
          title="Terminal network"
          description="Heartbeat and availability status."
          action={
            <SectionCount
              value={terminals.length}
            />
          }
        >
          {terminals.length === 0 ? (
            <EmptyState
              icon={Monitor}
              title="No terminals found"
              description="Paired terminals will appear here."
            />
          ) : (
            <div className="divide-y divide-ctp-surface1">
              {terminals.map((terminal) => (
                <TerminalStatus
                  key={terminal.id}
                  terminal={terminal}
                />
              ))}
            </div>
          )}

          {data && (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ctp-surface1 pt-3">
              <div>
                <p className="text-lg font-semibold tabular-nums text-ctp-green">
                  {formatNumber(data.terminal_summary.connected)}
                </p>

                <p className="text-[11px] text-ctp-subtext0">
                  Connected
                </p>
              </div>

              <div>
                <p className="text-lg font-semibold tabular-nums text-ctp-red">
                  {formatNumber(data.terminal_summary.disconnected)}
                </p>

                <p className="text-[11px] text-ctp-subtext0">
                  Disconnected
                </p>
              </div>

              <div>
                <p className="text-lg font-semibold tabular-nums text-ctp-yellow">
                  {formatNumber(data.terminal_summary.maintenance)}
                </p>

                <p className="text-[11px] text-ctp-subtext0">
                  Maintenance
                </p>
              </div>
            </div>
          )}
        </Panel>
      </div>


      {/* Cashiers and payments */}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Active cashier sessions"
          description="Cashiers with valid, non-revoked sessions."
          action={
            <SectionCount
              value={activeCashiers.length}
            />
          }
        >
          {activeCashiers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No active cashier sessions"
              description="Cashiers will appear here after signing in on a terminal."
            />
          ) : (
            <div className="space-y-3">
              {activeCashiers.map((cashier) => (
                <div
                  key={`${cashier.cashier_id}-${cashier.terminal_id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-ctp-surface0/60 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ctp-mauve/10 text-sm font-semibold text-ctp-mauve">
                      {cashier.display_name
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ctp-text">
                        {cashier.display_name}
                      </p>

                      <p className="mt-0.5 truncate text-xs text-ctp-subtext0">
                        {cashier.terminal_name}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <StatusIndicator
                      active={cashier.terminal_connected}
                      label={cashier.terminal_connected
                        ? "Online"
                        : "Terminal offline"}
                    />

                    <p className="mt-1 text-[11px] text-ctp-overlay1">
                      Started {formatTimeAgo(cashier.session_started_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>


        <Panel
          title="Payment distribution"
          description="Completed transactions grouped by payment method."
          action={
            <span className="text-xs text-ctp-subtext0">
              Today
            </span>
          }
        >
          <PaymentBreakdown
            items={data?.payment_breakdown ?? []}
          />
        </Panel>
      </div>


      {/* Cashier performance and inventory */}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Cashier performance"
          description="Today's completed sales by cashier."
          action={
            <SectionCount
              value={data?.cashier_performance.length ?? 0}
            />
          }
        >
          {!data || data.cashier_performance.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No cashier sales yet"
              description="Cashier sales totals will appear after completed transactions."
            />
          ) : (
            <div className="space-y-3">
              {data.cashier_performance.map((cashier) => (
                <div
                  key={cashier.cashier_id ?? cashier.display_name}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ctp-text">
                      {cashier.display_name}
                    </p>

                    <p className="mt-0.5 text-xs text-ctp-subtext0">
                      {formatNumber(cashier.transactions)} transactions
                    </p>
                  </div>

                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ctp-text">
                    {formatCurrency(cashier.revenue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>


        <Panel
          title="Inventory watch"
          description={`Products at or below ${lowStockThreshold} units.`}
          action={
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ctp-yellow">
                {formatNumber(lowStock)} low
              </span>

              <span className="text-ctp-overlay1">
                /
              </span>

              <span className="text-ctp-red">
                {formatNumber(outOfStock)} out
              </span>
            </div>
          }
        >
          {!inventory || inventory.low_stock_products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Inventory looks good"
              description="No products are currently below the configured stock threshold."
            />
          ) : (
            <div className="space-y-3">
              {inventory.low_stock_products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ctp-text">
                      {product.name}
                    </p>

                    <p className="mt-0.5 truncate text-xs text-ctp-subtext0">
                      {product.sku || product.category}
                    </p>
                  </div>

                  <StockLevel
                    stock={product.stock}
                    threshold={lowStockThreshold}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>


      {/* Sales reports and top products */}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Sales performance"
          description="Revenue comparison by reporting period."
        >
          {dailyReport.error &&
            weeklyReport.error &&
            monthlyReport.error ? (
            <ErrorMessage>
              Sales reports could not be loaded.
            </ErrorMessage>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-ctp-surface0/60 p-3">
                <p className="text-xs text-ctp-subtext0">
                  Today
                </p>

                <p className="mt-2 text-lg font-semibold tabular-nums text-ctp-text">
                  {formatCurrency(dailyReport.data?.current.sales)}
                </p>

                <p className="mt-1 text-xs text-ctp-subtext0">
                  {formatNumber(dailyReport.data?.current.transactions)} transactions
                </p>
              </div>

              <div className="rounded-lg bg-ctp-surface0/60 p-3">
                <p className="text-xs text-ctp-subtext0">
                  This week
                </p>

                <p className="mt-2 text-lg font-semibold tabular-nums text-ctp-text">
                  {formatCurrency(weeklyReport.data?.current.sales)}
                </p>

                <p className="mt-1 text-xs text-ctp-subtext0">
                  {formatNumber(weeklyReport.data?.current.transactions)} transactions
                </p>
              </div>

              <div className="rounded-lg bg-ctp-surface0/60 p-3">
                <p className="text-xs text-ctp-subtext0">
                  This month
                </p>

                <p className="mt-2 text-lg font-semibold tabular-nums text-ctp-text">
                  {formatCurrency(monthlyReport.data?.current.sales)}
                </p>

                <p className="mt-1 text-xs text-ctp-subtext0">
                  {formatNumber(monthlyReport.data?.current.transactions)} transactions
                </p>
              </div>
            </div>
          )}
        </Panel>


        <Panel
          title="Top-selling products"
          description="Products ranked by units sold."
          action={
            <SectionCount
              value={topProducts.length}
            />
          }
        >
          {productReport.error ? (
            <ErrorMessage>
              Product sales report could not be loaded.
            </ErrorMessage>
          ) : topProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No product sales yet"
              description="Product rankings will appear after completed sales."
            />
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div
                  key={`${product.product_id ?? product.name}-${index}`}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-ctp-surface0 text-xs font-semibold tabular-nums text-ctp-subtext1">
                      {index + 1}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ctp-text">
                        {product.name}
                      </p>

                      <p className="mt-0.5 text-xs text-ctp-subtext0">
                        {formatNumber(product.units_sold)} units sold
                      </p>
                    </div>
                  </div>

                  <p className="shrink-0 text-sm font-medium tabular-nums text-ctp-text">
                    {formatCurrency(product.revenue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>


      {/* Recent transactions */}

      <Panel
        title="Recent transactions"
        description="Latest recorded sales from the POS."
        action={
          <SectionCount
            value={transactions.length}
          />
        }
      >
        {recentSales.error ? (
          <ErrorMessage>
            Recent transactions could not be loaded: {recentSales.error}
          </ErrorMessage>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No transactions yet"
            description="Completed sales will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-ctp-surface1 text-xs text-ctp-subtext0">
                  <th className="pb-3 pr-4 font-medium">
                    Transaction
                  </th>

                  <th className="pb-3 pr-4 font-medium">
                    Cashier
                  </th>

                  <th className="pb-3 pr-4 font-medium">
                    Terminal
                  </th>

                  <th className="pb-3 pr-4 font-medium">
                    Payment
                  </th>

                  <th className="pb-3 pr-4 text-right font-medium">
                    Amount
                  </th>

                  <th className="pb-3 pl-4 text-right font-medium">
                    Time
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-ctp-surface1">
                {transactions.map((sale) => (
                  <tr key={sale.id}>
                    <td className="py-3 pr-4">
                      <p className="text-sm font-medium text-ctp-text">
                        {sale.transaction_code}
                      </p>

                      <p className="mt-0.5 text-xs text-ctp-subtext0">
                        {formatNumber(sale.item_count)} items
                      </p>
                    </td>

                    <td className="py-3 pr-4 text-sm text-ctp-subtext1">
                      {sale.cashier_display_name
                        || sale.cashier_username
                        || "Unassigned"}
                    </td>

                    <td className="py-3 pr-4 text-sm text-ctp-subtext1">
                      {sale.terminal_device_id
                        || (sale.terminal_id
                          ? `Terminal ${sale.terminal_id}`
                          : "—")}
                    </td>

                    <td className="py-3 pr-4 text-sm text-ctp-subtext1">
                      {paymentLabel(sale.payment_method)}
                    </td>

                    <td className="py-3 pr-4 text-right text-sm font-medium tabular-nums text-ctp-text">
                      {formatCurrency(sale.total)}
                    </td>

                    <td className="py-3 pl-4 text-right text-xs text-ctp-subtext0">
                      {formatDateTime(sale.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>


      {/* Footer status */}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ctp-surface1 pt-3 text-xs text-ctp-overlay1">
        <div className="flex items-center gap-2">
          <CheckCircle2
            size={13}
            className="text-ctp-green"
          />

          <span>
            {data
              ? `Operational snapshot: ${formatDateTime(data.as_of)}`
              : "Waiting for operational snapshot"}
          </span>
        </div>

        <span>
          {formatNumber(data?.service_catalog_count)} services in catalogue
        </span>
      </div>
    </div>
  );
}
