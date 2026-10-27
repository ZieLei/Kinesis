

export type PaymentMethod = "cash" | "gcash";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

export type CheckoutItemInput = {
  product_id: number;
  quantity: number;
};

export type CheckoutRequest = {
  transaction_code: string;
  payment_method: PaymentMethod;
  items: CheckoutItemInput[];
  amount_tendered?: number;
  reference_number?: string;
};

export type SaleItemRecord = {
  id: number;
  product_id: number | null;
  product_name: string;
  sku: string | null;
  category: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type SaleRecord = {
  id: number;
  transaction_code: string;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: string;
  subtotal: number;
  total: number;
  amount_tendered: number;
  change_due: number;
  created_at: string;
  items: SaleItemRecord[];
};

export type SaleListItem = {
  id: number;
  transaction_code: string;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: string;
  total: number;
  created_at: string;
  item_count: number;
};

export type SalesListResponse = {
  items: SaleListItem[];
  limit: number;
  offset: number;
  count: number;
  statuses: Record<string, number>;
};

export type SalesSummary = {
  sales: number;
  transactions: number;
  items: number;
};

export type SalesSeriesPoint = {
  label: string;
  date?: string;
  month?: number;
  sales: number;
  transactions: number;
  items: number;
};

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
  series: SalesSeriesPoint[];
};

export type CategorySales = {
  category: string;
  units_sold: number;
  revenue: number;
};

export type TopProductSales = {
  product_id: number | null;
  name: string;
  category: string;
  units_sold: number;
  revenue: number;
};

export type ProductSalesReport = {
  categories: CategorySales[];
  top_products: TopProductSales[];
};
