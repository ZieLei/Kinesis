import {
  Activity,
  AlertTriangle,
  Database,
  Globe,
  Monitor,
  Network,
  RefreshCw,
  Server,
  Smartphone,
  Wifi,
} from "lucide-react";

import { API_BASE_URL } from "../lib/api";
import { useAdminOverview } from "../hooks/useAdminOverview";
import type { Product, SaleListItem } from "../types/admin";

type StatusTone = "green" | "red" | "yellow" | "neutral";

const statusStyles: Record<StatusTone, string> = {
  green: "border-ctp-green/20 bg-ctp-green/10 text-ctp-green",
  red: "border-ctp-red/20 bg-ctp-red/10 text-ctp-red",
  yellow: "border-ctp-yellow/20 bg-ctp-yellow/10 text-ctp-yellow",
  neutral: "border-ctp-surface1 bg-ctp-surface0/50 text-ctp-subtext1",
};

const dotStyles: Record<StatusTone, string> = {
  green: "bg-ctp-green",
  red: "bg-ctp-red",
  yellow: "bg-ctp-yellow",
  neutral: "bg-ctp-overlay1",
};

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanizeStatus(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getSaleTone(status: string): StatusTone {
  switch (status.toLowerCase()) {
    case "completed":
      return "green";
    case "pending":
      return "yellow";
    case "cancelled":
    case "failed":
      return "red";
    default:
      return "neutral";
  }
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[tone]}`} />
      {label}
    </span>
  );
}

function SectionError({
  message,
}: {
  message: string;
}) {
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-lg border border-ctp-red/20 bg-ctp-red/5 p-3 text-sm text-ctp-red"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p className="min-w-0 break-words">{message}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ctp-surface1 px-4 py-6 text-center text-sm text-ctp-subtext0">
      {message}
    </div>
  );
}

function OverviewCard({
  label,
  value,
  valueClass = "text-ctp-text",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
      <div className="flex flex-col gap-1 text-center">
        <span className="text-sm font-bold text-ctp-subtext1">
          {label}
        </span>
        <span
          className={`break-words text-xl font-bold ${valueClass}`}
          aria-live="polite"
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function LowStockRow({ product }: { product: Product }) {
  const outOfStock = product.stock === 0;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-ctp-base p-3 ${outOfStock ? "border-ctp-red/60" : "border-ctp-peach/50"
        }`}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-ctp-text">
          {product.name}
        </p>
        <p className="mt-1 text-xs text-ctp-subtext0">
          {product.sku ? `SKU: ${product.sku}` : product.category}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-ctp-subtext0">In inventory</span>
        <span
          className={`text-sm font-bold ${outOfStock ? "text-ctp-red" : "text-ctp-peach"
            }`}
        >
          {outOfStock ? "OUT OF STOCK" : `${product.stock} LEFT`}
        </span>
      </div>
    </div>
  );
}

function TopProductRow({
  product,
  index,
}: {
  product: {
    name: string;
    category: string;
    units_sold: number;
    revenue: number;
  };
  index: number;
}) {
  const rankStyles = [
    "bg-ctp-yellow/20 text-ctp-yellow",
    "bg-ctp-overlay1/20 text-ctp-subtext1",
    "bg-ctp-peach/20 text-ctp-peach",
  ];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold ${rankStyles[index] ?? "bg-ctp-mauve/20 text-ctp-mauve"
          }`}
      >
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-ctp-text">
          {product.name}
        </p>
        <p className="mt-1 text-xs text-ctp-subtext0">
          {product.category} · {product.units_sold} units sold
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-ctp-green">
          {formatMoney(product.revenue)}
        </p>
        <p className="mt-1 text-xs text-ctp-subtext0">Revenue</p>
      </div>
    </div>
  );
}

function RecentTransactionRow({
  transaction,
}: {
  transaction: SaleListItem;
}) {
  const tone = getSaleTone(transaction.status);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-ctp-text">
          {transaction.transaction_code}
        </p>
        <p className="mt-1 text-xs text-ctp-subtext0">
          {transaction.item_count}{" "}
          {transaction.item_count === 1 ? "unit" : "units"} ·{" "}
          {formatDateTime(transaction.created_at)}
        </p>
        <p className="mt-1 text-xs capitalize text-ctp-subtext0">
          {transaction.payment_method}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-sm font-bold text-ctp-text">
          {formatMoney(transaction.total)}
        </span>
        <StatusPill label={humanizeStatus(transaction.status)} tone={tone} />
      </div>
    </div>
  );
}

export default function Overview() {
  const {
    health,
    products,
    dailyReport,
    weeklyReport,
    monthlyReport,
    productReport,
    recentSales,
    loading,
    refreshing,
    lastUpdated,
    refresh,
  } = useAdminOverview();

  const apiOnline = health.data?.status === "online";
  const apiTone: StatusTone = apiOnline
    ? "green"
    : health.error
      ? "red"
      : "yellow";

  const apiLabel = apiOnline
    ? "ONLINE"
    : health.error
      ? "OFFLINE"
      : "CHECKING";

  const databaseVerified = products.data !== null;
  const databaseTone: StatusTone = databaseVerified
    ? "green"
    : products.error
      ? "red"
      : "yellow";

  const databaseLabel = databaseVerified
    ? "QUERY OK"
    : products.error
      ? "UNAVAILABLE"
      : "CHECKING";

  const allProducts = products.data;
  const lowStockCount =
    allProducts?.filter((product) => product.stock > 0 && product.stock <= 5)
      .length ?? null;

  const outOfStockCount =
    allProducts?.filter((product) => product.stock === 0).length ?? null;

  const lowStockProducts = [...(allProducts ?? [])]
    .filter((product) => product.stock <= 5)
    .sort((left, right) => left.stock - right.stock)
    .slice(0, 5);

  const topProducts = productReport.data?.top_products ?? [];
  const transactions = recentSales.data?.items ?? [];

  return (
    <div className="flex flex-col gap-5 font-line-seed lg:flex-row">
      <div className="flex min-w-0 flex-col gap-5 lg:w-[380px] lg:shrink-0">
        {/* Server */}
        <section className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-surface0 text-ctp-text">
              <Server size={21} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ctp-text">Server</h2>
              <p className="text-sm text-ctp-subtext0">
                Backend service status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-ctp-surface2/50 bg-ctp-base p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ctp-surface2/15 text-ctp-text">
              <Activity size={24} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-ctp-subtext0">API status</p>
              <p className="break-words text-base font-bold text-ctp-text">
                {apiOnline
                  ? "FastAPI is responding"
                  : health.error
                    ? "Cannot reach FastAPI"
                    : "Checking API connection…"}
              </p>
            </div>

            <StatusPill label={apiLabel} tone={apiTone} />
          </div>

          {health.error && <SectionError message={health.error} />}

          <div className="mt-5 flex flex-col divide-y divide-ctp-surface0">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Globe size={16} className="shrink-0 text-ctp-overlay1" />
                <span className="text-sm font-medium">FastAPI</span>
              </div>
              <StatusPill label={apiLabel} tone={apiTone} />
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Network size={16} className="mt-0.5 shrink-0 text-ctp-overlay1" />
                <span className="text-sm font-medium">API endpoint</span>
              </div>
              <span className="max-w-[60%] break-all text-right font-mono text-xs font-medium text-ctp-text">
                {API_BASE_URL}
              </span>
            </div>
          </div>
        </section>

        {/* Network and database */}
        <section className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-surface0 text-ctp-text">
              <Wifi size={21} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ctp-text">Network</h2>
              <p className="text-sm text-ctp-subtext0">
                Host, terminals, and database
              </p>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-ctp-surface0">
            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Monitor size={16} className="mt-0.5 shrink-0 text-ctp-overlay1" />
                <span className="text-sm font-medium">Host machine</span>
              </div>
              <div className="max-w-[60%] text-right">
                <p className="text-sm font-semibold text-ctp-text">
                  Not reported
                </p>
                <p className="text-xs text-ctp-subtext0">
                  Host OS details are not exposed by the API
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Smartphone
                  size={16}
                  className="mt-0.5 shrink-0 text-ctp-overlay1"
                />
                <span className="text-sm font-medium">Active terminals</span>
              </div>
              <div className="max-w-[60%] text-right">
                <p className="text-sm font-semibold text-ctp-text">
                  Not tracked
                </p>
                <p className="text-xs text-ctp-subtext0">
                  The backend has no active-device endpoint
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-start gap-2 text-ctp-subtext1">
                <Database
                  size={16}
                  className="mt-0.5 shrink-0 text-ctp-overlay1"
                />
                <span className="text-sm font-medium">Database</span>
              </div>
              <div className="flex max-w-[60%] flex-col items-end gap-2 text-right">
                <p className="text-sm font-semibold text-ctp-text">
                  PostgreSQL
                </p>
                <StatusPill label={databaseLabel} tone={databaseTone} />
              </div>
            </div>
          </div>

          {products.error && <SectionError message={products.error} />}
        </section>
      </div>

      {/* Business overview and recent activity */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section className="w-full rounded-lg border border-ctp-surface0 bg-ctp-surface2/20 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-ctp-text">
              Business Overview
            </h2>

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm font-semibold text-ctp-text transition hover:bg-ctp-surface0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-mauve disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <OverviewCard
              label="Today's Sales"
              value={
                dailyReport.data
                  ? formatMoney(dailyReport.data.current.sales)
                  : loading
                    ? "Loading…"
                    : "—"
              }
            />

            <OverviewCard
              label="Transactions"
              value={
                recentSales.data
                  ? recentSales.data.count.toLocaleString("en-PH")
                  : loading
                    ? "Loading…"
                    : "—"
              }
            />

            <OverviewCard
              label="Low Stock Items"
              value={
                lowStockCount !== null
                  ? lowStockCount.toLocaleString("en-PH")
                  : loading
                    ? "Loading…"
                    : "—"
              }
              valueClass="text-ctp-yellow"
            />

            <OverviewCard
              label="Out of Stock"
              value={
                outOfStockCount !== null
                  ? outOfStockCount.toLocaleString("en-PH")
                  : loading
                    ? "Loading…"
                    : "—"
              }
              valueClass="text-ctp-red"
            />
          </div>

          {(dailyReport.error || recentSales.error) && (
            <SectionError
              message={
                dailyReport.error
                  ? `Today's sales could not be loaded: ${dailyReport.error}`
                  : `Transaction count could not be loaded: ${recentSales.error}`
              }
            />
          )}

          {weeklyReport.error && (
            <SectionError
              message={`Weekly sales report could not be loaded: ${weeklyReport.error}`}
            />
          )}

          {monthlyReport.error && (
            <SectionError
              message={`Monthly sales report could not be loaded: ${monthlyReport.error}`}
            />
          )}

          {!loading && lastUpdated && (
            <p className="mt-3 text-right text-xs text-ctp-subtext0">
              Last updated{" "}
              {new Date(lastUpdated).toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-ctp-surface0 bg-ctp-surface2/20 p-4">
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-ctp-text">
              Recent Activity
            </h2>
          </div>

          {/* Low stock */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-ctp-text">
                Low Stock Alerts
              </h3>
              {allProducts && (
                <span className="text-xs text-ctp-subtext0">
                  {lowStockProducts.length} shown
                </span>
              )}
            </div>

            {products.error ? (
              <SectionError message={products.error} />
            ) : loading && !allProducts ? (
              <EmptyState message="Loading inventory…" />
            ) : lowStockProducts.length > 0 ? (
              <div className="flex flex-col gap-2">
                {lowStockProducts.map((product) => (
                  <LowStockRow key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <EmptyState
                message={
                  allProducts
                    ? "No products have 5 or fewer units in stock."
                    : "Inventory data is unavailable."
                }
              />
            )}
          </div>

          {/* Best sellers */}
          <div className="mb-6">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-ctp-text">
                Top Selling Products
              </h3>
            </div>

            {productReport.error ? (
              <SectionError message={productReport.error} />
            ) : productReport.data && topProducts.length > 0 ? (
              <div className="flex flex-col gap-2">
                {topProducts.slice(0, 5).map((product, index) => (
                  <TopProductRow
                    key={`${product.product_id ?? "deleted"}-${product.name}-${index}`}
                    product={product}
                    index={index}
                  />
                ))}
              </div>
            ) : loading ? (
              <EmptyState message="Loading sales data…" />
            ) : (
              <EmptyState message="No completed product sales to show." />
            )}
          </div>

          {/* Recent transactions */}
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-ctp-text">
                Recent Transactions
              </h3>
              {recentSales.data && (
                <span className="text-xs text-ctp-subtext0">
                  {recentSales.data.count.toLocaleString("en-PH")} total
                </span>
              )}
            </div>

            {recentSales.error ? (
              <SectionError message={recentSales.error} />
            ) : transactions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {transactions.map((transaction) => (
                  <RecentTransactionRow
                    key={transaction.id}
                    transaction={transaction}
                  />
                ))}
              </div>
            ) : loading ? (
              <EmptyState message="Loading transactions…" />
            ) : (
              <EmptyState message="No transactions have been recorded." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
