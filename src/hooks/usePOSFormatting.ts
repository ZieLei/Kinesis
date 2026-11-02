

import { useCallback } from "react";

import { useTerminalSettings } from "@/app/context/TerminalSettingsContext";
import {
  formatPOSCompactCurrency,
  formatPOSCurrency,
} from "@/lib/posFormatting";

export function usePOSFormatting() {
  const { settings } = useTerminalSettings();

  const formatCurrency = useCallback(
    (amount: number) => formatPOSCurrency(amount, settings),
    [settings],
  );

  const formatCompactCurrency = useCallback(
    (amount: number) => formatPOSCompactCurrency(amount, settings),
    [settings],
  );

  return {
    settings,
    formatCurrency,
    formatCompactCurrency,
    allowNegativeInventory: settings?.allowNegativeInventory ?? false,
  };
}
