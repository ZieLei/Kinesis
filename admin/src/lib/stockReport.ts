// Stock report: loads the whole inventory (and optionally services), builds a
// static HTML document and prints it from an isolated iframe, so the browser's
// print dialog can "Save as PDF".

import { fetchAdminServices, fetchInventoryProducts } from "./adminApi";
import { STATUS_LABEL, formatCurrency, formatNumber } from "../components/stock/format";
import type { InventoryItem, ManagedService } from "../types/admin";

const PAGE = 100;

export type StockReportOptions = {
  includeServices: boolean;
  /** Narrow the report to the filters currently applied on the Stock page. */
  category?: string;
  search?: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function loadProducts(options: StockReportOptions, signal?: AbortSignal) {
  const items: InventoryItem[] = [];
  let lowStock = 0;

  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchInventoryProducts(
      { search: options.search, category: options.category, sort: "name", direction: "asc", limit: PAGE, offset },
      signal,
    );
    items.push(...page.items);
    lowStock = page.low_stock_threshold;
    if (offset + PAGE >= page.total || page.items.length === 0) break;
  }

  return { items, lowStock };
}

async function loadServices(signal?: AbortSignal) {
  const items: ManagedService[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchAdminServices(
      { search: "", state: "active", sort: "name", direction: "asc", limit: PAGE, offset },
      signal,
    );
    items.push(...page.items);
    if (offset + PAGE >= page.count || page.items.length === 0) break;
  }

  return items;
}

function buildHtml(products: InventoryItem[], services: ManagedService[] | null, lowStock: number, options: StockReportOptions) {
  const generated = new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });
  const units = products.reduce((sum, p) => sum + p.stock, 0);
  const retail = products.reduce((sum, p) => sum + p.stock * p.price, 0);
  const cost = products.reduce((sum, p) => sum + p.stock * (p.average_cost ?? 0), 0);
  const low = products.filter((p) => p.stock_status === "low").length;
  const out = products.filter((p) => p.stock_status === "out").length;

  const filters = [options.category && `Category: ${options.category}`, options.search?.trim() && `Search: “${options.search.trim()}”`]
    .filter(Boolean)
    .join(" · ");

  const productRows = products
    .map(
      (p) => `<tr>
<td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.sku ?? "—")}</td><td>${escapeHtml(p.category)}</td>
<td class="n">${formatNumber(p.stock)}</td><td>${STATUS_LABEL[p.stock_status]}</td>
<td class="n">${formatCurrency(p.average_cost)}</td><td class="n">${formatCurrency(p.price)}</td>
<td class="n">${formatCurrency(p.stock * p.price)}</td></tr>`,
    )
    .join("");

  const serviceSection = services
    ? `<h2>Services (${services.length})</h2>
<table><thead><tr><th>Service</th><th>Description</th><th class="n">Price</th><th class="n">Est. cost</th><th class="n">Times sold</th></tr></thead><tbody>${
        services
          .map(
            (s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.description)}</td>
<td class="n">${formatCurrency(s.price)}</td><td class="n">${formatCurrency(s.estimated_cost)}</td><td class="n">${formatNumber(s.times_sold)}</td></tr>`,
          )
          .join("") || `<tr><td colspan="5">No active services.</td></tr>`
      }</tbody></table>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Stock report</title><style>
@page{margin:14mm}
body{font:11px/1.4 system-ui,sans-serif;color:#111;margin:0}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:22px 0 6px}
.meta{color:#555;margin:2px 0 12px}
.cards{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.card{border:1px solid #ccc;border-radius:4px;padding:6px 10px;min-width:110px}
.card b{display:block;font-size:14px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f2f2f2;font-size:10px;text-transform:uppercase}
thead{display:table-header-group}tr{break-inside:avoid}
.n{text-align:right;white-space:nowrap}
</style></head><body>
<h1>Stock report</h1>
<p class="meta">Generated ${escapeHtml(generated)}${filters ? ` · ${escapeHtml(filters)}` : ""} · Low stock = ${lowStock} units or fewer</p>
<div class="cards">
<div class="card">Products<b>${formatNumber(products.length)}</b></div>
<div class="card">Units in stock<b>${formatNumber(units)}</b></div>
<div class="card">Low / out<b>${low} / ${out}</b></div>
<div class="card">Stock value (cost)<b>${formatCurrency(cost)}</b></div>
<div class="card">Stock value (retail)<b>${formatCurrency(retail)}</b></div>
</div>
<h2>Products</h2>
<table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th class="n">Stock</th><th>Status</th><th class="n">Avg. cost</th><th class="n">Price</th><th class="n">Retail value</th></tr></thead>
<tbody>${productRows || `<tr><td colspan="8">No products.</td></tr>`}</tbody></table>
${serviceSection}
</body></html>`;
}

export async function printStockReport(options: StockReportOptions, signal?: AbortSignal): Promise<void> {
  const [{ items, lowStock }, services] = await Promise.all([
    loadProducts(options, signal),
    options.includeServices ? loadServices(signal) : Promise.resolve(null),
  ]);
  const html = buildHtml(items, services, lowStock, options);

  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Stock report";
  Object.assign(frame.style, { position: "fixed", width: "0", height: "0", border: "0", right: "0", bottom: "0" });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("The report could not be prepared for printing.")), 10_000);
    frame.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  }).catch((error) => {
    frame.remove();
    throw error;
  });

  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("The report could not be prepared for printing.");
  }

  try {
    win.document.title = "Stock report";
    win.focus();
    win.print();
  } finally {
    window.setTimeout(() => frame.remove(), 60_000);
  }
}
