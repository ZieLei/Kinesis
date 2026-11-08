import { apiRequest } from "./api";

import type {
  AddStockRequest,
  AdminProductCreateRequest,
  AdminProductUpdateRequest,
  ArchiveProductResponse,
  AdjustStockRequest,
  ApiHealth,
  InventoryListQuery,
  InventoryListResponse,
  StockChangeResponse,
  StockHistoryResponse,
  OperationsOverviewResponse,
  Product,
  ProductListResponse,
  ProductSalesReport,
  ReportPeriod,
  SalesListResponse,
  SalesReportResponse,
} from "../types/admin";

import type {
  SettingsApiResponse,
  SettingsState,
  SettingsUpdateRequest,
} from "../types/settings";


const PRODUCT_PAGE_SIZE = 100;


export type PaymentBreakdownResponse = {
  period: ReportPeriod;
  timezone: string;
  period_start: string;
  period_end_exclusive: string;
  payment_breakdown: Array<{
    payment_method: string;
    transactions: number;
    revenue: number;
  }>;
};


// --------------------------------------------------
// API health
// --------------------------------------------------


export function fetchApiHealth(
  signal?: AbortSignal,
): Promise<ApiHealth> {
  return apiRequest<ApiHealth>(
    "/api/health",
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Products
// --------------------------------------------------


export async function fetchAllProducts(
  signal?: AbortSignal,
): Promise<Product[]> {
  const products: Product[] = [];

  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      limit: String(PRODUCT_PAGE_SIZE),
      offset: String(offset),
    });

    const page = await apiRequest<ProductListResponse>(
      `/api/products?${params.toString()}`,
      {
        method: "GET",
        signal,
      },
    );

    if (!Array.isArray(page.items)) {
      throw new Error(
        "The products endpoint returned an invalid response.",
      );
    }

    products.push(...page.items);

    if (page.items.length < PRODUCT_PAGE_SIZE) {
      return products;
    }

    offset += page.items.length;
  }
}


// --------------------------------------------------
// Sales reports
// --------------------------------------------------


export function fetchSalesReport(
  period: ReportPeriod,
  signal?: AbortSignal,
): Promise<SalesReportResponse> {
  const params = new URLSearchParams({
    period,
  });

  return apiRequest<SalesReportResponse>(
    `/api/reports/sales?${params.toString()}`,
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Payment breakdown
// --------------------------------------------------


export function fetchPaymentBreakdown(
  period: ReportPeriod,
  signal?: AbortSignal,
): Promise<PaymentBreakdownResponse> {
  const params = new URLSearchParams({
    period,
  });

  return apiRequest<PaymentBreakdownResponse>(
    `/api/admin/overview/payment-breakdown?${params.toString()}`,
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Product sales report
// --------------------------------------------------


export function fetchProductSalesReport(
  limit = 5,
  signal?: AbortSignal,
): Promise<ProductSalesReport> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  return apiRequest<ProductSalesReport>(
    `/api/reports/products?${params.toString()}`,
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Recent sales
// --------------------------------------------------


export function fetchRecentSales(
  limit = 5,
  offset = 0,
  signal?: AbortSignal,
): Promise<SalesListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return apiRequest<SalesListResponse>(
    `/api/sales?${params.toString()}`,
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Operations overview
// --------------------------------------------------


export function fetchOperationsOverview(
  signal?: AbortSignal,
): Promise<OperationsOverviewResponse> {
  return apiRequest<OperationsOverviewResponse>(
    "/api/admin/overview/operations",
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Application settings
// --------------------------------------------------


export function fetchAdminSettings(
  signal?: AbortSignal,
): Promise<SettingsApiResponse> {
  return apiRequest<SettingsApiResponse>(
    "/api/admin/settings",
    {
      method: "GET",
      signal,
    },
  );
}


export function saveAdminSettings(
  settings: SettingsState,
  expectedVersion: number,
): Promise<SettingsApiResponse> {
  const payload: SettingsUpdateRequest = {
    expected_version: expectedVersion,
    settings,
  };

  return apiRequest<SettingsApiResponse>(
    "/api/admin/settings",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}


// --------------------------------------------------
// GCash payment QR image
// --------------------------------------------------


export function uploadAdminGcashQr(
  file: File,
  expectedVersion: number,
): Promise<SettingsApiResponse> {
  const formData = new FormData();

  formData.append("file", file);
  formData.append(
    "expected_version",
    String(expectedVersion),
  );

  return apiRequest<SettingsApiResponse>(
    "/api/admin/settings/gcash-qr",
    {
      method: "POST",
      body: formData,
    },
  );
}


export function deleteAdminGcashQr(
  expectedVersion: number,
): Promise<SettingsApiResponse> {
  return apiRequest<SettingsApiResponse>(
    "/api/admin/settings/gcash-qr",
    {
      method: "DELETE",
      body: JSON.stringify({
        expected_version: expectedVersion,
      }),
    },
  );
}


// --------------------------------------------------
// Stock management
// --------------------------------------------------

export function fetchInventoryProducts(
  query: InventoryListQuery,
  signal?: AbortSignal,
): Promise<InventoryListResponse> {
  const params = new URLSearchParams({
    sort: query.sort,
    direction: query.direction,
    limit: String(query.limit),
    offset: String(query.offset),
  });

  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.category) params.set("category", query.category);
  if (query.status) params.set("status", query.status);
  if (query.archived) params.set("archived", "true");

  return apiRequest<InventoryListResponse>(
    `/api/admin/inventory/products?${params.toString()}`,
    { signal },
  );
}

export function addStock(request: AddStockRequest): Promise<StockChangeResponse> {
  return apiRequest<StockChangeResponse>("/api/admin/inventory/receipts", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function adjustStock(
  request: AdjustStockRequest,
): Promise<StockChangeResponse> {
  return apiRequest<StockChangeResponse>("/api/admin/inventory/adjustments", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function fetchStockHistory(
  productId: number,
  signal?: AbortSignal,
): Promise<StockHistoryResponse> {
  return apiRequest<StockHistoryResponse>(
    `/api/admin/inventory/products/${productId}/history`,
    { signal },
  );
}

export function createProduct(request: AdminProductCreateRequest): Promise<Product> {
  return apiRequest<Product>("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function updateProduct(
  productId: number,
  request: AdminProductUpdateRequest,
): Promise<Product> {
  return apiRequest<Product>(`/api/admin/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function uploadProductImage(productId: number, file: File): Promise<Product> {
  const body = new FormData();
  body.append("file", file, file.name);

  return apiRequest<Product>(`/api/admin/products/${productId}/image`, {
    method: "POST",
    body,
  });
}

export function deleteProductImage(productId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/admin/products/${productId}/image`, {
    method: "DELETE",
  });
}

/** Archives a product with history; permanently deletes one without. */
export function archiveProduct(productId: number): Promise<ArchiveProductResponse> {
  return apiRequest<ArchiveProductResponse>(`/api/admin/products/${productId}`, {
    method: "DELETE",
  });
}

export function restoreProduct(productId: number): Promise<Product> {
  return apiRequest<Product>(`/api/admin/products/${productId}/restore`, {
    method: "POST",
  });
}
