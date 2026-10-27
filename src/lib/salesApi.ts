
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

  return apiRequest<SalesListResponse>(`/api/sales?${params.toString()}`, {
    signal,
  });
}

export function fetchSalesReport(
  period: ReportPeriod,
  signal?: AbortSignal,
): Promise<SalesReportResponse> {
  return apiRequest<SalesReportResponse>(
    `/api/reports/sales?period=${period}`,
    { signal },
  );
}

export function fetchProductSalesReport(
  limit = 5,
  signal?: AbortSignal,
): Promise<ProductSalesReport> {
  return apiRequest<ProductSalesReport>(
    `/api/reports/products?limit=${limit}`,
    { signal },
  );
}
