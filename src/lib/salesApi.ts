
import { apiRequest } from "@/lib/api";

import type {
  CheckoutRequest,
  ProductSalesReport,
  ReportPeriod,
  ReportQuery,
  SaleRecord,
  SaleReversalRequest,
  SalesListResponse,
  SalesReportResponse,
} from "@/types/sale";

export function createSale(
  checkout: CheckoutRequest,
): Promise<SaleRecord> {
  return apiRequest<SaleRecord>("/api/sales", {
    method: "POST",
    body: JSON.stringify(checkout),
  });
}

export function fetchSale(
  transactionCode: string,
  signal?: AbortSignal,
): Promise<SaleRecord> {
  return apiRequest<SaleRecord>(
    `/api/sales/${encodeURIComponent(transactionCode)}`,
    { signal },
  );
}

export function fetchSalesList(
  limit = 10,
  offset = 0,
  signal?: AbortSignal,
  status?: "completed" | "voided" | "refunded",
): Promise<SalesListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (status) {
    params.set("status", status);
  }

  return apiRequest<SalesListResponse>(
    `/api/sales?${params.toString()}`,
    { signal },
  );
}

/** A bare period means "the current one"; a query may carry a custom range. */
export type ReportQueryInput = ReportPeriod | ReportQuery;

export function reportQueryParams(input: ReportQueryInput): URLSearchParams {
  const query: ReportQuery = typeof input === "string" ? { period: input } : input;
  const params = new URLSearchParams({ period: query.period });

  if (query.period === "custom") {
    if (query.start) params.set("start", query.start);
    if (query.end) params.set("end", query.end);
  }

  return params;
}

export function fetchSalesReport(
  query: ReportQueryInput,
  signal?: AbortSignal,
): Promise<SalesReportResponse> {
  return apiRequest<SalesReportResponse>(
    `/api/reports/sales?${reportQueryParams(query).toString()}`,
    { signal },
  );
}

export type ProductSalesReportOptions = {
  offset?: number;
  search?: string;
  categories?: string[];
  minUnits?: number;
  maxUnits?: number;
  /** Also list active products with no sales in the period. */
  includeUnsold?: boolean;
};

export function fetchProductSalesReport(
  limit = 5,
  signal?: AbortSignal,
  period?: ReportQueryInput,
  options: ProductSalesReportOptions = {},
): Promise<ProductSalesReport> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (period) {
    for (const [key, value] of reportQueryParams(period)) {
      params.set(key, value);
    }
  }

  if (options.offset) {
    params.set("offset", String(options.offset));
  }

  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }

  for (const category of options.categories ?? []) {
    params.append("category", category);
  }

  if (options.minUnits !== undefined) {
    params.set("min_units", String(options.minUnits));
  }

  if (options.maxUnits !== undefined) {
    params.set("max_units", String(options.maxUnits));
  }

  if (options.includeUnsold) {
    params.set("include_unsold", "true");
  }

  return apiRequest<ProductSalesReport>(
    `/api/reports/products?${params.toString()}`,
    { signal },
  );
}

export function reverseSale(
  transactionCode: string,
  request: SaleReversalRequest,
): Promise<SaleRecord> {
  return apiRequest<SaleRecord>(
    `/api/sales/${encodeURIComponent(transactionCode)}/reversal`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}
