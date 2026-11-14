// Tests for the exported Sales Summary documents.
//   node --import ./tests/web/register.mjs --test tests/web/
import { test } from "node:test";
import assert from "node:assert/strict";

import * as doc from "../../src/lib/salesReportDocument.ts";

const summary = (o = {}) => ({ sales: 0, transactions: 0, items: 0, ...o });

function input(overrides = {}) {
  return {
    period: "monthly",
    sales: {
      period: "monthly", date: "2026-11-09", timezone: "Asia/Manila",
      period_start: "2026-11-01", period_end_exclusive: "2026-12-01",
      previous_period_start: "2026-10-01", previous_period_end_exclusive: "2026-11-01",
      current: summary({ sales: 1052.8, transactions: 2, items: 3, gross_sales: 1050, discounts: 35, net_sales: 1015, tax: 37.8, discounted_transactions: 1 }),
      previous: summary({ sales: 500, transactions: 1, items: 1, gross_sales: 500, discounts: 0, net_sales: 500, tax: 0, discounted_transactions: 0 }),
      lifetime: summary({ sales: 99999, transactions: 300, items: 900 }),
      series: [
        { label: "1", date: "2026-11-01", sales: 700, transactions: 1, items: 2 },
        { label: "2", date: "2026-11-02", sales: 352.8, transactions: 1, items: 1 },
      ],
      trailing_series: [],
    },
    products: {
      period: "monthly", date: "2026-11-09", timezone: "Asia/Manila", period_start: "2026-11-01", period_end_exclusive: "2026-12-01",
      categories: [{ category: "Brakes", units_sold: 3, revenue: 1050 }],
      category_series: [],
      top_products: [
        { product_id: 1, sku: "BRK-001", name: '=HYPERLINK("http://x","Brake, "pad"")', category: "Brakes", units_sold: 3, revenue: 1050, archived: false, deleted: false },
        { product_id: null, sku: null, name: "<script>alert(1)</script>", category: "Old", units_sold: 1, revenue: 10, archived: false, deleted: true },
      ],
      total_products: 2, offset: 0, limit: 100,
    },
    analytics: {
      period: "monthly", date: "2026-11-09", timezone: "Asia/Manila", period_start: "2026-11-01", period_end_exclusive: "2026-12-01",
      transaction_count: 2,
      payment_methods: [{ method: "cash", revenue: 700, transactions: 1, percentage: 66.5 }, { method: "gcash", revenue: 352.8, transactions: 1, percentage: 33.5 }],
      revenue_profit: { revenue: 1015, known_gross_profit: 300, cost_coverage: 80, uncosted_line_count: 1, total_line_count: 5, gross_profit_definition: "Known gross profit includes only costed lines." },
      revenue_breakdown: [{ type: "parts", revenue: 900 }, { type: "services", revenue: 115 }],
      revenue_profit_series: [], revenue_breakdown_series: [], hourly_sales: [],
      peak_hours: [{ hour: 14, transactions: 2, revenue: 1052.8 }], heatmap: [], heatmap_max: 0,
    },
    settings: { currencySymbol: "₱", currencyPlacement: "before", decimalPrecision: "2", receiptHeader: "Shimamura Motor Parts\nRizal Ave, Manila" },
    preparedBy: "Ana Test (@ana)",
    generatedAt: new Date("2026-11-09T07:42:00Z"),
    ...overrides,
  };
}

test("reconciliation: gross - discounts = net; net + tax + rounding = collected", () => {
  const r = doc.reconcile(input().sales.current);
  assert.equal(r.complete, true);
  assert.equal(r.gross - r.discounts, r.net);
  assert.equal(Math.round((r.net + r.tax + r.rounding) * 100) / 100, r.collected);
  assert.ok(Object.is(r.rounding, 0), "rounding is +0, never -0");
});

test("reconciliation shows cash rounding as its own line", () => {
  const r = doc.reconcile(summary({ sales: 100, transactions: 1, gross_sales: 99.98, discounts: 0, net_sales: 99.98, tax: 0 }));
  assert.equal(r.rounding, 0.02);
});

test("older servers without the breakdown fall back to totals only", () => {
  const r = doc.reconcile(summary({ sales: 500, transactions: 2 }));
  assert.deepEqual([r.complete, r.gross, r.net, r.discounts, r.collected], [false, 500, 500, 0, 500]);
});

test("averages and percent change", () => {
  assert.equal(doc.averageTransaction(summary({ sales: 1000, transactions: 4 })), 250);
  assert.equal(doc.averageTransaction(summary()), 0);
  assert.equal(doc.unitsPerTransaction(summary({ items: 9, transactions: 4 })), 2.25);
  assert.equal(doc.percentChange(150, 100), 50);
  assert.equal(doc.percentChange(50, 100), -50);
  assert.equal(doc.percentChange(10, 0), null);
});

test("date ranges use the inclusive end date", () => {
  assert.equal(doc.inclusiveEnd("2026-12-01"), "2026-11-30");
  assert.equal(doc.formatRange("2026-11-01", "2026-12-01"), "Nov 1, 2026 – Nov 30, 2026");
  assert.match(doc.formatRange("2026-11-09", "2026-11-10"), /Nov 9, 2026/);
  assert.ok(!doc.formatRange("2026-11-09", "2026-11-10").includes("–"), "single day is not a range");
});

test("file names and reference follow the period", () => {
  const i = input();
  assert.equal(doc.reportFileName(i, "pdf"), "kinesis-sales-report-monthly-2026-11-01_to_2026-11-30.pdf");
  assert.equal(doc.reportFileName({ ...i, period: "daily", sales: { ...i.sales, period_start: "2026-11-09", period_end_exclusive: "2026-11-10" } }, "csv"),
    "kinesis-sales-report-daily-2026-11-09.csv");
  assert.equal(doc.reportReference(i), "RPT-20261109-1542-M"); // 07:42 UTC = 15:42 Manila
});

test("CSV fields are RFC 4180 quoted and formulas are neutralised", () => {
  assert.equal(doc.csvText('a,"b"'), '"a,""b"""');
  assert.equal(doc.csvText("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(doc.csvText("+1"), "'+1");
  assert.equal(doc.csvText("-x"), "'-x");
  assert.equal(doc.csvText("@cmd"), "'@cmd");
  assert.equal(doc.csvNumber(1234.5), "1234.50");
  assert.equal(doc.csvNumber(-3), "-3.00");
  assert.equal(doc.csvNumber(null), "");
});

test("CSV has BOM, CRLF, plain numbers and every section", () => {
  const csv = doc.createSalesReportCsv(input());
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("\r\n") && !/[^\r]\n/.test(csv));
  for (const section of ["Sales reconciliation", "Sales activity", "Payments by tender", "Revenue by type", "Gross profit", "Sales by category", "Item sales", "Sales by day", "Notes"]) {
    assert.ok(csv.includes(`\r\n${section}\r\n`), `missing section ${section}`);
  }
  assert.ok(csv.includes("Gross sales,1050.00,500.00,550.00,110.0"));
  assert.ok(csv.includes("Discounts,35.00,0.00,35.00,"));
  assert.ok(csv.includes("Net sales,1015.00,500.00,515.00,103.0"));
  assert.ok(csv.includes("Total collected,1052.80,500.00,552.80,110.6"));
  assert.ok(csv.includes("Average transaction value,526.40,500.00,26.40,5.3"));
  // The hostile item name is quoted and cannot run as a formula.
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"",""Brake, ""pad"""")"`));
  assert.ok(csv.includes("Business,Shimamura Motor Parts"));
  assert.ok(!csv.includes("₱1,"), "amounts must not carry symbols or separators");
});

test("PDF HTML: escaped, complete, and identifies the report", () => {
  const html = doc.createSalesReportHtml(input());
  assert.ok(!html.includes("<script>alert(1)</script>"), "item names must be escaped");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  for (const text of ["Monthly Sales Summary", "Shimamura Motor Parts", "Rizal Ave, Manila", "RPT-20261109-1542-M", "Asia/Manila", "Prepared by", "Sales reconciliation", "Total collected", "Payments by tender", "GCash", "Revenue by type", "Gross profit", "Sales by category", "Top 2 items by revenue", "Sales by day", "Peak hours", "Notes and definitions", "@page", "size: A4"]) {
    assert.ok(html.includes(text), `missing ${text}`);
  }
  assert.ok(html.includes("₱1,015.00"), "net sales formatted with the POS currency");
  assert.ok(html.includes("(₱35.00)"), "discounts shown as a deduction");
  assert.ok(html.includes('<span class="tag">deleted</span>'));
  // Margin on costed revenue: 300 / (1015 * 0.80) = 36.9%
  assert.ok(html.includes("36.9%"));
});

test("PDF without analytics or products still renders the core summary", () => {
  const html = doc.createSalesReportHtml(input({ analytics: null, products: null }));
  assert.ok(html.includes("Sales reconciliation") && html.includes("Sales activity"));
  assert.ok(!html.includes("Payments by tender") && !html.includes("Top "));
});

test("custom range: titled, named and labelled by its own dates and granularity", () => {
  const base = input();
  const custom = input({
    period: "custom",
    sales: {
      ...base.sales,
      period: "custom", granularity: "day", date: "2026-11-21",
      period_start: "2026-11-21", period_end_exclusive: "2026-12-21",
      previous_period_start: "2026-10-22", previous_period_end_exclusive: "2026-11-21",
      series: [{ label: "Nov 21", date: "2026-11-21", sales: 10, transactions: 1, items: 1 }],
    },
  });

  assert.equal(doc.reportFileName(custom, "csv"), "kinesis-sales-report-custom-2026-11-21_to_2026-12-20.csv");
  assert.match(doc.reportReference(custom), /-C$/);

  const html = doc.createSalesReportHtml(custom);
  assert.match(html, /Custom Range Sales Summary/);
  assert.match(html, /Nov 21, 2026 – Dec 20, 2026/);

  const csv = doc.createSalesReportCsv(custom);
  assert.match(csv, /Sales by day/);
  assert.match(csv, /2026-11-21,1,1/);

  const monthly = input({ period: "custom", sales: { ...custom.sales, granularity: "month", series: [{ label: "Nov '26", date: "2026-11-01", sales: 10, transactions: 1, items: 1 }] } });
  assert.match(doc.createSalesReportCsv(monthly), /Sales by month/);
  assert.match(doc.createSalesReportHtml(monthly), /November 2026/);
});
