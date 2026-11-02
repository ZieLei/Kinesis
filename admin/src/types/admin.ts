export type ApiHealth = {
  status: string;
  database?: string;
  message?: string;
};

export type Product = {
  id: number;
  sku: string | null;
  name: string;
  category: string;
  price: number;
  stock: number;
  howMuchSold: number;
  image_path: string | null;
  image_url: string | null;
};

export type ProductListResponse = {
  items: Product[];
  limit: number;
  offset: number;
  count: number;
};

export type SalesSummary = {
  sales: number;
  transactions: number;
  items: number;
};

export type ReportPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly";

export type SalesReportResponse = {
  period: ReportPeriod;
  date: string;
  timezone: string;
  period_start: string;
  period_end_exclusive: string;
  previous_period_start: string;
  previous_period_end_exclusive: string;
  current: SalesSummary;
  previous: SalesSummary;
  lifetime: SalesSummary;
  series: Array<{
    label: string;
    sales: number;
    transactions: number;
    items: number;
    date?: string;
    month?: string;
  }>;
};

export type TopSellingProduct = {
  product_id: number | null;
  name: string;
  category: string;
  units_sold: number;
  revenue: number;
};

export type CategorySales = {
  category: string;
  units_sold: number;
  revenue: number;
};

export type ProductSalesReport = {
  categories: CategorySales[];
  top_products: TopSellingProduct[];
};

export type SaleListItem = {
  id: number;
  transaction_code: string;
  payment_method: "cash" | "gcash";
  reference_number: string | null;
  status: string;
  total: number;
  created_at: string;
  item_count: number;
  cashier_id?: string | null;
  cashier_username?: string | null;
  cashier_display_name?: string | null;
  terminal_id?: number | null;
  terminal_device_id?: string | null;
};

export type SalesListResponse = {
  items: SaleListItem[];
  limit: number;
  offset: number;
  count: number;
  statuses: Record<string, number>;
};


// --------------------------------------------------
// Operations overview
// --------------------------------------------------


export type PaymentBreakdown = {
  payment_method: string;
  transactions: number;
  revenue: number;
};

export type TerminalOperationalStatus = {
  id: number;
  name: string;
  device_id: string | null;
  ip_address: string | null;
  is_enabled: boolean;
  maintenance_mode: boolean;
  connected: boolean;
  status:
  | "connected"
  | "disconnected"
  | "maintenance"
  | "disabled";
  last_seen_at: string | null;
  last_sync_at: string | null;
};

export type ActiveCashier = {
  cashier_id: string;
  username: string | null;
  display_name: string;
  terminal_id: number | null;
  terminal_name: string;
  terminal_connected: boolean;
  session_started_at: string | null;
  idle_expires_at: string | null;
};

export type CashierPerformance = {
  cashier_id: string | null;
  display_name: string;
  transactions: number;
  revenue: number;
};

export type LowStockProduct = {
  id: number;
  name: string;
  sku: string | null;
  category: string;
  stock: number;
  price: number;
};

export type InventorySummary = {
  total_products: number;
  low_stock_threshold: number;
  low_stock_count: number;
  out_of_stock_count: number;
  low_stock_products: LowStockProduct[];
};

export type ActivityEventRecord = {
  id: number;
  event_type: string;
  severity: "info" | "warning" | "error" | string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  cashier_id: string | null;
  terminal_id: number | null;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type OperationsOverviewResponse = {
  as_of: string;
  timezone: string;
  heartbeat_timeout_seconds: number;

  sales_today: {
    revenue: number;
    transactions: number;
    average_transaction_value: number;
  };

  payment_breakdown: PaymentBreakdown[];

  terminal_summary: {
    total: number;
    enabled: number;
    connected: number;
    disconnected: number;
    maintenance: number;
    disabled: number;
  };

  terminals: TerminalOperationalStatus[];
  active_cashiers: ActiveCashier[];
  cashier_performance: CashierPerformance[];
  inventory_summary: InventorySummary;
  service_catalog_count: number;
  activity: ActivityEventRecord[];
};
