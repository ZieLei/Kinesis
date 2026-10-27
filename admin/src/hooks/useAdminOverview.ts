import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchAllProducts,
  fetchApiHealth,
  fetchProductSalesReport,
  fetchRecentSales,
  fetchSalesReport,
} from "../lib/adminApi";

import type {
  ApiHealth,
  Product,
  ProductSalesReport,
  SalesListResponse,
  SalesReportResponse,
} from "../types/admin";

export type OverviewResource<T> = {
  data: T | null;
  error: string;
};

type OverviewResources = {
  health: OverviewResource<ApiHealth>;
  products: OverviewResource<Product[]>;
  dailyReport: OverviewResource<SalesReportResponse>;
  weeklyReport: OverviewResource<SalesReportResponse>;
  monthlyReport: OverviewResource<SalesReportResponse>;
  productReport: OverviewResource<ProductSalesReport>;
  recentSales: OverviewResource<SalesListResponse>;
};

async function loadResource<T>(
  request: Promise<T>,
): Promise<OverviewResource<T>> {
  try {
    return {
      data: await request,
      error: "",
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while loading data.",
    };
  }
}

export function useAdminOverview() {
  const [resources, setResources] = useState<OverviewResources>({
    health: { data: null, error: "" },
    products: { data: null, error: "" },
    dailyReport: { data: null, error: "" },
    weeklyReport: { data: null, error: "" },
    monthlyReport: { data: null, error: "" },
    productReport: { data: null, error: "" },
    recentSales: { data: null, error: "" },
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const hasLoaded = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const isFirstLoad = !hasLoaded.current;

    setLoading(isFirstLoad);
    setRefreshing(!isFirstLoad);

    async function loadOverview() {
      const [
        health,
        products,
        dailyReport,
        weeklyReport,
        monthlyReport,
        productReport,
        recentSales,
      ] = await Promise.all([
        loadResource(fetchApiHealth(signal)),
        loadResource(fetchAllProducts(signal)),
        loadResource(fetchSalesReport("daily", signal)),
        loadResource(fetchSalesReport("weekly", signal)),
        loadResource(fetchSalesReport("monthly", signal)),
        loadResource(fetchProductSalesReport(5, signal)),
        loadResource(fetchRecentSales(5, 0, signal)),
      ]);

      if (signal.aborted) return;

      setResources({
        health,
        products,
        dailyReport,
        weeklyReport,
        monthlyReport,
        productReport,
        recentSales,
      });

      hasLoaded.current = true;
      setLastUpdated(new Date().toISOString());
      setLoading(false);
      setRefreshing(false);
    }

    void loadOverview();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return {
    ...resources,
    loading,
    refreshing,
    lastUpdated,
    refresh,
  };
}
