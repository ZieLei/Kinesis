

import { apiRequest } from "@/lib/api";
import type {
  InventoryReceipt,
  InventoryReceiptCreate,
} from "@/types/inventory";

export function createInventoryReceipt(
  data: InventoryReceiptCreate,
): Promise<InventoryReceipt> {
  return apiRequest<InventoryReceipt>("/api/inventory/receipts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
