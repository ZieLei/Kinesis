

import { useCallback, useState } from "react";

import { fetchAllProducts } from "@/lib/productsApi";
import { fetchSalesList, fetchSalesReport } from "@/lib/salesApi";

import type { Product } from "@/types/product";
import type {
  SalesListResponse,
  SalesReportResponse,
} from "@/types/sale";

export const LOW_STOCK_THRESHOLD = 5;

export type DashboardData = {
  products: Product[];
  dailyReport: SalesReportResponse;
  weeklyReport: SalesReportResponse;
  monthlyReport: SalesReportResponse;
  recentTransactions: SalesListResponse;
};

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const [
        products,
        dailyReport,
        weeklyReport,
        monthlyReport,
        recentTransactions,
      ] = await Promise.all([
        fetchAllProducts(signal),
        fetchSalesReport("daily", signal),
        fetchSalesReport("weekly", signal),
        fetchSalesReport("monthly", signal),
        fetchSalesList(5, 0, signal),
      ]);

      if (signal?.aborted) return;

      setData({
        products,
        dailyReport,
        weeklyReport,
        monthlyReport,
        recentTransactions,
      });
    } catch (requestError) {
      if (signal?.aborted) return;

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load dashboard data.",
      );
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  return {
    data,
    loading,
    error,
    loadDashboard,
  };
}
