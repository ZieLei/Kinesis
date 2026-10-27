export type ApiHealth = {
  status: string;
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

export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

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
    month?: number;
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
};

export type SalesListResponse = {
  items: SaleListItem[];
  limit: number;
  offset: number;
  count: number;
  statuses: Record<string, number>;
};
