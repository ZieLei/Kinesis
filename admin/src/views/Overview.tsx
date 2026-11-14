import { ChevronDown, RefreshCw } from "lucide-react";

import type { ReactNode } from "react";

import { API_BASE_URL } from "../lib/api";
import { useAdminOverview } from "../hooks/useAdminOverview";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import Section, { Badge } from "../components/ui/Section";
import PageHeader from "../components/ui/PageHeader";
import Notice from "../components/ui/Notice";
import StatusDot from "../components/ui/StatusDot";
import StatList from "../components/ui/StatList";
import SystemHealthSection from "../components/SystemHealthSection";
import {
  buttonSecondary,
  selectClass,
  tableHead,
} from "../components/ui/styles";

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
    estimateSize: () => 64,
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
                ? "border-b border-ctp-surface0"
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
    <Section
      title={title}
      description={description}
      actions={action}
      className={className}
      bodyClassName="border-t border-ctp-surface0 pt-3"
    >
      {children}
    </Section>
  );
}


function SectionLabel({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <h3 className="text-xs font-medium text-ctp-subtext1">
      {children}
    </h3>
  );
}


function SectionCount({
  value,
}: {
  value: number;
}) {
  return <Badge>{formatNumber(value)}</Badge>;
}


function ErrorMessage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Notice tone="danger" role="alert">
      {children}
    </Notice>
  );
}


function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="py-6">
      <p className="text-sm font-medium text-ctp-subtext1">
        {title}
      </p>

      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ctp-subtext0">
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
    <StatusDot tone={active ? "success" : "danger"} muted>
      {label}
    </StatusDot>
  );
}


function ProgressBar({
  value,
  maximum,
  color = "bg-ctp-mauve",
}: {
  value: number;
  maximum: number;
  color?: string;
}) {
  const percentage = maximum > 0
    ? Math.min(100, Math.max(0, (value / maximum) * 100))
    : 0;

  return (
    <div className="h-1 overflow-hidden rounded-full bg-ctp-surface0">
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
  label,
  detail,
  active,
  status,
  value,
}: {
  label: string;
  detail: string;
  active?: boolean;
  status?: string;
  value?: string;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-3 xl:px-4 xl:first:pl-0 xl:last:pr-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ctp-text">
          {label}
        </p>

        <p className="mt-0.5 truncate text-xs text-ctp-subtext0">
          {detail}
        </p>
      </div>

      {value !== undefined && (
        <p className="shrink-0 text-sm font-semibold tabular-nums text-ctp-text">
          {value}
        </p>
      )}

      {status !== undefined && active !== undefined && (
        <StatusDot
          tone={active ? "success" : "danger"}
          className="mt-0.5 shrink-0"
        >
          {status}
        </StatusDot>
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
  let tone: "danger" | "neutral" | "warning" | "success" = "danger";

  if (isDisabled) {
    statusLabel = "Disabled";
    tone = "neutral";
  } else if (isMaintenance) {
    statusLabel = "Maintenance";
    tone = "warning";
  } else if (isConnected) {
    statusLabel = "Connected";
    tone = "success";
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ctp-text">
          {terminal.name}
        </p>

        <p className="mt-0.5 truncate text-xs text-ctp-subtext0">
          {terminal.ip_address || terminal.device_id || "No device information"}
          {" · "}
          Last heartbeat {formatTimeAgo(terminal.last_seen_at)}
        </p>
      </div>

      <StatusDot tone={tone} className="mt-0.5 shrink-0">
        {statusLabel}
      </StatusDot>
    </div>
  );
}


// --------------------------------------------------
// Activity feed
// --------------------------------------------------


function getActivityAccent(event: ActivityEventRecord) {
  if (event.severity === "error") {
    return "bg-ctp-red";
  }

  if (event.severity === "warning") {
    return "bg-ctp-yellow";
  }

  if (event.event_type.startsWith("sale.")) {
    return "bg-ctp-green";
  }

  if (event.event_type.startsWith("terminal.")) {
    return "bg-ctp-blue";
  }

  if (event.event_type.startsWith("cashier.")) {
    return "bg-ctp-mauve";
  }

  return "bg-ctp-overlay1";
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
  const accent = getActivityAccent(event);

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={[
          "mt-[7px] size-1.5 shrink-0 rounded-full",
          accent,
        ].join(" ")}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="min-w-0 flex-1 text-sm leading-5 text-ctp-text">
            {event.summary}
          </p>

          <time className="shrink-0 whitespace-nowrap text-xs tabular-nums text-ctp-subtext0">
            {formatTimeAgo(event.created_at)}
          </time>
        </div>

        <p className="mt-0.5 break-words text-xs leading-relaxed text-ctp-subtext0">
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
      <span className="shrink-0 text-xs font-medium text-ctp-red">
        Out of stock
      </span>
    );
  }

  if (stock <= threshold) {
    return (
      <span className="shrink-0 text-xs font-medium tabular-nums text-ctp-yellow">
        {formatNumber(stock)} left
      </span>
    );
  }

  return (
    <span className="shrink-0 text-xs tabular-nums text-ctp-subtext1">
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
        title="No payments yet"
        description="Completed transactions in this period will appear here."
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
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-sm ${isCash ? "bg-ctp-green" : "bg-ctp-blue"}`}
                />

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


  const salesPeriods = [
    { label: "Today", report: dailyReport },
    { label: "This week", report: weeklyReport },
    { label: "This month", report: monthlyReport },
    { label: "This year", report: yearlyReport },
  ];

  return (
    <div className="w-full min-w-0 space-y-10 pb-8 font-line-seed">
      <div>
        <PageHeader
          title="Operations overview"
          description="Monitor sales, staff activity, inventory, and connected terminals."
          meta={
            <>
              <span className="truncate">API: {API_BASE_URL}</span>
              <span aria-hidden="true" className="text-ctp-surface2">·</span>
              <span>
                {updatedAt
                  ? `Updated ${formatDateTime(updatedAt.toISOString())}`
                  : "Waiting for dashboard data"}
              </span>
              <span aria-hidden="true" className="text-ctp-surface2">·</span>
              <span>Auto-refresh: 15 seconds</span>
            </>
          }
          actions={
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || loading}
              className={buttonSecondary}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={refreshing ? "animate-spin" : ""}
              />

              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          }
        />

        {/* Errors */}

        {(operations.error || health.error) && (
          <div className="space-y-2">
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
          </div>
        )}
      </div>


      <SystemHealthSection />

      {/* Sales snapshot */}

      <div className="grid grid-cols-1 gap-x-10 gap-y-10 xl:grid-cols-[1.4fr_1fr]">

        <Section
          title="Today's sales"
          description="Revenue from completed transactions today."
          bodyClassName=""
        >
          <p className="break-all text-2xl font-semibold tabular-nums text-ctp-text">
            {formatCurrency(salesToday?.revenue)}
          </p>

          <StatList
            className="mt-3"
            items={[
              {
                label: "Transactions",
                value: formatNumber(salesToday?.transactions),
                hint: "Completed sales",
              },
              {
                label: "Average transaction",
                value: formatCurrency(salesToday?.average_transaction_value),
                hint: "Average sale value",
              },
              {
                label: "Voided / refunded",
                value: formatNumber(salesToday?.reversed_transactions),
                hint: `${formatCurrency(salesToday?.reversed_amount)} not counted above`,
              },
              {
                label: "Active terminals",
                value: (
                  <>
                    {formatNumber(terminalSummary?.connected)}
                    <span className="ml-1 text-sm font-normal text-ctp-subtext0">
                      / {formatNumber(terminalSummary?.enabled)}
                    </span>
                  </>
                ),
                hint: "Connected and enabled",
              },
            ]}
          />
        </Section>


        <Section
          title="Sales performance"
          description="Revenue across reporting periods."
          bodyClassName=""
        >
          {dailyReport.error &&
            weeklyReport.error &&
            monthlyReport.error &&
            yearlyReport.error ? (
            <ErrorMessage>
              Sales reports could not be loaded.
            </ErrorMessage>
          ) : (
            <dl className="divide-y divide-ctp-surface0 border-y border-ctp-surface0">
              {salesPeriods.map(({ label, report }) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 py-2.5"
                >
                  <dt className="text-sm text-ctp-subtext1">{label}</dt>
                  <dd className="text-right">
                    <span className="text-sm font-semibold tabular-nums text-ctp-text">
                      {formatCurrency(report.data?.current.sales)}
                    </span>
                    <span className="ml-2 text-xs tabular-nums text-ctp-subtext0">
                      {formatNumber(report.data?.current.transactions)} transactions
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Section>
      </div>


      {/* System status */}

      <div className="space-y-3">
        <Section
          title="System status"
          bodyClassName=""
        >
          <div className="grid grid-cols-1 divide-y divide-ctp-surface0 border-y border-ctp-surface0 sm:grid-cols-2 sm:gap-x-8 xl:grid-cols-4 xl:gap-x-0 xl:divide-x xl:divide-y-0">
            <SystemStatusItem
              label="Kinesis API"
              detail="Backend service"
              active={apiOnline}
              status={apiOnline ? "Online" : "Unavailable"}
            />

            <SystemStatusItem
              label="PostgreSQL"
              detail="Database connection"
              active={databaseOnline}
              status={databaseOnline ? "Online" : "Unavailable"}
            />

            <SystemStatusItem
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
              label="Active cashiers"
              detail="Valid cashier sessions"
              value={formatNumber(activeCashiers.length)}
            />
          </div>
        </Section>


        {/* Operational alerts */}

        {hasOperationalIssues && (
          <Notice tone="warning" role="status" title="Attention required">
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {outOfStock > 0 && (
                <span className="text-ctp-red">
                  {formatNumber(outOfStock)} out of stock
                </span>
              )}

              {lowStock > 0 && (
                <span className="text-ctp-yellow">
                  {formatNumber(lowStock)} low-stock products
                </span>
              )}

              {disconnectedTerminals > 0 && (
                <span className="text-ctp-red">
                  {formatNumber(disconnectedTerminals)} disconnected terminals
                </span>
              )}
            </span>
          </Notice>
        )}
      </div>


      {/* Live operations */}

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-10 xl:grid-cols-[1.45fr_1fr]">

        <Panel
          title="Live activity"
          description="Recent events recorded across the POS."
          action={
            <StatusDot tone="success" pulse>
              Live updates
            </StatusDot>
          }
        >
          {operations.error && activities.length === 0 ? (
            <EmptyState
              title="Activity unavailable"
              description="The activity feed could not be loaded."
            />
          ) : activities.length === 0 ? (
            <EmptyState
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
          action={
            <SectionCount
              value={terminals.length}
            />
          }
        >
          {terminals.length === 0 ? (
            <EmptyState
              title="No terminals found"
              description="Paired terminals will appear here."
            />
          ) : (
            <div className="divide-y divide-ctp-surface0">
              {terminals.map((terminal) => (
                <TerminalStatus
                  key={terminal.id}
                  terminal={terminal}
                />
              ))}
            </div>
          )}

          {terminalSummary && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-ctp-surface0 pt-3 text-xs tabular-nums text-ctp-subtext0">
              <span>
                <span className="font-semibold text-ctp-green">
                  {formatNumber(terminalSummary.connected)}
                </span>{" "}
                connected
              </span>
              <span>
                <span className="font-semibold text-ctp-red">
                  {formatNumber(terminalSummary.disconnected)}
                </span>{" "}
                disconnected
              </span>
              <span>
                <span className="font-semibold text-ctp-yellow">
                  {formatNumber(terminalSummary.maintenance)}
                </span>{" "}
                maintenance
              </span>
            </p>
          )}
        </Panel>
      </div>


      {/* Business operations */}

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-10 xl:grid-cols-3">

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
              <EmptyState
                title="No active cashiers"
                description="Cashiers will appear here after signing in on a terminal."
              />
            ) : (
              <div className="mt-1 divide-y divide-ctp-surface0">
                {activeCashiers.map((cashier) => (
                  <div
                    key={`${cashier.cashier_id}-${cashier.terminal_id}`}
                    className="flex items-start justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ctp-text">
                        {cashier.display_name}
                      </p>

                      <p className="mt-0.5 truncate text-xs text-ctp-subtext0">
                        {cashier.terminal_name}
                      </p>
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

                      <p className="mt-0.5 text-xs text-ctp-subtext0">
                        {formatTimeAgo(cashier.session_started_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-ctp-surface0 pt-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionLabel>
                Today's performance
              </SectionLabel>

              <span className="text-xs text-ctp-subtext0">
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
            <div className="relative">
              <select
                value={paymentPeriod}
                onChange={(event) => {
                  setPaymentPeriod(event.target.value as ReportPeriod);
                }}
                aria-label="Payment distribution period"
                className={`${selectClass} !w-auto cursor-pointer !py-1 !text-xs`}
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
              <ChevronDown
                size={13}
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ctp-subtext0"
              />
            </div>
          }
        >
          {paymentBreakdown.error ? (
            <ErrorMessage>
              Payment breakdown could not be loaded: {paymentBreakdown.error}
            </ErrorMessage>
          ) : !paymentBreakdown.data ? (
            <p
              role="status"
              className="flex items-center gap-2 py-6 text-xs text-ctp-subtext0"
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className="animate-spin"
              />
              Loading payment data…
            </p>
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
            <span className="text-xs tabular-nums">
              <span className="text-ctp-yellow">
                {formatNumber(lowStock)} low
              </span>
              <span className="text-ctp-overlay1"> · </span>
              <span className="text-ctp-red">
                {formatNumber(outOfStock)} out
              </span>
            </span>
          }
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>
                Stock alerts
              </SectionLabel>

              <span className="text-xs text-ctp-subtext0">
                Threshold: {formatNumber(lowStockThreshold)}
              </span>
            </div>

            {!inventory || inventory.low_stock_products.length === 0 ? (
              <EmptyState
                title="Inventory looks good"
                description="No products are currently below the configured stock threshold."
              />
            ) : (
              <div className="mt-1 divide-y divide-ctp-surface0">
                {inventory.low_stock_products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 py-2.5"
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

          <div className="mt-4 border-t border-ctp-surface0 pt-3">
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
                title="No product sales yet"
                description="Product rankings will appear after completed sales."
              />
            ) : (
              <ol className="space-y-3">
                {topProducts.map((product, index) => {
                  const maximumUnits = Math.max(
                    ...topProducts.map((item) => item.units_sold),
                    1,
                  );

                  return (
                    <li
                      key={`${product.product_id ?? product.name}-${index}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="w-4 shrink-0 text-right text-xs tabular-nums text-ctp-subtext0">
                            {index + 1}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate text-sm text-ctp-text">
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

                      <div className="mt-1.5 pl-6">
                        <ProgressBar
                          value={product.units_sold}
                          maximum={maximumUnits}
                          color="bg-ctp-teal"
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </Panel>
      </div>


      {/* Recent transactions */}

      <Section
        title="Recent transactions"
        description="Latest recorded sales from the POS."
        badge={<SectionCount value={transactions.length} />}
        bodyClassName=""
      >
        {recentSales.error ? (
          <ErrorMessage>
            Recent transactions could not be loaded: {recentSales.error}
          </ErrorMessage>
        ) : transactions.length === 0 ? (
          <div className="border-y border-ctp-surface0">
            <EmptyState
              title="No transactions yet"
              description="Completed sales will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto border-y border-ctp-surface0">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ctp-surface0">
                  <th scope="col" className={`${tableHead} pl-0`}>
                    Transaction
                  </th>

                  <th scope="col" className={tableHead}>
                    Cashier
                  </th>

                  <th scope="col" className={tableHead}>
                    Terminal
                  </th>

                  <th scope="col" className={tableHead}>
                    Payment
                  </th>

                  <th scope="col" className={`${tableHead} text-right`}>
                    Amount
                  </th>

                  <th scope="col" className={`${tableHead} pr-0 text-right`}>
                    Time
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-ctp-surface0">
                {transactions.map((sale) => (
                  <tr
                    key={sale.id}
                    className="transition-colors hover:bg-ctp-surface0/30"
                  >
                    <td className="py-2.5 pr-3">
                      <p className="text-sm font-medium text-ctp-text">
                        {sale.transaction_code}
                      </p>

                      <p className="mt-0.5 text-xs text-ctp-subtext0">
                        {formatNumber(sale.item_count)} items
                      </p>
                    </td>

                    <td className="px-3 py-2.5 text-sm text-ctp-subtext1">
                      {sale.cashier_display_name
                        || sale.cashier_username
                        || "Unassigned"}
                    </td>

                    <td className="px-3 py-2.5 text-sm text-ctp-subtext1">
                      {sale.terminal_device_id
                        || (sale.terminal_id
                          ? `Terminal ${sale.terminal_id}`
                          : "—")}
                    </td>

                    <td className="px-3 py-2.5 text-sm text-ctp-subtext1">
                      {paymentLabel(sale.payment_method)}
                    </td>

                    <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-ctp-text">
                      {formatCurrency(sale.total)}
                    </td>

                    <td className="py-2.5 pl-3 text-right text-xs tabular-nums text-ctp-subtext0">
                      {formatDateTime(sale.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>


      {/* Footer */}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ctp-surface0 pt-3 text-xs text-ctp-subtext0">
        <span>
          {data
            ? `Operational snapshot: ${formatDateTime(data.as_of)}`
            : "Waiting for operational snapshot"}
        </span>

        <span>
          {formatNumber(data?.service_catalog_count)} services in catalogue
        </span>
      </footer>
    </div>
  );
}
