import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  fetchAllProducts,
  fetchApiHealth,
  fetchOperationsOverview,
  fetchPaymentBreakdown,
  fetchProductSalesReport,
  fetchRecentSales,
  fetchSalesReport,
} from "../lib/adminApi";

import type {
  PaymentBreakdownResponse,
} from "../lib/adminApi";

import type {
  ApiHealth,
  OperationsOverviewResponse,
  Product,
  ProductSalesReport,
  ReportPeriod,
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
  yearlyReport: OverviewResource<SalesReportResponse>;
  productReport: OverviewResource<ProductSalesReport>;
  recentSales: OverviewResource<SalesListResponse>;
};


function emptyResource<T>(): OverviewResource<T> {
  return {
    data: null,
    error: "",
  };
}


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
      error: error instanceof Error
        ? error.message
        : "The request failed.",
    };
  }
}


export function useAdminOverview() {
  const [resources, setResources] = useState<OverviewResources>({
    health: emptyResource(),
    products: emptyResource(),
    dailyReport: emptyResource(),
    weeklyReport: emptyResource(),
    monthlyReport: emptyResource(),
    yearlyReport: emptyResource(),
    productReport: emptyResource(),
    recentSales: emptyResource(),
  });

  const [operations, setOperations] = useState<
    OverviewResource<OperationsOverviewResponse>
  >(emptyResource());

  const [paymentBreakdown, setPaymentBreakdown] = useState<
    OverviewResource<PaymentBreakdownResponse>
  >(emptyResource());

  const [paymentPeriod, setPaymentPeriod] =
    useState<ReportPeriod>("daily");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [operationsUpdatedAt, setOperationsUpdatedAt] =
    useState<Date | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  const hasLoaded = useRef(false);


  // --------------------------------------------------
  // Main dashboard resources
  // --------------------------------------------------


  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = !hasLoaded.current;

    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    async function loadDashboard() {
      const [
        health,
        products,
        dailyReport,
        weeklyReport,
        monthlyReport,
        yearlyReport,
        productReport,
        recentSales,
      ] = await Promise.all([
        loadResource(fetchApiHealth(controller.signal)),
        loadResource(fetchAllProducts(controller.signal)),
        loadResource(fetchSalesReport("daily", controller.signal)),
        loadResource(fetchSalesReport("weekly", controller.signal)),
        loadResource(fetchSalesReport("monthly", controller.signal)),
        loadResource(fetchSalesReport("yearly", controller.signal)),
        loadResource(fetchProductSalesReport(5, controller.signal)),
        loadResource(fetchRecentSales(10, 0, controller.signal)),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      setResources({
        health,
        products,
        dailyReport,
        weeklyReport,
        monthlyReport,
        yearlyReport,
        productReport,
        recentSales,
      });

      hasLoaded.current = true;
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
    }

    void loadDashboard();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);


  // --------------------------------------------------
  // Live operational data
  // --------------------------------------------------


  useEffect(() => {
    let mounted = true;
    let controller: AbortController | null = null;

    async function loadOperations() {
      controller?.abort();

      const nextController = new AbortController();
      controller = nextController;

      const result = await loadResource(
        fetchOperationsOverview(nextController.signal),
      );

      if (!mounted || nextController.signal.aborted) {
        return;
      }

      setOperations((current) => {
        if (result.data) {
          return result;
        }

        return {
          data: current.data,
          error: result.error,
        };
      });

      if (result.data) {
        setOperationsUpdatedAt(new Date());
      }
    }

    void loadOperations();

    const interval = window.setInterval(() => {
      void loadOperations();
    }, 15_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, [refreshKey]);


  // --------------------------------------------------
  // Period-specific payment breakdown
  // --------------------------------------------------


  useEffect(() => {
    const controller = new AbortController();

    setPaymentBreakdown(emptyResource());

    async function loadPayments() {
      const result = await loadResource(
        fetchPaymentBreakdown(paymentPeriod, controller.signal),
      );

      if (controller.signal.aborted) {
        return;
      }

      setPaymentBreakdown(result);
    }

    void loadPayments();

    return () => {
      controller.abort();
    };
  }, [paymentPeriod, refreshKey]);


  // --------------------------------------------------
  // Manual refresh
  // --------------------------------------------------


  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);


  return {
    ...resources,

    operations,
    paymentBreakdown,
    paymentPeriod,
    setPaymentPeriod,

    loading,
    refreshing,

    lastUpdated,
    operationsUpdatedAt,

    refresh,
  };
}
