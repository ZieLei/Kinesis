

import { apiRequest } from "@/lib/api";
import { reportQueryParams, type ReportQueryInput } from "@/lib/salesApi";
import type {
  BusinessAnalyticsReport,
  InventoryValuationResponse,
} from "@/types/analytics";

export function fetchBusinessAnalytics(
  query: ReportQueryInput,
  signal?: AbortSignal,
): Promise<BusinessAnalyticsReport> {
  return apiRequest<BusinessAnalyticsReport>(
    `/api/reports/analytics?${reportQueryParams(query).toString()}`,
    { signal },
  );
}

export function fetchInventoryValuation(
  signal?: AbortSignal,
): Promise<InventoryValuationResponse> {
  return apiRequest<InventoryValuationResponse>(
    "/api/inventory/valuation",
    { signal },
  );
}
