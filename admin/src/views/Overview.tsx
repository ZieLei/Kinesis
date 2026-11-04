import {
  Activity,
  AlertTriangle,
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
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type {
  ActivityEventRecord,
  ReportPeriod,
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

function VirtualizedActivityFeed({
  activities,
}: {
  activities: ActivityEventRecord[];
}) {
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: activities.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 112,
    overscan: 4,
    getItemKey: (index) => activities[index]?.id ?? index,
  });

  return (
    <div
      ref={scrollElementRef}
      className="max-h-[28rem] overflow-y-auto overscroll-contain pr-1"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const event = activities[virtualItem.index];

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className={`absolute left-0 top-0 w-full ${virtualItem.index < activities.length - 1
                ? "border-b border-ctp-surface1"
                : ""
                }`}
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ActivityRow event={event} />
            </div>
          );
        })}
      </div>
    </div>
  );
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

  return `${Math.floor(hours / 24)}d ago`;
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
        "min-w-0 overflow-hidden rounded-lg",
        "border border-ctp-surface1 bg-ctp-mantle",
        className,
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3 border-b border-ctp-surface1 px-4 py-3">
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

        {action && (
          <div className="shrink-0">
            {action}
          </div>
        )}
      </div>

      <div className="p-4">
        {children}
      </div>
    </section>
  );
}


function SectionLabel({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
      {children}
    </h3>
  );
}


function SectionCount({
  value,
}: {
  value: number;
}) {
  return (
    <span className="rounded-md bg-ctp-surface0 px-2 py-1 text-xs tabular-nums text-ctp-subtext1">
      {formatNumber(value)}
    </span>
  );
}


function ErrorMessage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-ctp-red/30 bg-ctp-red/5 px-3 py-2 text-xs text-ctp-red">
      {children}
    </div>
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
    <div className="flex min-h-32 flex-col items-center justify-center px-4 py-6 text-center">
      <Icon
        size={21}
        className="text-ctp-overlay1"
      />

      <p className="mt-2 text-sm font-medium text-ctp-subtext1">
        {title}
      </p>

      <p className="mt-1 max-w-xs text-xs leading-relaxed text-ctp-subtext0">
        {description}
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
    <span className="inline-flex shrink-0 items-center justify-center gap-1.5 text-xs text-ctp-subtext1">
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


function ProgressBar({
  value,
  maximum,
  color = "bg-ctp-blue",
}: {
  value: number;
  maximum: number;
  color?: string;
}) {
  const percentage = maximum > 0
    ? Math.min(100, Math.max(0, (value / maximum) * 100))
    : 0;

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-ctp-surface0">
      <div
        className={[
          "h-full rounded-full transition-all duration-300",
          color,
        ].join(" ")}
        style={{
          width: `${percentage}%`,
        }}
      />
    </div>
  );
}


// --------------------------------------------------
// System status
// --------------------------------------------------


function SystemStatusItem({
  icon: Icon,
  label,
  detail,
  active,
  status,
  value,
}: {
  icon: typeof Server;
  label: string;
  detail: string;
  active?: boolean;
  status?: string;
  value?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-2 px-3 py-4 text-center">
      <div className="flex size-8 items-center justify-center rounded-md bg-ctp-surface0">
        <Icon
          size={16}
          className="text-ctp-subtext0"
        />
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold text-ctp-text">
          {label}
        </p>

        <p className="mt-0.5 text-[11px] text-ctp-subtext0">
          {detail}
        </p>
      </div>

      {value !== undefined && (
        <p className="text-lg font-semibold tabular-nums text-ctp-text">
          {value}
        </p>
      )}

      {status !== undefined && active !== undefined && (
        <StatusIndicator
          active={active}
          label={status}
        />
      )}
    </div>
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
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ctp-surface0 text-ctp-subtext1">
          <Monitor size={15} />
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

      <span
        className={[
          "inline-flex shrink-0 items-center gap-1.5 text-xs",
          statusColor,
        ].join(" ")}
      >
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
    <div className="flex items-start gap-3 py-4">
      <div
        className={[
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md",
          accent,
        ].join(" ")}
      >
        <Icon size={16} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-ctp-text">
            {event.summary}
          </p>

          <time className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-ctp-overlay1">
            {formatTimeAgo(event.created_at)}
          </time>
        </div>

        <p className="mt-1 break-words text-xs leading-relaxed text-ctp-subtext0">
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
      <span className="rounded-md bg-ctp-red/10 px-2 py-1 text-xs font-medium text-ctp-red">
        Out of stock
      </span>
    );
  }

  if (stock <= threshold) {
    return (
      <span className="rounded-md bg-ctp-yellow/10 px-2 py-1 text-xs font-medium text-ctp-yellow">
        {formatNumber(stock)} left
      </span>
    );
  }

  return (
    <span className="text-xs tabular-nums text-ctp-subtext1">
      {formatNumber(stock)} in stock
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
        description="Completed transactions in this period will appear here."
      />
    );
  }

  return (
    <div className="space-y-5">
      {items.map((item) => {
        const percentage = total > 0
          ? (item.revenue / total) * 100
          : 0;

        const isCash = item.payment_method.toLowerCase() === "cash";

        return (
          <div key={item.payment_method}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {isCash ? (
                  <Banknote
                    size={15}
                    className="shrink-0 text-ctp-green"
                  />
                ) : (
                  <CreditCard
                    size={15}
                    className="shrink-0 text-ctp-blue"
                  />
                )}

                <span className="truncate text-sm font-medium text-ctp-text">
                  {paymentLabel(item.payment_method)}
                </span>
              </div>

              <span className="shrink-0 text-sm font-semibold tabular-nums text-ctp-text">
                {formatCurrency(item.revenue)}
              </span>
            </div>

            <div className="mt-2">
              <ProgressBar
                value={percentage}
                maximum={100}
                color={isCash ? "bg-ctp-green" : "bg-ctp-blue"}
              />
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-ctp-subtext0">
              <span>
                {formatNumber(item.transactions)} transactions
              </span>

              <span className="tabular-nums">
                {percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// --------------------------------------------------
// Sales performance
// --------------------------------------------------


function SalesPeriodSummary({
  label,
  revenue,
  transactions,
  emphasized = false,
}: {
  label: string;
  revenue: number | undefined;
  transactions: number | undefined;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ctp-subtext0">
        {label}
      </p>

      <p
        className={[
          "mt-1.5 truncate font-semibold tabular-nums",
          emphasized
            ? "text-base text-ctp-text"
            : "text-sm text-ctp-text",
        ].join(" ")}
      >
        {formatCurrency(revenue)}
      </p>

      <p className="mt-1 text-[11px] text-ctp-subtext0">
        {formatNumber(transactions)} transactions
      </p>
    </div>
  );
}


// --------------------------------------------------
// Cashier performance
// --------------------------------------------------


function CashierPerformance({
  items,
}: {
  items: Array<{
    cashier_id: string | null;
    display_name: string;
    transactions: number;
    revenue: number;
  }>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No cashier sales yet"
        description="Cashier sales totals will appear after completed transactions."
      />
    );
  }

  const maximumRevenue = Math.max(
    ...items.map((item) => item.revenue),
    1,
  );

  return (
    <div className="space-y-4">
      {items.map((cashier) => (
        <div
          key={cashier.cashier_id ?? cashier.display_name}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ctp-text">
                {cashier.display_name}
              </p>

              <p className="mt-0.5 text-xs text-ctp-subtext0">
                {formatNumber(cashier.transactions)} transactions
              </p>
            </div>

            <p className="shrink-0 text-sm font-medium tabular-nums text-ctp-text">
              {formatCurrency(cashier.revenue)}
            </p>
          </div>

          <div className="mt-2">
            <ProgressBar
              value={cashier.revenue}
              maximum={maximumRevenue}
              color="bg-ctp-mauve"
            />
          </div>
        </div>
      ))}
    </div>
  );
}


// --------------------------------------------------
// Payment period selector
// --------------------------------------------------


const paymentPeriodOptions: Array<{
  value: ReportPeriod;
  label: string;
}> = [
    { value: "daily", label: "Today" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "yearly", label: "This Year" },
  ];


// --------------------------------------------------
// Main page
// --------------------------------------------------


export default function Overview() {
  const {
    health,
    dailyReport,
    weeklyReport,
    monthlyReport,
    yearlyReport,
    productReport,
    recentSales,
    operations,
    paymentBreakdown,
    paymentPeriod,
    setPaymentPeriod,
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

  const apiOnline = health.data?.status === "online";
  const databaseOnline = health.data?.database === "online";

  const outOfStock = inventory?.out_of_stock_count ?? 0;
  const lowStock = inventory?.low_stock_count ?? 0;
  const lowStockThreshold = inventory?.low_stock_threshold ?? 5;

  const updatedAt = operationsUpdatedAt ?? lastUpdated;
  const terminalSummary = data?.terminal_summary;

  const disconnectedTerminals = terminals.filter(
    (terminal) =>
      terminal.is_enabled &&
      !terminal.connected &&
      !terminal.maintenance_mode,
  ).length;

  const hasOperationalIssues =
    outOfStock > 0 ||
    lowStock > 0 ||
    disconnectedTerminals > 0;

  const paymentItems =
    paymentBreakdown.data?.payment_breakdown ?? [];


  return (
    <div className="space-y-5 pb-8">

      {/* Header */}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity
              size={18}
              className="text-ctp-blue"
            />

            <h1 className="text-xl font-semibold tracking-tight text-ctp-text">
              Operations Overview
            </h1>
          </div>

          <p className="mt-1 text-sm text-ctp-subtext0">
            Monitor sales, staff activity, inventory, and connected terminals.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ctp-overlay1">
            <span className="truncate">
              API: {API_BASE_URL}
            </span>

            <span className="hidden text-ctp-surface2 sm:inline">
              /
            </span>

            <span>
              {updatedAt
                ? `Updated ${formatDateTime(updatedAt.toISOString())}`
                : "Waiting for dashboard data"}
            </span>

            <span className="hidden text-ctp-surface2 sm:inline">
              /
            </span>

            <span>
              Auto-refresh: 15 seconds
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || loading}
          className={[
            "inline-flex shrink-0 items-center justify-center gap-2",
            "rounded-md border border-ctp-surface1",
            "bg-ctp-surface0 px-3 py-2",
            "text-sm font-medium text-ctp-text transition-colors",
            "hover:bg-ctp-surface1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
          />

          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </header>


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


      {/* Sales snapshot */}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr]">

        <section className="min-w-0 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-ctp-subtext0">
                Today's revenue
              </p>

              <p className="mt-2 break-all text-3xl font-semibold tracking-tight tabular-nums text-ctp-text sm:text-4xl">
                {formatCurrency(salesToday?.revenue)}
              </p>

              <p className="mt-1 text-xs text-ctp-subtext0">
                Revenue from completed transactions today
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-ctp-green/10 px-2.5 py-1.5 text-xs font-medium text-ctp-green">
              <Banknote size={14} />
              Sales summary
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ctp-surface1 pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-ctp-subtext0">
                Transactions
              </p>

              <p className="mt-1 text-lg font-semibold tabular-nums text-ctp-text">
                {formatNumber(salesToday?.transactions)}
              </p>

              <p className="mt-0.5 text-[11px] text-ctp-subtext0">
                Completed sales
              </p>
            </div>

            <div>
              <p className="text-xs text-ctp-subtext0">
                Average transaction
              </p>

              <p className="mt-1 text-lg font-semibold tabular-nums text-ctp-text">
                {formatCurrency(salesToday?.average_transaction_value)}
              </p>

              <p className="mt-0.5 text-[11px] text-ctp-subtext0">
                Average sale value
              </p>
            </div>

            <div className="col-span-2 border-t border-ctp-surface1 pt-3 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <p className="text-xs text-ctp-subtext0">
                Active terminals
              </p>

              <p className="mt-1 text-lg font-semibold tabular-nums text-ctp-text">
                {formatNumber(terminalSummary?.connected)}
                <span className="ml-1 text-sm font-normal text-ctp-subtext0">
                  / {formatNumber(terminalSummary?.enabled)}
                </span>
              </p>

              <p className="mt-0.5 text-[11px] text-ctp-subtext0">
                Connected and enabled
              </p>
            </div>
          </div>
        </section>


        <Panel
          title="Sales performance"
          description="Revenue across reporting periods."
        >
          {dailyReport.error &&
            weeklyReport.error &&
            monthlyReport.error &&
            yearlyReport.error ? (
            <ErrorMessage>
              Sales reports could not be loaded.
            </ErrorMessage>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <SalesPeriodSummary
                label="Today"
                revenue={dailyReport.data?.current.sales}
                transactions={dailyReport.data?.current.transactions}
                emphasized
              />

              <SalesPeriodSummary
                label="This week"
                revenue={weeklyReport.data?.current.sales}
                transactions={weeklyReport.data?.current.transactions}
              />

              <SalesPeriodSummary
                label="This month"
                revenue={monthlyReport.data?.current.sales}
                transactions={monthlyReport.data?.current.transactions}
              />

              <SalesPeriodSummary
                label="This year"
                revenue={yearlyReport.data?.current.sales}
                transactions={yearlyReport.data?.current.transactions}
              />
            </div>
          )}
        </Panel>
      </div>


      {/* System status */}

      <section className="overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-mantle">
        <div className="grid grid-cols-2 divide-x divide-y divide-ctp-surface1 xl:grid-cols-4 xl:divide-y-0">
          <SystemStatusItem
            icon={Server}
            label="Kinesis API"
            detail="Backend service"
            active={apiOnline}
            status={apiOnline ? "Online" : "Unavailable"}
          />

          <SystemStatusItem
            icon={Database}
            label="PostgreSQL"
            detail="Database connection"
            active={databaseOnline}
            status={databaseOnline ? "Online" : "Unavailable"}
          />

          <SystemStatusItem
            icon={Monitor}
            label="Terminal network"
            detail={`${formatNumber(terminalSummary?.connected)} connected · ${formatNumber(terminalSummary?.disconnected)} disconnected`}
            active={(terminalSummary?.disconnected ?? 0) === 0}
            status={
              (terminalSummary?.disconnected ?? 0) === 0
                ? "Healthy"
                : "Attention"
            }
          />

          <SystemStatusItem
            icon={Users}
            label="Active cashiers"
            detail="Valid cashier sessions"
            value={formatNumber(activeCashiers.length)}
          />
        </div>
      </section>


      {/* Operational alerts */}

      {hasOperationalIssues && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-ctp-yellow/30 bg-ctp-yellow/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              size={15}
              className="shrink-0 text-ctp-yellow"
            />

            <span className="text-xs font-semibold text-ctp-text">
              Attention required
            </span>
          </div>

          {outOfStock > 0 && (
            <span className="text-xs text-ctp-red">
              {formatNumber(outOfStock)} out of stock
            </span>
          )}

          {lowStock > 0 && (
            <span className="text-xs text-ctp-yellow">
              {formatNumber(lowStock)} low-stock products
            </span>
          )}

          {disconnectedTerminals > 0 && (
            <span className="text-xs text-ctp-red">
              {formatNumber(disconnectedTerminals)} disconnected terminals
            </span>
          )}
        </div>
      )}


      {/* Live operations */}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.45fr_1fr]">

        <Panel
          title="Live activity"
          description="Recent events recorded across the POS."
          className="self-start"
          action={
            <div className="flex items-center gap-1.5 text-xs text-ctp-green">
              <span className="size-1.5 animate-pulse rounded-full bg-ctp-green" />
              Live updates
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
              title="No recorded activity"
              description="New sales, stock changes, cashier sessions, and terminal actions will appear here."
            />
          ) : (
            <VirtualizedActivityFeed activities={activities} />
          )}
        </Panel>


        <Panel
          title="Terminal network"
          description="Connected devices and recent heartbeats."
          className="self-start"
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

          {terminalSummary && (
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ctp-surface1 pt-4">
              <div>
                <p className="text-base font-semibold tabular-nums text-ctp-green">
                  {formatNumber(terminalSummary.connected)}
                </p>

                <p className="mt-0.5 text-[11px] text-ctp-subtext0">
                  Connected
                </p>
              </div>

              <div>
                <p className="text-base font-semibold tabular-nums text-ctp-red">
                  {formatNumber(terminalSummary.disconnected)}
                </p>

                <p className="mt-0.5 text-[11px] text-ctp-subtext0">
                  Disconnected
                </p>
              </div>

              <div>
                <p className="text-base font-semibold tabular-nums text-ctp-yellow">
                  {formatNumber(terminalSummary.maintenance)}
                </p>

                <p className="mt-0.5 text-[11px] text-ctp-subtext0">
                  Maintenance
                </p>
              </div>
            </div>
          )}
        </Panel>
      </div>


      {/* Business operations */}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

        <Panel
          title="Cashier operations"
          description="Active sessions and sales performance."
          action={
            <SectionCount
              value={activeCashiers.length}
            />
          }
        >
          <div>
            <SectionLabel>
              Active sessions
            </SectionLabel>

            {activeCashiers.length === 0 ? (
              <div className="mt-2">
                <EmptyState
                  icon={Users}
                  title="No active cashiers"
                  description="Cashiers will appear here after signing in on a terminal."
                />
              </div>
            ) : (
              <div className="mt-3 divide-y divide-ctp-surface1">
                {activeCashiers.map((cashier) => (
                  <div
                    key={`${cashier.cashier_id}-${cashier.terminal_id}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ctp-mauve/10 text-xs font-semibold text-ctp-mauve">
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
                        label={
                          cashier.terminal_connected
                            ? "Online"
                            : "Offline"
                        }
                      />

                      <p className="mt-1 text-[10px] text-ctp-overlay1">
                        {formatTimeAgo(cashier.session_started_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-ctp-surface1 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionLabel>
                Today's performance
              </SectionLabel>

              <span className="text-[11px] text-ctp-subtext0">
                By revenue
              </span>
            </div>

            <CashierPerformance
              items={data?.cashier_performance ?? []}
            />
          </div>
        </Panel>


        {/* Payment distribution */}

        <Panel
          title="Payment distribution"
          description="Completed sales grouped by payment method."
          action={
            <select
              value={paymentPeriod}
              onChange={(event) => {
                setPaymentPeriod(event.target.value as ReportPeriod);
              }}
              aria-label="Payment distribution period"
              className={[
                "rounded-md border border-ctp-surface1",
                "bg-ctp-surface0 px-2 py-1.5",
                "text-xs font-medium text-ctp-text",
                "outline-none transition-colors",
                "focus:border-ctp-blue",
              ].join(" ")}
            >
              {paymentPeriodOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          }
        >
          {paymentBreakdown.error ? (
            <ErrorMessage>
              Payment breakdown could not be loaded: {paymentBreakdown.error}
            </ErrorMessage>
          ) : !paymentBreakdown.data ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-xs text-ctp-subtext0">
              <RefreshCw
                size={14}
                className="animate-spin"
              />
              Loading payment data...
            </div>
          ) : (
            <PaymentBreakdown
              items={paymentItems}
            />
          )}
        </Panel>


        {/* Inventory and products */}

        <Panel
          title="Inventory and products"
          description="Stock availability and best-selling items."
          action={
            <div className="flex items-center gap-1.5 text-xs">
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
          <div>
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>
                Stock alerts
              </SectionLabel>

              <span className="text-[10px] text-ctp-subtext0">
                Threshold: {formatNumber(lowStockThreshold)}
              </span>
            </div>

            {!inventory || inventory.low_stock_products.length === 0 ? (
              <div className="mt-2">
                <EmptyState
                  icon={Package}
                  title="Inventory looks good"
                  description="No products are currently below the configured stock threshold."
                />
              </div>
            ) : (
              <div className="mt-3 divide-y divide-ctp-surface1">
                {inventory.low_stock_products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
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
          </div>

          <div className="mt-5 border-t border-ctp-surface1 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionLabel>
                Top-selling products
              </SectionLabel>

              <SectionCount
                value={topProducts.length}
              />
            </div>

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
                {topProducts.map((product, index) => {
                  const maximumUnits = Math.max(
                    ...topProducts.map((item) => item.units_sold),
                    1,
                  );

                  return (
                    <div
                      key={`${product.product_id ?? product.name}-${index}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-ctp-surface0 text-[11px] font-semibold tabular-nums text-ctp-subtext1">
                            {index + 1}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-ctp-text">
                              {product.name}
                            </p>

                            <p className="mt-0.5 text-[10px] text-ctp-subtext0">
                              {formatNumber(product.units_sold)} units sold
                            </p>
                          </div>
                        </div>

                        <p className="shrink-0 text-xs font-medium tabular-nums text-ctp-text">
                          {formatCurrency(product.revenue)}
                        </p>
                      </div>

                      <div className="mt-2 pl-8">
                        <ProgressBar
                          value={product.units_sold}
                          maximum={maximumUnits}
                          color="bg-ctp-teal"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ctp-surface1 text-[11px] uppercase tracking-wide text-ctp-subtext0">
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
                  <tr
                    key={sale.id}
                    className="transition-colors hover:bg-ctp-surface0/40"
                  >
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

                    <td className="py-3 pr-4 text-right text-sm font-semibold tabular-nums text-ctp-text">
                      {formatCurrency(sale.total)}
                    </td>

                    <td className="py-3 pl-4 text-right text-xs tabular-nums text-ctp-subtext0">
                      {formatDateTime(sale.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>


      {/* Footer */}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ctp-surface1 pt-3 text-[11px] text-ctp-overlay1">
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
      </footer>
    </div>
  );
}
