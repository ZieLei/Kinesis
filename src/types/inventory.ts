

export type InventoryReceiptItemInput = {
  product_id: number;
  quantity: number;
  unit_cost: number;
  opening_stock_unit_cost?: number;
};

export type InventoryReceiptCreate = {
  supplier_name?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  items: InventoryReceiptItemInput[];
};

export type InventoryReceiptItem = {
  id: number;
  product_id: number;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type InventoryReceipt = {
  id: number;
  supplier_name: string | null;
  reference_number: string | null;
  notes: string | null;
  total_cost: number;
  received_at: string;
  items: InventoryReceiptItem[];
};
