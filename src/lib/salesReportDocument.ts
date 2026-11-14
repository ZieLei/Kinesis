/**
 * Sales Summary report documents (PDF via HTML, and CSV) for the Reports
 * screen's Export action.
 *
 * Layout follows the usual POS "sales summary" conventions:
 *   1. Identity: business, report title, exact period and timezone,
 *      generation time, who prepared it, a report reference.
 *   2. Key figures with the change against the previous period.
 *   3. Sales reconciliation: gross sales - discounts = net sales,
 *      + tax (+ cash rounding) = total collected.
 *   4. Activity: transactions, items, average transaction value, units per
 *      transaction, discounted transactions.
 *   5. Tenders (payment methods), revenue by type, gross profit with its
 *      cost coverage.
 *   6. Sales by category, top items, the period trend, peak hours.
 *   7. Notes and metric definitions.
 *
 * Pure functions only (no React, no I/O), so the output can be tested and
 * reused by native and web exporters. All text is HTML-escaped; CSV cells
 * follow RFC 4180 and are guarded against spreadsheet formula injection.
 */

import { formatPOSCurrency, type POSCurrencySettings } from "@/lib/posFormatting";
import type { BusinessAnalyticsReport } from "@/types/analytics";
import type {
  ProductSalesReport,
  ReportPeriod,
  SalesReportResponse,
  SalesSummary,
  TopProductSales,
} from "@/types/sale";

export type SalesReportInput = {
  period: ReportPeriod;
  sales: SalesReportResponse;
  /** Product report for the period; `top_products` may hold every item. */
  products: ProductSalesReport | null;
  analytics: BusinessAnalyticsReport | null;
  /** Currency format and the receipt header (business name/address). */
  settings: (POSCurrencySettings & { receiptHeader?: string }) | null;
  preparedBy: string | null;
  generatedAt: Date;
};

export const PERIOD_TITLES: Record<ReportPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom Range",
};

/** Number of items listed in the PDF; the CSV lists every item. */
export const PDF_TOP_ITEMS = 15;

const PAYMENT_LABELS: Record<string, string> = { cash: "Cash", gcash: "GCash" };
const REVENUE_TYPE_LABELS: Record<string, string> = { parts: "Products (parts)", services: "Services" };

// --------------------------------------------------------------------------
// Figures
// --------------------------------------------------------------------------

export type Reconciliation = {
  gross: number;
  discounts: number;
  net: number;
  tax: number;
  rounding: number;
  collected: number;
  /** False when the server predates the breakdown (only totals known). */
  complete: boolean;
};

// `|| 0` turns -0 (float leftovers) into 0, which would print as "-₱0.00".
const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

export function reconcile(summary: SalesSummary): Reconciliation {
  const collected = summary.sales ?? 0;
  if (summary.net_sales === undefined || summary.gross_sales === undefined) {
    return { gross: collected, discounts: 0, net: collected, tax: 0, rounding: 0, collected, complete: false };
  }
  const tax = summary.tax ?? 0;
  return {
    gross: summary.gross_sales,
    discounts: summary.discounts ?? 0,
    net: summary.net_sales,
    tax,
    rounding: round2(collected - summary.net_sales - tax),
    collected,
    complete: true,
  };
}

export function averageTransaction(summary: SalesSummary): number {
  return summary.transactions > 0 ? summary.sales / summary.transactions : 0;
}

export function unitsPerTransaction(summary: SalesSummary): number {
  return summary.transactions > 0 ? summary.items / summary.transactions : 0;
}

/** Percentage change, or null when there is no base to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// --------------------------------------------------------------------------
// Dates
// --------------------------------------------------------------------------

function dateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function formatDay(value: string, withWeekday = false): string {
  return dateOnly(value).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  });
}

/** "1 Nov 2026 – 30 Nov 2026" from an inclusive start and exclusive end. */
export function formatRange(start: string, endExclusive: string): string {
  const end = new Date(dateOnly(endExclusive).getTime() - 86_400_000).toISOString().slice(0, 10);
  return start === end ? formatDay(start, true) : `${formatDay(start)} – ${formatDay(end)}`;
}

export function inclusiveEnd(endExclusive: string): string {
  return new Date(dateOnly(endExclusive).getTime() - 86_400_000).toISOString().slice(0, 10);
}

function formatTimestamp(date: Date, timeZone: string): string {
  return date.toLocaleString("en-PH", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Stable reference printed on the report, e.g. RPT-20261130-1542-M. */
export function reportReference(input: SalesReportInput): string {
  const tz = input.sales.timezone || "Asia/Manila";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(input.generatedAt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `RPT-${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}-${input.period[0].toUpperCase()}`;
}

export function reportFileName(input: SalesReportInput, extension: "pdf" | "csv"): string {
  const end = inclusiveEnd(input.sales.period_end_exclusive);
  const range = input.sales.period_start === end ? end : `${input.sales.period_start}_to_${end}`;
  return `kinesis-sales-report-${input.period}-${range}.${extension}`;
}

type Granularity = "hour" | "day" | "month";

/** Older servers did not send the granularity: derive it from the period. */
function granularityOf(granularity: Granularity | undefined, period: ReportPeriod): Granularity {
  return granularity ?? (period === "daily" ? "hour" : period === "yearly" ? "month" : "day");
}

function granularityUnit(granularity: Granularity | undefined, period: ReportPeriod): string {
  const g = granularityOf(granularity, period);
  return g === "hour" ? "Hour" : g === "month" ? "Month" : "Day";
}

function seriesLabel(point: { label: string; date?: string }, granularity: Granularity): string {
  if (granularity === "hour") return hourLabel(Number(point.label.slice(0, 2)));
  if (point.date) {
    return dateOnly(point.date).toLocaleDateString(
      "en-PH",
      granularity === "month"
        ? { timeZone: "UTC", month: "long", year: "numeric" }
        : { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" },
    );
  }
  return point.label;
}

function hourLabel(hour: number): string {
  const next = (hour + 1) % 24;
  return `${String(hour).padStart(2, "0")}:00–${String(next).padStart(2, "0")}:00`;
}

// --------------------------------------------------------------------------
// Shared text
// --------------------------------------------------------------------------

function businessLines(input: SalesReportInput): string[] {
  return (input.settings?.receiptHeader ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function itemStatus(item: TopProductSales): string {
  if (item.deleted) return "deleted";
  if (item.archived) return "archived";
  return "";
}

const NOTES = [
  "Completed sales only. Times and period boundaries use the report timezone.",
  "Gross sales: line totals before discounts. Net sales: gross sales minus discounts, before tax.",
  "Total collected: net sales plus tax and cash rounding; this is what tenders should add up to.",
  "Average transaction value: total collected divided by transactions. Units per transaction: items sold divided by transactions.",
  "Items sold counts product units and service quantities.",
];

// --------------------------------------------------------------------------
// HTML (printed to PDF)
// --------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function changeCell(current: number, previous: number, format: (n: number) => string, invert = false): string {
  const pct = percentChange(current, previous);
  const delta = current - previous;
  if (pct === null) {
    return `<td class="num muted">${current === 0 ? "—" : "new"}</td>`;
  }
  const good = invert ? delta < 0 : delta > 0;
  const cls = delta === 0 ? "muted" : good ? "up" : "down";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `<td class="num ${cls}">${sign}${escapeHtml(format(Math.abs(delta)))} (${sign}${Math.abs(pct).toFixed(1)}%)</td>`;
}

export function createSalesReportHtml(input: SalesReportInput): string {
  const { sales, products, analytics, period } = input;
  const tz = sales.timezone || "Asia/Manila";
  const money = (n: number) => formatPOSCurrency(n, input.settings);
  const count = (n: number) => n.toLocaleString("en-PH");
  const dec = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const cur = sales.current;
  const prev = sales.previous;
  const rc = reconcile(cur);
  const rp = reconcile(prev);
  const currentRange = formatRange(sales.period_start, sales.period_end_exclusive);
  const previousRange = formatRange(sales.previous_period_start, sales.previous_period_end_exclusive);
  const title = `${PERIOD_TITLES[period]} Sales Summary`;
  const business = businessLines(input);

  const kpi = (label: string, value: string, curN: number, prevN: number) => {
    const p = percentChange(curN, prevN);
    const trend = p === null ? (curN === 0 ? "" : "new this period")
      : `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}% vs previous`;
    const cls = p === null || p === 0 ? "muted" : p > 0 ? "up" : "down";
    return `<div class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-trend ${cls}">${escapeHtml(trend)}</div></div>`;
  };

  const sections: string[] = [];

  // Reconciliation
  const reconRows: [string, number, number, boolean?][] = [
    ["Gross sales", rc.gross, rp.gross],
    ["Less: discounts", rc.discounts, rp.discounts, true],
    ["Net sales", rc.net, rp.net],
    ["Tax", rc.tax, rp.tax],
  ];
  if (rc.rounding !== 0 || rp.rounding !== 0) reconRows.push(["Cash rounding", rc.rounding, rp.rounding]);
  sections.push(`
    <section>
      <h2>Sales reconciliation</h2>
      <table>
        <thead><tr><th>Line</th><th class="num">This period</th><th class="num">Previous period</th><th class="num">Change</th></tr></thead>
        <tbody>
          ${reconRows.map(([label, c, p, invert]) => `<tr${label === "Net sales" ? ' class="subtotal"' : ""}><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(invert && c ? `(${money(c)})` : money(c))}</td><td class="num">${escapeHtml(invert && p ? `(${money(p)})` : money(p))}</td>${changeCell(c, p, money, invert)}</tr>`).join("")}
        </tbody>
        <tfoot><tr><td>Total collected</td><td class="num">${escapeHtml(money(rc.collected))}</td><td class="num">${escapeHtml(money(rp.collected))}</td>${changeCell(rc.collected, rp.collected, money)}</tr></tfoot>
      </table>
      ${rc.complete ? "" : '<p class="note">This server does not report gross sales, discounts and tax separately; only totals are shown.</p>'}
    </section>`);

  // Activity
  const activity: [string, number, number, (n: number) => string][] = [
    ["Transactions", cur.transactions, prev.transactions, count],
    ["Items sold", cur.items, prev.items, count],
    ["Average transaction value", averageTransaction(cur), averageTransaction(prev), money],
    ["Units per transaction", unitsPerTransaction(cur), unitsPerTransaction(prev), dec],
  ];
  if (cur.discounted_transactions !== undefined) {
    activity.push(["Discounted transactions", cur.discounted_transactions, prev.discounted_transactions ?? 0, count]);
  }
  sections.push(`
    <section>
      <h2>Sales activity</h2>
      <table>
        <thead><tr><th>Measure</th><th class="num">This period</th><th class="num">Previous period</th><th class="num">Change</th></tr></thead>
        <tbody>${activity.map(([label, c, p, f]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(f(c))}</td><td class="num">${escapeHtml(f(p))}</td>${changeCell(c, p, f)}</tr>`).join("")}</tbody>
      </table>
    </section>`);

  // Tenders and revenue type
  if (analytics) {
    const tenders = analytics.payment_methods;
    const tenderTotal = tenders.reduce((s, t) => s + t.revenue, 0);
    const tenderCount = tenders.reduce((s, t) => s + t.transactions, 0);
    const types = analytics.revenue_breakdown;
    const typeTotal = types.reduce((s, t) => s + t.revenue, 0);
    sections.push(`
      <section class="pair">
        <div>
          <h2>Payments by tender</h2>
          <table>
            <thead><tr><th>Tender</th><th class="num">Transactions</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
            <tbody>${tenders.length ? tenders.map((t) => `<tr><td>${escapeHtml(PAYMENT_LABELS[t.method] ?? t.method)}</td><td class="num">${count(t.transactions)}</td><td class="num">${escapeHtml(money(t.revenue))}</td><td class="num">${pct(t.percentage)}</td></tr>`).join("") : '<tr><td colspan="4" class="muted">No payments in this period.</td></tr>'}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${count(tenderCount)}</td><td class="num">${escapeHtml(money(tenderTotal))}</td><td class="num">${tenderTotal > 0 ? "100.0%" : "—"}</td></tr></tfoot>
          </table>
        </div>
        <div>
          <h2>Revenue by type</h2>
          <table>
            <thead><tr><th>Type</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead>
            <tbody>${types.map((t) => `<tr><td>${escapeHtml(REVENUE_TYPE_LABELS[t.type] ?? t.type)}</td><td class="num">${escapeHtml(money(t.revenue))}</td><td class="num">${typeTotal > 0 ? pct((t.revenue / typeTotal) * 100) : "—"}</td></tr>`).join("")}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${escapeHtml(money(typeTotal))}</td><td class="num">${typeTotal > 0 ? "100.0%" : "—"}</td></tr></tfoot>
          </table>
        </div>
      </section>`);

    const gp = analytics.revenue_profit;
    const margin = gp.known_gross_profit !== null && gp.revenue > 0 && gp.cost_coverage > 0
      ? (gp.known_gross_profit / (gp.revenue * (gp.cost_coverage / 100))) * 100 : null;
    sections.push(`
      <section>
        <h2>Gross profit</h2>
        <table>
          <tbody>
            <tr><td>Revenue (line totals)</td><td class="num">${escapeHtml(money(gp.revenue))}</td></tr>
            <tr><td>Known gross profit</td><td class="num">${gp.known_gross_profit === null ? "—" : escapeHtml(money(gp.known_gross_profit))}</td></tr>
            <tr><td>Gross margin on costed lines</td><td class="num">${margin === null ? "—" : pct(margin)}</td></tr>
            <tr><td>Cost coverage</td><td class="num">${pct(gp.cost_coverage)} (${count(gp.total_line_count - gp.uncosted_line_count)} of ${count(gp.total_line_count)} lines costed)</td></tr>
          </tbody>
        </table>
        <p class="note">${escapeHtml(gp.gross_profit_definition)}</p>
      </section>`);
  }

  // Categories
  if (products) {
    const cats = [...products.categories].sort((a, b) => b.revenue - a.revenue);
    const catTotal = cats.reduce((s, c) => s + c.revenue, 0);
    const catUnits = cats.reduce((s, c) => s + c.units_sold, 0);
    sections.push(`
      <section>
        <h2>Sales by category</h2>
        <table>
          <thead><tr><th>Category</th><th class="num">Units</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead>
          <tbody>${cats.length ? cats.map((c) => `<tr><td>${escapeHtml(c.category)}</td><td class="num">${count(c.units_sold)}</td><td class="num">${escapeHtml(money(c.revenue))}</td><td class="num">${catTotal > 0 ? pct((c.revenue / catTotal) * 100) : "—"}</td></tr>`).join("") : '<tr><td colspan="4" class="muted">No product sales in this period.</td></tr>'}</tbody>
          ${cats.length ? `<tfoot><tr><td>Total</td><td class="num">${count(catUnits)}</td><td class="num">${escapeHtml(money(catTotal))}</td><td class="num">100.0%</td></tr></tfoot>` : ""}
        </table>
      </section>`);

    const items = products.top_products.slice(0, PDF_TOP_ITEMS);
    const itemTotal = products.top_products.reduce((s, i) => s + i.revenue, 0) || catTotal;
    sections.push(`
      <section>
        <h2>Top ${items.length || ""} items by revenue</h2>
        <table>
          <thead><tr><th class="num">#</th><th>Item</th><th>SKU</th><th>Category</th><th class="num">Units</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead>
          <tbody>${items.length ? items.map((i, n) => `<tr><td class="num">${n + 1}</td><td>${escapeHtml(i.name)}${itemStatus(i) ? ` <span class="tag">${itemStatus(i)}</span>` : ""}</td><td>${escapeHtml(i.sku ?? "—")}</td><td>${escapeHtml(i.category)}</td><td class="num">${count(i.units_sold)}</td><td class="num">${escapeHtml(money(i.revenue))}</td><td class="num">${itemTotal > 0 ? pct((i.revenue / itemTotal) * 100) : "—"}</td></tr>`).join("") : '<tr><td colspan="7" class="muted">No items sold in this period.</td></tr>'}</tbody>
        </table>
        ${products.total_products > items.length ? `<p class="note">${count(products.total_products)} items sold in total; the CSV export lists all of them.</p>` : ""}
      </section>`);
  }

  // Trend
  const series = sales.series;
  const seriesTotals = series.reduce((a, p) => ({ t: a.t + p.transactions, i: a.i + p.items, s: a.s + p.sales }), { t: 0, i: 0, s: 0 });
  const unit = granularityUnit(sales.granularity, period);
  sections.push(`
    <section>
      <h2>Sales by ${unit.toLowerCase()}</h2>
      <table class="compact">
        <thead><tr><th>${unit}</th><th class="num">Transactions</th><th class="num">Items</th><th class="num">Total collected</th></tr></thead>
        <tbody>${series.map((p) => `<tr${p.transactions === 0 ? ' class="zero"' : ""}><td>${escapeHtml(seriesLabel(p, granularityOf(sales.granularity, period)))}</td><td class="num">${count(p.transactions)}</td><td class="num">${count(p.items)}</td><td class="num">${escapeHtml(money(p.sales))}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${count(seriesTotals.t)}</td><td class="num">${count(seriesTotals.i)}</td><td class="num">${escapeHtml(money(seriesTotals.s))}</td></tr></tfoot>
      </table>
    </section>`);

  if (analytics && analytics.peak_hours.length) {
    sections.push(`
      <section>
        <h2>Peak hours</h2>
        <table>
          <thead><tr><th>Hour</th><th class="num">Transactions</th><th class="num">Revenue</th></tr></thead>
          <tbody>${analytics.peak_hours.slice(0, 5).map((h) => `<tr><td>${hourLabel(h.hour)}</td><td class="num">${count(h.transactions)}</td><td class="num">${escapeHtml(money(h.revenue))}</td></tr>`).join("")}</tbody>
        </table>
      </section>`);
  }

  sections.push(`
    <section class="notes">
      <h2>Notes and definitions</h2>
      <ul>${NOTES.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
    </section>`);

  const reference = reportReference(input);
  const generated = formatTimestamp(input.generatedAt, tz);
  const aov = averageTransaction(cur);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(reportFileName(input, "pdf").replace(/\.pdf$/, ""))}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  @page { @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt system-ui, sans-serif; color: #6c6f85; } }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 9.5pt/1.4 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2430; }
  header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1e66f5; padding-bottom: 10px; margin-bottom: 12px; }
  .business { font-weight: 700; font-size: 11pt; }
  .business-extra { color: #5c5f77; font-size: 8.5pt; }
  h1 { margin: 6px 0 2px; font-size: 16pt; }
  .period { font-size: 10pt; color: #4c4f69; }
  .meta { text-align: right; font-size: 8.5pt; color: #5c5f77; line-height: 1.6; white-space: nowrap; }
  .meta b { color: #1f2430; font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi { border: 1px solid #ccd0da; border-radius: 6px; padding: 8px 10px; break-inside: avoid; }
  .kpi-label { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #6c6f85; }
  .kpi-value { font-size: 13pt; font-weight: 700; margin-top: 2px; }
  .kpi-trend { font-size: 8pt; margin-top: 2px; }
  section { margin-bottom: 14px; break-inside: avoid; }
  section.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  h2 { font-size: 10.5pt; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ccd0da; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 6px; text-align: left; vertical-align: top; }
  thead th { font-size: 8pt; text-transform: uppercase; letter-spacing: .03em; color: #5c5f77; background: #eff1f5; border-bottom: 1px solid #ccd0da; }
  tbody tr { break-inside: avoid; }
  tbody tr + tr td { border-top: 1px solid #e6e9ef; }
  tfoot td, tr.subtotal td { font-weight: 700; border-top: 1.5px solid #4c4f69; }
  table.compact td { padding: 2px 6px; }
  tr.zero td { color: #9ca0b0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #8c8fa1; }
  .up { color: #40a02b; }
  .down { color: #d20f39; }
  .tag { font-size: 7pt; text-transform: uppercase; color: #8c8fa1; border: 1px solid #ccd0da; border-radius: 3px; padding: 0 3px; }
  .note { font-size: 8pt; color: #6c6f85; margin: 4px 0 0; }
  .notes ul { margin: 0; padding-left: 16px; font-size: 8pt; color: #5c5f77; }
  footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #ccd0da; font-size: 8pt; color: #8c8fa1; break-inside: avoid; }
  footer div + div { margin-top: 2px; }
  .nowrap { white-space: nowrap; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
</style>
</head>
<body>
  <header>
    <div>
      ${business.length ? `<div class="business">${escapeHtml(business[0])}</div>${business.slice(1).map((l) => `<div class="business-extra">${escapeHtml(l)}</div>`).join("")}` : '<div class="business">Kinesis POS</div>'}
      <h1>${escapeHtml(title)}</h1>
      <div class="period">${escapeHtml(currentRange)} &nbsp;·&nbsp; compared with ${escapeHtml(previousRange)}</div>
    </div>
    <div class="meta">
      <div>Reference <b>${escapeHtml(reference)}</b></div>
      <div>Generated <b>${escapeHtml(generated)}</b></div>
      <div>Timezone <b>${escapeHtml(tz)}</b></div>
      ${input.preparedBy ? `<div>Prepared by <b>${escapeHtml(input.preparedBy)}</b></div>` : ""}
    </div>
  </header>

  <div class="kpis">
    ${kpi(rc.complete ? "Net sales" : "Total sales", money(rc.net), rc.net, rp.net)}
    ${kpi("Transactions", count(cur.transactions), cur.transactions, prev.transactions)}
    ${kpi("Avg. transaction", money(aov), aov, averageTransaction(prev))}
    ${kpi("Items sold", count(cur.items), cur.items, prev.items)}
  </div>

  ${sections.join("\n")}

  <footer>
    <div>Kinesis POS · ${escapeHtml(title)} · <span class="nowrap">${escapeHtml(reference)}</span></div>
    <div>System-generated report. Lifetime to date: ${escapeHtml(money(sales.lifetime.sales))} from ${count(sales.lifetime.transactions)} transactions.</div>
  </footer>
</body>
</html>`;
}

// --------------------------------------------------------------------------
// CSV
// --------------------------------------------------------------------------

/** RFC 4180 field; text that a spreadsheet would run as a formula is neutralised. */
export function csvText(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Plain machine-readable number (no currency symbol or thousands separator). */
export function csvNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

export function createSalesReportCsv(input: SalesReportInput): string {
  const { sales, products, analytics, period } = input;
  const tz = sales.timezone || "Asia/Manila";
  const cur = sales.current;
  const prev = sales.previous;
  const rc = reconcile(cur);
  const rp = reconcile(prev);
  const rows: string[][] = [];
  const blank = () => rows.push([]);
  const change = (c: number, p: number) => [csvNumber(c - p), csvNumber(percentChange(c, p), 1)];

  rows.push([csvText(`Kinesis ${PERIOD_TITLES[period]} Sales Summary`)]);
  for (const line of businessLines(input)) rows.push([csvText("Business"), csvText(line)]);
  rows.push(["Report reference", csvText(reportReference(input))]);
  rows.push(["Period", csvText(PERIOD_TITLES[period]), sales.period_start, inclusiveEnd(sales.period_end_exclusive)]);
  rows.push(["Previous period", "", sales.previous_period_start, inclusiveEnd(sales.previous_period_end_exclusive)]);
  rows.push(["Timezone", csvText(tz)]);
  rows.push(["Generated at", input.generatedAt.toISOString()]);
  if (input.preparedBy) rows.push(["Prepared by", csvText(input.preparedBy)]);
  rows.push(["Currency", csvText(input.settings?.currencySymbol || "₱"), "Amounts are plain numbers"]);
  blank();

  rows.push(["Sales reconciliation"]);
  rows.push(["Line", "This period", "Previous period", "Change", "Change %"]);
  const recon: [string, number, number][] = [
    ["Gross sales", rc.gross, rp.gross],
    ["Discounts", rc.discounts, rp.discounts],
    ["Net sales", rc.net, rp.net],
    ["Tax", rc.tax, rp.tax],
    ["Cash rounding", rc.rounding, rp.rounding],
    ["Total collected", rc.collected, rp.collected],
  ];
  for (const [label, c, p] of recon) rows.push([label, csvNumber(c), csvNumber(p), ...change(c, p)]);
  blank();

  rows.push(["Sales activity"]);
  rows.push(["Measure", "This period", "Previous period", "Change", "Change %"]);
  const activity: [string, number, number, number][] = [
    ["Transactions", cur.transactions, prev.transactions, 0],
    ["Items sold", cur.items, prev.items, 0],
    ["Average transaction value", averageTransaction(cur), averageTransaction(prev), 2],
    ["Units per transaction", unitsPerTransaction(cur), unitsPerTransaction(prev), 2],
    ["Discounted transactions", cur.discounted_transactions ?? 0, prev.discounted_transactions ?? 0, 0],
  ];
  for (const [label, c, p, d] of activity) {
    rows.push([label, csvNumber(c, d), csvNumber(p, d), csvNumber(c - p, d), csvNumber(percentChange(c, p), 1)]);
  }
  blank();

  if (analytics) {
    rows.push(["Payments by tender"]);
    rows.push(["Tender", "Transactions", "Amount", "Share %"]);
    for (const t of analytics.payment_methods) {
      rows.push([csvText(PAYMENT_LABELS[t.method] ?? t.method), String(t.transactions), csvNumber(t.revenue), csvNumber(t.percentage, 1)]);
    }
    blank();
    rows.push(["Revenue by type"]);
    rows.push(["Type", "Revenue"]);
    for (const t of analytics.revenue_breakdown) rows.push([csvText(REVENUE_TYPE_LABELS[t.type] ?? t.type), csvNumber(t.revenue)]);
    blank();
    const gp = analytics.revenue_profit;
    rows.push(["Gross profit"]);
    rows.push(["Revenue (line totals)", csvNumber(gp.revenue)]);
    rows.push(["Known gross profit", csvNumber(gp.known_gross_profit)]);
    rows.push(["Cost coverage %", csvNumber(gp.cost_coverage, 1)]);
    rows.push(["Costed lines", String(gp.total_line_count - gp.uncosted_line_count), "of", String(gp.total_line_count)]);
    blank();
  }

  if (products) {
    rows.push(["Sales by category"]);
    rows.push(["Category", "Units", "Revenue"]);
    for (const c of [...products.categories].sort((a, b) => b.revenue - a.revenue)) {
      rows.push([csvText(c.category), String(c.units_sold), csvNumber(c.revenue)]);
    }
    blank();
    rows.push(["Item sales"]);
    rows.push(["Rank", "Item", "SKU", "Category", "Units", "Revenue", "Status"]);
    products.top_products.forEach((i, n) => {
      rows.push([String(n + 1), csvText(i.name), csvText(i.sku ?? ""), csvText(i.category), String(i.units_sold), csvNumber(i.revenue), itemStatus(i)]);
    });
    blank();
  }

  const granularity = granularityOf(sales.granularity, period);
  rows.push([`Sales by ${granularity}`]);
  rows.push([granularity === "hour" ? "Hour" : granularity === "month" ? "Month" : "Date", "Transactions", "Items", "Total collected"]);
  for (const p of sales.series) {
    const label = granularity === "hour" ? hourLabel(Number(p.label.slice(0, 2))) : p.date ?? p.label;
    rows.push([csvText(label), String(p.transactions), String(p.items), csvNumber(p.sales)]);
  }
  blank();

  rows.push(["Notes"]);
  for (const note of NOTES) rows.push([csvText(note)]);

  // UTF-8 BOM so Excel reads ₱ and accented names correctly; CRLF per RFC 4180.
  return "﻿" + rows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}
