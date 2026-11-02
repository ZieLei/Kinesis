
import type { TerminalPOSSettings } from "@/lib/terminalAgentApi";

export type POSCurrencySettings = Pick<
  TerminalPOSSettings,
  "currencySymbol" | "currencyPlacement" | "decimalPrecision"
>;

function getPrecision(settings?: POSCurrencySettings | null): number {
  const value = Number(settings?.decimalPrecision ?? "2");

  return Number.isInteger(value) && value >= 0 && value <= 4
    ? value
    : 2;
}

function formatNumber(amount: number, precision: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return safeAmount.toLocaleString("en-PH", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function applyCurrency(
  value: string,
  settings?: POSCurrencySettings | null,
): string {
  const symbol = settings?.currencySymbol ?? "₱";
  const placement = settings?.currencyPlacement ?? "before";

  if (!symbol) return value;

  return placement === "after"
    ? `${value} ${symbol}`
    : `${symbol}${value}`;
}

export function formatPOSCurrency(
  amount: number,
  settings?: POSCurrencySettings | null,
): string {
  return applyCurrency(
    formatNumber(amount, getPrecision(settings)),
    settings,
  );
}

export function formatPOSCompactCurrency(
  amount: number,
  settings?: POSCurrencySettings | null,
): string {
  const absoluteAmount = Math.abs(amount);

  let divisor = 1;
  let suffix = "";

  if (absoluteAmount >= 1_000_000) {
    divisor = 1_000_000;
    suffix = "M";
  } else if (absoluteAmount >= 1_000) {
    divisor = 1_000;
    suffix = "K";
  }

  const value = formatNumber(
    amount / divisor,
    getPrecision(settings),
  );

  return applyCurrency(`${value}${suffix}`, settings);
}
