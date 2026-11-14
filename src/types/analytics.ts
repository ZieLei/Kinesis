

import type { ReportGranularity, ReportPeriod } from "@/types/sale";

export type PaymentMethodAnalytics = {
  method: "cash" | "gcash";
  revenue: number;
  transactions: number;
  percentage: number;
};

export type RevenueProfitPoint = {
  label: string;
  date?: string;
  revenue: number;
  gross_profit: number | null;
  cost_coverage: number;
};

export type RevenueBreakdownPoint = {
  label: string;
  date?: string;
  parts: number;
  services: number;
};

export type HourlySalesPoint = {
  hour: number;
  transactions: number;
  revenue: number;
};

export type PeakHour = HourlySalesPoint;

export type HeatmapRow = {
  weekday: string;
  weekday_index: number;
  hours: number[];
};

export type BusinessAnalyticsReport = {
  period: ReportPeriod;
  granularity: ReportGranularity;
  date: string;
  timezone: string;
  period_start: string;
  period_end_exclusive: string;
  transaction_count: number;
  payment_methods: PaymentMethodAnalytics[];
  revenue_profit: {
    revenue: number;
    known_gross_profit: number | null;
    cost_coverage: number;
    uncosted_line_count: number;
    total_line_count: number;
    gross_profit_definition: string;
  };
  revenue_breakdown: {
    type: "parts" | "services";
    revenue: number;
  }[];
  revenue_profit_series: RevenueProfitPoint[];
  revenue_breakdown_series: RevenueBreakdownPoint[];
  hourly_sales: HourlySalesPoint[];
  peak_hours: PeakHour[];
  heatmap: HeatmapRow[];
  heatmap_max: number;
};

export type InventoryValuationProduct = {
  product_id: number;
  sku: string | null;
  name: string;
  category: string;
  stock: number;
  unit_price: number;
  average_cost: number | null;
  retail_value: number;
  inventory_cost_value: number | null;
  cost_status: "valued" | "cost_unknown";
};

export type InventoryValuationResponse = {
  generated_at: string;
  currency: string;
  summary: {
    product_count: number;
    total_units: number;
    valued_units: number;
    uncosted_units: number;
    inventory_cost_value: number;
    estimated_retail_value: number;
    uncosted_retail_value: number;
    known_inventory_gross_margin: number;
  };
  products: InventoryValuationProduct[];
  stockout_opportunity: {
    basis_days: number;
    estimated_lost_units: number;
    estimated_lost_revenue: number;
    estimated_lost_gross_profit: number;
    gross_profit_cost_coverage: number;
    note: string;
    items: {
      product_id: number;
      name: string;
      sku: string | null;
      current_stock: number;
      started_at: string;
      ended_at: string | null;
      duration_days: number;
      units_sold_before_stockout_30d: number;
      average_daily_demand: number;
      estimated_lost_units: number;
      estimated_lost_revenue: number;
      estimated_lost_gross_profit: number | null;
    }[];
  };
};
