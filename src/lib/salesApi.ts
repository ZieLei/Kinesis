
import { apiRequest } from "@/lib/api";

import type {
  CheckoutRequest,
  ProductSalesReport,
  ReportPeriod,
  SaleRecord,
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
): Promise<SalesListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return apiRequest<SalesListResponse>(
    `/api/sales?${params.toString()}`,
    { signal },
  );
}

export function fetchSalesReport(
  period: ReportPeriod,
  signal?: AbortSignal,
): Promise<SalesReportResponse> {
  return apiRequest<SalesReportResponse>(
    `/api/reports/sales?period=${encodeURIComponent(period)}`,
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
  period?: ReportPeriod,
  options: ProductSalesReportOptions = {},
): Promise<ProductSalesReport> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (period) {
    params.set("period", period);
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
