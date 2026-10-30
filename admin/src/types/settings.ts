import type { LucideIcon } from "lucide-react";

export type SettingsState = {
  currencySymbol: string;
  currencyPlacement: "before" | "after";
  decimalPrecision: string;
  cashRounding: string;
  lowStockThreshold: string;
  allowNegativeInventory: boolean;
  skuFormat: string;
  skuPrefix: string;
  skuDigits: string;
  skuIncludeYear: boolean;
  taxRate: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptNotes: string;
  digitalReceipts: boolean;
  receiptOutput: "bluetooth" | "sms" | "qr";
  supervisorPinForDiscounts: boolean;
  allowCustomLineItems: boolean;
  discountLimit: string;
  inactivityLock: string;
  listenAddress: string;
  httpPort: string;
  corsOrigins: string;
  websocketHeartbeat: string;
  offlineQueueStrategy: string;
  backupSchedule: string;
  logLevel: string;
  consoleBufferLines: string;
};

export type SettingsApiResponse = {
  settings: SettingsState;
  version: number;
  updated_at: string;
};

export type SettingsUpdateRequest = {
  expected_version: number;
  settings: SettingsState;
};

export type UpdateSetting = <K extends keyof SettingsState>(
  key: K,
  value: SettingsState[K],
) => void;

export type Option = { label: string; value: string };

export type FieldDefinition = {
  key: keyof SettingsState;
  label: string;
  description?: string;
  type?: "text" | "number" | "textarea" | "select";
  options?: Option[];
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  suffix?: string;
  disabled?: (settings: SettingsState) => boolean;
  transform?: (value: string) => string;
};

export type SectionDefinition = {
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  badge?: string;
  fields: FieldDefinition[];
};
