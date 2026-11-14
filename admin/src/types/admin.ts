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
  /** Present on responses from the product endpoints. */
  average_cost?: number | null;
  archived?: boolean;
  archived_at?: string | null;
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
    reversed_transactions: number;
    reversed_amount: number;
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


// --------------------------------------------------
// Stock management (/api/admin/inventory)
// --------------------------------------------------

export type StockStatus = "in_stock" | "low" | "out";

export type InventorySortField = "name" | "sku" | "category" | "price" | "stock";

export type InventoryItem = {
  id: number;
  sku: string | null;
  name: string;
  category: string;
  price: number;
  stock: number;
  /** Weighted-average acquisition cost; null when stock was never costed. */
  average_cost: number | null;
  image_url: string | null;
  stock_status: StockStatus;
  archived_at: string | null;
};

export type InventoryListQuery = {
  search?: string;
  category?: string;
  status?: StockStatus;
  sort: InventorySortField;
  direction: "asc" | "desc";
  limit: number;
  offset: number;
  /** List archived products instead of active inventory. */
  archived?: boolean;
};

export type InventoryListResponse = {
  items: InventoryItem[];
  total: number;
  limit: number;
  offset: number;
  low_stock_threshold: number;
  categories: string[];
};

export type StockAdjustmentReason =
  | "damaged"
  | "lost"
  | "expired"
  | "count_correction"
  | "other"
  | "sale_reversal";

export type AddStockRequest = {
  product_id: number;
  quantity: number;
  unit_cost: string;
  opening_stock_unit_cost?: string;
  expected_stock: number;
  note?: string;
};

export type AdjustStockRequest = {
  product_id: number;
  quantity_change: number;
  reason: StockAdjustmentReason;
  note?: string;
  expected_stock: number;
};

export type StockChangeResponse = {
  product: InventoryItem;
};

export type StockHistoryEntry = {
  type: "receipt" | "adjustment" | "sale";
  id: number;
  at: string;
  quantity_change: number;
  stock_before: number | null;
  stock_after: number | null;
  reason: StockAdjustmentReason | null;
  note: string | null;
  actor_name: string | null;
  unit_cost: number | null;
};

export type StockHistoryResponse = {
  product_id: number;
  items: StockHistoryEntry[];
};

export type AdminProductCreateRequest = {
  name: string;
  category: string;
  /** Selling price, decimal string with up to 2 places. */
  price: string;
  /** Omit to generate one from the SKU settings. */
  sku?: string;
  /** Recorded as an inventory receipt when greater than zero. */
  initial_stock?: number;
  initial_unit_cost?: string;
  note?: string;
};

/** Only the fields being changed are sent; omitted fields stay as they are. */
export type AdminProductUpdateRequest = {
  name?: string;
  category?: string;
  price?: string;
  sku?: string;
};

export type ArchiveProductResponse = {
  message: string;
  id: number;
  archived: boolean;
  deleted: boolean;
};

// --------------------------------------------------
// Service catalog management
// --------------------------------------------------

export type ManagedService = {
  id: number;
  name: string;
  description: string;
  price: number;
  estimated_cost: number | null;
  archived: boolean;
  archived_at: string | null;
  updated_at: string | null;
  /** Units sold and revenue from completed sales only. */
  times_sold: number;
  revenue: number;
  last_sold_at: string | null;
  /** False once the service appears on any sale: it can only be archived. */
  can_delete: boolean;
};

export type ServiceListResponse = {
  items: ManagedService[];
  count: number;
  limit: number;
  offset: number;
  active_count: number;
  archived_count: number;
};

export type ServiceState = "active" | "archived" | "all";
export type ServiceSort = "name" | "price" | "updated" | "sold" | "revenue";

export type ServiceInput = {
  name: string;
  description: string;
  price: string;
  estimated_cost: string | null;
};
