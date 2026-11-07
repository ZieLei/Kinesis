
export type PaymentMethod = "cash" | "gcash";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

export type CheckoutItemInput = {
  product_id: number;
  quantity: number;
};

export type CheckoutServiceInput = {
  service_id: number;
  quantity: number;
};

export type CheckoutRequest = {
  transaction_code: string;
  payment_method: PaymentMethod;
  items: CheckoutItemInput[];
  services: CheckoutServiceInput[];
  discount_percent?: number;
  supervisor_username?: string;
  supervisor_pin?: string;
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
  unit_cost: number | null;
  quantity: number;
  discount_amount: number;
  line_total: number;
};

export type SaleServiceItemRecord = {
  id: number;
  service_id: number | null;
  service_name: string;
  description: string;
  unit_price: number;
  unit_cost: number | null;
  quantity: number;
  discount_amount: number;
  line_total: number;
};

export type ReceiptSettingsSnapshot = {
  currencySymbol?: string;
  currencyPlacement?: "before" | "after";
  decimalPrecision?: string;
  taxRate?: string;
  cashRounding?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  receiptNotes?: string;
  digitalReceipts?: boolean;
  receiptOutput?: "bluetooth" | "sms" | "qr";
  supervisorPinForDiscounts?: boolean;
  discountLimit?: string;
  inactivityLock?: string;
};

export type SaleRecord = {
  id: number;
  transaction_code: string;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: string;

  gross_subtotal: number;
  discount_amount: number;
  discount_percent: number;
  discount_authorized_by: string | null;
  discount_authorized_username: string | null;

  subtotal: number;
  tax_amount: number;
  rounding_adjustment: number;
  total: number;
  amount_tendered: number;
  change_due: number;

  settings_snapshot: ReceiptSettingsSnapshot;
  created_at: string;

  cashier_id?: string | null;
  cashier_username?: string | null;
  cashier_display_name?: string | null;
  terminal_id?: number | null;
  terminal_device_id?: string | null;

  items: SaleItemRecord[];
  service_items: SaleServiceItemRecord[];
};

export type SaleListItem = {
  id: number;
  transaction_code: string;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: string;
  total: number;
  gross_subtotal?: number;
  discount_amount?: number;
  discount_percent?: number;
  created_at: string;
  item_count: number;
  product_count?: number;
  service_count?: number;
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
  trailing_series: SalesSeriesPoint[];
};

export type CategorySales = {
  category: string;
  units_sold: number;
  revenue: number;
};

export type CategorySalesSeriesPoint = {
  label: string;
  date?: string;
  categories: Record<string, number>;
};

export type TopProductSales = {
  /** null for sales of products deleted before archiving existed. */
  product_id: number | null;
  sku: string | null;
  name: string;
  category: string;
  units_sold: number;
  revenue: number;
  archived: boolean;
  /** The product no longer exists; only its sales history remains. */
  deleted: boolean;
};

export type ProductSalesReport = {
  period: ReportPeriod | null;
  date: string | null;
  timezone: string;
  period_start: string | null;
  period_end_exclusive: string | null;
  categories: CategorySales[];
  category_series: CategorySalesSeriesPoint[];
  top_products: TopProductSales[];
  /** Products matching the filters, before pagination. */
  total_products: number;
  offset: number;
  limit: number;
};
