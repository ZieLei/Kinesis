

import { apiRequest } from "@/lib/api";
import type { ReportPeriod } from "@/types/sale";
import type {
  BusinessAnalyticsReport,
  InventoryValuationResponse,
} from "@/types/analytics";

export function fetchBusinessAnalytics(
  period: ReportPeriod,
  signal?: AbortSignal,
): Promise<BusinessAnalyticsReport> {
  return apiRequest<BusinessAnalyticsReport>(
    `/api/reports/analytics?period=${period}`,
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
