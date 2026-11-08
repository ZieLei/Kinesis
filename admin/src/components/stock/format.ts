// Labels, formatters and input parsers shared by the Stock page dialogs.

import type { StatusTone } from "../ui/StatusDot";
import type { StockAdjustmentReason, StockStatus } from "../../types/admin";


export const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

export const STATUS_TONE: Record<StockStatus, StatusTone> = {
  in_stock: "success",
  low: "warning",
  out: "danger",
};

export const REASON_LABEL: Record<StockAdjustmentReason, string> = {
  damaged: "Damaged",
  lost: "Lost or stolen",
  expired: "Expired",
  count_correction: "Stock count correction",
  other: "Other",
};



export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PH").format(value);
}

export function formatDateTime(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}

/** Positive whole number from a text field, or null. */
export function parseQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return parsed > 0 && parsed <= 100000 ? parsed : null;
}

export function parseCost(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{1,8}(\.\d{1,4})?$/.test(trimmed) ? trimmed : null;
}

/** Selling price: positive, at most 2 decimal places. */
export function parsePrice(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{1,8}(\.\d{1,2})?$/.test(trimmed) && Number(trimmed) > 0 ? trimmed : null;
}


type SkuSettings = {
  skuFormat: string;
  skuPrefix: string;
  skuDigits: string;
  skuIncludeYear: boolean;
};

/**
 * Shape of the next generated SKU, e.g. "KNS-######". Mirrors
 * backend/sku_generator.py; the real sequence number is assigned on save.
 */
export function skuPreview(settings: SkuSettings): string | null {
  const digits = Number(settings.skuDigits);
  if (!Number.isInteger(digits) || digits < 1) return null;

  const sequence = "#".repeat(digits);
  const prefix = settings.skuPrefix.trim().toUpperCase();
  const year = settings.skuIncludeYear
    ? `${new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric" }).format(new Date())}-`
    : "";

  switch (settings.skuFormat) {
    case "prefix-sequence":
      return `${prefix}-${year}${sequence}`;
    case "sequence-only":
      return `${year}${sequence}`;
    case "prefix-part-sequence":
      return `${prefix}-${year}PART-${sequence}`;
    default:
      return null;
  }
}

/** Case- and spacing-insensitive key used to match category spellings. */
export function categoryKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
