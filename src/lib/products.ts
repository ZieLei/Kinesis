import { API_BASE_URL } from "@/lib/api";
import type { Product } from "@/types/product";

export const ALL_CATEGORY = "All";
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatsSummary = {
  outOfStock: number;
  lowStock: number;
  totalItems: number;
  totalProducts: number;
};

export const formatPrice = (price: number) =>
  price.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function getImageUri(product: Product | null | undefined) {
  if (!product?.image_url) return null;

  const url = product.image_url.startsWith("http")
    ? product.image_url
    : `${API_BASE_URL}${product.image_url.startsWith("/") ? "" : "/"}${product.image_url}`;

  const separator = url.includes("?") ? "&" : "?";

  return `${url}${separator}v=${encodeURIComponent(
    product.image_path ?? String(product.id),
  )}`;
}

export function computeStockStats(
  inventory: Product[],
  lowStockThreshold = LOW_STOCK_THRESHOLD,
): StockStatsSummary {
  const outOfStock = inventory.filter(
    (product) => product.stock === 0,
  ).length;

  const lowStock = inventory.filter(
    (product) =>
      product.stock > 0 &&
      product.stock <= lowStockThreshold,
  ).length;

  const totalItems = inventory.reduce(
    (sum, product) => sum + product.stock,
    0,
  );

  return {
    outOfStock,
    lowStock,
    totalItems,
    totalProducts: inventory.length,
  };
}
