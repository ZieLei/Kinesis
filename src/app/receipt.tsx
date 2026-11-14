
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useBackNavigation } from "@/hooks/useBackNavigation";

import { exportReceipt } from "@/lib/receiptExport";
import { fetchSale, reverseSale } from "@/lib/salesApi";
import ReverseSaleSheet, { REVERSAL_REASONS } from "@/components/ReverseSaleSheet";
import type { SaleRecord } from "@/types/sale";

type CurrencyPlacement = "before" | "after";

type ReceiptLine = {
  key: string;
  kind: "PART" | "SERVICE";
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

function formatMoney(
  amount: number,
  currencySymbol: string,
  currencyPlacement: CurrencyPlacement,
  decimalPrecision: number,
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  const formatted = safeAmount.toLocaleString("en-PH", {
    minimumFractionDigits: decimalPrecision,
    maximumFractionDigits: decimalPrecision,
  });

  return currencyPlacement === "before"
    ? `${currencySymbol}${formatted}`
    : `${formatted} ${currencySymbol}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { date: "—", time: "—" };
  }

  return {
    date: date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: date.toLocaleTimeString("en-PH", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function getReceiptSettings(sale: SaleRecord) {
  const snapshot = sale.settings_snapshot ?? {};

  const requestedPrecision = Number(
    snapshot.decimalPrecision ?? "2",
  );

  const decimalPrecision =
    Number.isInteger(requestedPrecision) &&
      requestedPrecision >= 0 &&
      requestedPrecision <= 3
      ? requestedPrecision
      : 2;

  return {
    currencySymbol: snapshot.currencySymbol || "₱",
    currencyPlacement:
      snapshot.currencyPlacement === "after"
        ? "after" as const
        : "before" as const,
    decimalPrecision,
    receiptHeader:
      snapshot.receiptHeader?.trim() ||
      "KINESIS MOTORCYCLE PARTS",
    receiptFooter:
      snapshot.receiptFooter?.trim() ||
      "Thank you for your purchase!",
    receiptNotes: snapshot.receiptNotes?.trim() || "",
  };
}

function getReceiptLines(sale: SaleRecord): ReceiptLine[] {
  const productLines: ReceiptLine[] = sale.items.map((item) => ({
    key: `product-${item.id}`,
    kind: "PART",
    name: item.product_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total,
  }));

  const serviceLines: ReceiptLine[] = (
    sale.service_items ?? []
  ).map((item) => ({
    key: `service-${item.id}`,
    kind: "SERVICE",
    name: item.service_name,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total,
  }));

  return [...productLines, ...serviceLines];
}

function getSaleAmounts(sale: SaleRecord) {
  const taxAmount = sale.tax_amount ?? 0;
  const discountAmount = sale.discount_amount ?? 0;

  const roundingAdjustment =
    sale.rounding_adjustment ??
    sale.total - sale.subtotal - taxAmount;

  return {
    grossSubtotal: sale.gross_subtotal,
    discountAmount,
    discountPercent: sale.discount_percent ?? 0,
    subtotal: sale.subtotal,
    taxAmount,
    roundingAdjustment,
    total: sale.total,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createReceiptHtml(sale: SaleRecord): string {
  const settings = getReceiptSettings(sale);
  const amounts = getSaleAmounts(sale);
  const { date, time } = formatDate(sale.created_at);
  const lines = getReceiptLines(sale);

  const money = (amount: number) =>
    escapeHtml(
      formatMoney(
        amount,
        settings.currencySymbol,
        settings.currencyPlacement,
        settings.decimalPrecision,
      ),
    );

  const itemRows = lines
    .map(
      (item) => `
        <div class="item">
          <div class="item-main">
            <div class="kind">${escapeHtml(item.kind)}</div>
            <div class="item-name">${escapeHtml(item.name)}</div>
            ${item.description
          ? `<div class="description">${escapeHtml(item.description)}</div>`
          : ""
        }
            <div class="unit-price">
              ${item.quantity} × ${money(item.unitPrice)}
            </div>
          </div>
          <div class="item-total">${money(item.lineTotal)}</div>
        </div>
      `,
    )
    .join("");

  const discountRow =
    amounts.discountAmount > 0
      ? `
        <div class="summary-row discount">
          <span>Discount (${escapeHtml(amounts.discountPercent)}%)</span>
          <span>-${money(amounts.discountAmount)}</span>
        </div>
      `
      : "";

  const roundingRow =
    amounts.roundingAdjustment !== 0
      ? `
        <div class="summary-row">
          <span>Cash rounding</span>
          <span>${amounts.roundingAdjustment > 0 ? "+" : ""
      }${money(amounts.roundingAdjustment)}</span>
        </div>
      `
      : "";

  const cashierRow = sale.cashier_display_name || sale.cashier_username
    ? `
      <div class="meta-row">
        <span>Cashier</span>
        <span>${escapeHtml(sale.cashier_display_name || sale.cashier_username || "")}</span>
      </div>
    `
    : "";

  const terminalRow = sale.terminal_device_id
    ? `
      <div class="meta-row">
        <span>Terminal</span>
        <span>${escapeHtml(sale.terminal_device_id)}</span>
      </div>
    `
    : "";

  const approvalRow = sale.discount_authorized_username
    ? `
      <div class="summary-row">
        <span>Discount approved by</span>
        <span>${escapeHtml(sale.discount_authorized_username)}</span>
      </div>
    `
    : "";

  const reversalBlock = sale.reversal
    ? `
      <div class="divider"></div>
      <div class="summary-row">
        <strong>${sale.reversal.kind === "void" ? "VOIDED" : "REFUNDED"}</strong>
        <span>${escapeHtml(formatDate(sale.reversal.created_at).date)} ${escapeHtml(formatDate(sale.reversal.created_at).time)}</span>
      </div>
      <div class="summary-row">
        <span>Reason</span>
        <span>${escapeHtml(
          REVERSAL_REASONS.find((r) => r.code === sale.reversal?.reason_code)?.label ??
            sale.reversal.reason_code,
        )}${sale.reversal.note ? ` — ${escapeHtml(sale.reversal.note)}` : ""}</span>
      </div>
      <div class="summary-row">
        <span>Approved by</span>
        <span>${escapeHtml(sale.reversal.authorized_by_username)}</span>
      </div>
    `
    : "";

  const referenceRow = sale.reference_number
    ? `
      <div class="summary-row">
        <span>Reference</span>
        <span>${escapeHtml(sale.reference_number)}</span>
      </div>
    `
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 32px;
            background: #ffffff;
            color: #222222;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
          }

          .receipt {
            width: 100%;
            max-width: 420px;
            margin: 0 auto;
          }

          .header {
            text-align: center;
            margin-bottom: 8px;
          }

          .header h1 {
            font-size: 22px;
            margin: 0;
            line-height: 1.3;
            overflow-wrap: anywhere;
          }

          .subtitle {
            color: #777777;
            font-size: 11px;
            margin-top: 5px;
          }

          .divider {
            border-top: 1px dashed #aaaaaa;
            margin: 16px 0;
          }

          .meta-row,
          .summary-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 9px;
          }

          .meta-row span:first-child,
          .summary-row span:first-child {
            color: #666666;
          }

          .meta-row span:last-child,
          .summary-row span:last-child {
            text-align: right;
            overflow-wrap: anywhere;
          }

          .item-header {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            margin-bottom: 14px;
          }

          .item {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 16px;
          }

          .item-main {
            flex: 1;
            min-width: 0;
          }

          .kind {
            color: #4779bb;
            font-size: 9px;
            font-weight: bold;
            margin-bottom: 3px;
          }

          .item-name {
            font-size: 12px;
            font-weight: bold;
            overflow-wrap: anywhere;
          }

          .description {
            margin-top: 3px;
            color: #777777;
            font-size: 10px;
          }

          .unit-price {
            margin-top: 5px;
            color: #777777;
            font-size: 10px;
          }

          .item-total {
            white-space: nowrap;
            text-align: right;
          }

          .discount {
            color: #25834b;
            font-weight: bold;
          }

          .total {
            font-size: 15px;
            font-weight: bold;
            color: #222222;
          }

          .payment-title {
            font-weight: bold;
            margin-bottom: 12px;
          }

          .notes {
            text-align: center;
            white-space: pre-wrap;
            color: #666666;
            line-height: 1.6;
          }

          .footer {
            text-align: center;
            font-weight: bold;
            line-height: 1.5;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .status {
            font-weight: bold;
            text-transform: uppercase;
          }

          @media print {
            body {
              padding: 12px;
            }
          }
        </style>
      </head>

      <body>
        <main class="receipt">

          <header class="header">
            <h1>${escapeHtml(settings.receiptHeader)}</h1>
            <div class="subtitle">Transaction Receipt</div>
          </header>

          <div class="divider"></div>

          <div class="meta-row">
            <span>Transaction</span>
            <strong>${escapeHtml(sale.transaction_code)}</strong>
          </div>

          <div class="meta-row">
            <span>Date</span>
            <span>${escapeHtml(date)}</span>
          </div>

          <div class="meta-row">
            <span>Time</span>
            <span>${escapeHtml(time)}</span>
          </div>

          ${cashierRow}

          ${terminalRow}

          <div class="meta-row">
            <span>Status</span>
            <span class="status">${escapeHtml(sale.status)}</span>
          </div>

          <div class="divider"></div>

          <div class="item-header">
            <span>ITEM</span>
            <span>TOTAL</span>
          </div>

          ${itemRows}

          <div class="divider"></div>

          <div class="summary-row">
            <span>Original subtotal</span>
            <span>${money(amounts.grossSubtotal)}</span>
          </div>

          ${discountRow}

          ${approvalRow}

          <div class="summary-row">
            <strong>Subtotal after discount</strong>
            <strong>${money(amounts.subtotal)}</strong>
          </div>

          <div class="summary-row">
            <span>Tax</span>
            <span>${money(amounts.taxAmount)}</span>
          </div>

          ${roundingRow}

          <div class="divider"></div>

          <div class="summary-row total">
            <span>TOTAL</span>
            <span>${money(amounts.total)}</span>
          </div>

          <div class="divider"></div>

          <div class="payment-title">Payment Information</div>

          <div class="summary-row">
            <span>Payment method</span>
            <strong>${escapeHtml(sale.payment_method.toUpperCase())}</strong>
          </div>

          ${referenceRow}

          <div class="summary-row">
            <span>Amount received / paid</span>
            <span>${money(sale.amount_tendered)}</span>
          </div>

          <div class="summary-row">
            <span>Change</span>
            <span>${money(sale.change_due)}</span>
          </div>

          ${reversalBlock}

          ${settings.receiptNotes
      ? `
                <div class="divider"></div>
                <div class="notes">${escapeHtml(settings.receiptNotes)}</div>
              `
      : ""
    }

          <div class="divider"></div>

          <div class="footer">
            ${escapeHtml(settings.receiptFooter)}
          </div>

        </main>
      </body>
    </html>
  `;
}

export default function Receipt() {
  const params = useLocalSearchParams<{
    transactionCode?: string | string[];
  }>();

  const transactionCode = Array.isArray(params.transactionCode)
    ? params.transactionCode[0]
    : params.transactionCode;

  const { canGoBack, goBack } = useBackNavigation();
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setSale(null);
    setError("");
    setLoading(true);

    if (!transactionCode) {
      setError("No transaction code was provided for this receipt.");
      setLoading(false);

      return () => controller.abort();
    }

    void fetchSale(transactionCode, controller.signal)
      .then((savedSale) => {
        if (!controller.signal.aborted) {
          setSale(savedSale);
        }
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;

        setError(
          requestError instanceof Error
            ? requestError.message
            : "The saved receipt could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [transactionCode, retryCount]);

  const handleExport = async () => {
    if (!sale || exporting) return;

    setError("");
    setExporting(true);

    try {
      // Native: PDF file + share sheet. Web: browser print dialog
      // ("Save as PDF"). See src/lib/receiptExport.*.ts.
      await exportReceipt(
        createReceiptHtml(sale),
        `Kinesis Receipt ${sale.transaction_code}`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "The receipt could not be exported.",
      );
    } finally {
      setExporting(false);
    }
  };

  const receiptSettings = sale
    ? getReceiptSettings(sale)
    : null;

  const money = (amount: number) => {
    if (!receiptSettings) return "—";

    return formatMoney(
      amount,
      receiptSettings.currencySymbol,
      receiptSettings.currencyPlacement,
      receiptSettings.decimalPrecision,
    );
  };

  const amounts = sale ? getSaleAmounts(sale) : null;
  const receiptLines = sale ? getReceiptLines(sale) : [];

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 28,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="items-center justify-center py-16">
            <ActivityIndicator size="large" color="#89B4FA" />

            <Text className="mt-3 font-inter-medium text-sm text-ctp-subtext0">
              Loading saved receipt...
            </Text>
          </View>
        ) : error && !sale ? (
          <View className="my-8 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-5">
            <Text className="text-center font-inter-semibold text-lg text-ctp-text">
              Could not load receipt
            </Text>

            <Text className="mt-2 text-center text-sm leading-5 text-ctp-subtext0">
              {error}
            </Text>

            <Pressable
              onPress={() => setRetryCount((value) => value + 1)}
              className="mt-5 rounded-lg bg-ctp-blue px-4 py-3"
            >
              <Text className="text-center font-inter-semibold text-sm text-ctp-crust">
                Retry
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.dismissTo("/new-sale")}
              className="mt-3 rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3"
            >
              <Text className="text-center font-inter-semibold text-sm text-ctp-text">
                Back to New Sale
              </Text>
            </Pressable>
          </View>
        ) : sale && receiptSettings && amounts ? (
          <View className="w-full max-w-sm self-center rounded-lg border border-ctp-surface0 bg-ctp-mantle p-5">

            {/* Header */}

            <Text className="whitespace-pre-wrap text-center font-fredoka text-2xl font-bold text-ctp-text">
              {receiptSettings.receiptHeader}
            </Text>

            <Text className="mt-1 text-center font-inter-medium text-xs text-ctp-subtext0">
              Transaction Receipt
            </Text>

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Transaction information */}

            <View className="gap-2">
              <View className="flex-row justify-between gap-3">
                <Text className="text-xs font-inter-regular text-ctp-subtext0">
                  Transaction
                </Text>

                <Text className="flex-1 text-right text-xs font-inter-semibold text-ctp-text">
                  {sale.transaction_code}
                </Text>
              </View>

              <View className="flex-row justify-between gap-3">
                <Text className="text-xs font-inter-regular text-ctp-subtext0">
                  Date
                </Text>

                <Text className="text-right text-xs font-inter-regular text-ctp-text">
                  {formatDate(sale.created_at).date}
                </Text>
              </View>

              <View className="flex-row justify-between gap-3">
                <Text className="text-xs font-inter-regular text-ctp-subtext0">
                  Time
                </Text>

                <Text className="text-right text-xs font-inter-regular text-ctp-text">
                  {formatDate(sale.created_at).time}
                </Text>
              </View>

              {sale.cashier_display_name || sale.cashier_username ? (
                <View className="flex-row justify-between gap-3">
                  <Text className="text-xs font-inter-regular text-ctp-subtext0">
                    Cashier
                  </Text>

                  <Text className="text-right text-xs font-inter-regular text-ctp-text">
                    {sale.cashier_display_name || sale.cashier_username}
                  </Text>
                </View>
              ) : null}

              <View className="flex-row justify-between gap-3">
                <Text className="text-xs font-inter-regular text-ctp-subtext0">
                  Status
                </Text>

                <Text
                  className={`text-right text-xs font-inter-semibold ${
                    sale.status === "completed" ? "text-ctp-green" : "text-ctp-red"
                  }`}
                >
                  {sale.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {sale.reversal ? (
              <View className="mt-3 rounded-lg border border-ctp-red/40 bg-ctp-red/10 p-3">
                <Text className="text-xs font-inter-semibold text-ctp-red">
                  {sale.reversal.kind === "void" ? "VOIDED" : "REFUNDED"} ·{" "}
                  {formatDate(sale.reversal.created_at).date}{" "}
                  {formatDate(sale.reversal.created_at).time}
                </Text>
                <Text className="mt-1 text-xs font-inter-regular text-ctp-text">
                  {REVERSAL_REASONS.find((r) => r.code === sale.reversal?.reason_code)
                    ?.label ?? sale.reversal.reason_code}
                  {sale.reversal.note ? ` — ${sale.reversal.note}` : ""}
                </Text>
                <Text className="mt-1 text-xs font-inter-regular text-ctp-subtext0">
                  Approved by {sale.reversal.authorized_by_username}
                  {sale.reversal.restocked ? " · items returned to stock" : " · not returned to stock"}
                </Text>
              </View>
            ) : null}

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Items */}

            <View className="gap-3">
              <View className="flex-row items-center">
                <Text className="flex-1 text-[11px] font-inter-bold text-ctp-text">
                  ITEM
                </Text>

                <Text className="w-10 text-center text-[11px] font-inter-bold text-ctp-text">
                  QTY
                </Text>

                <Text className="w-24 text-right text-[11px] font-inter-bold text-ctp-text">
                  TOTAL
                </Text>
              </View>

              {receiptLines.map((item) => (
                <View key={item.key} className="flex-row items-start">
                  <View className="flex-1 pr-2">
                    <Text className="text-[9px] font-inter-semibold text-ctp-blue">
                      {item.kind}
                    </Text>

                    <Text className="text-[11px] font-inter-medium text-ctp-text">
                      {item.name}
                    </Text>

                    {item.description ? (
                      <Text className="mt-0.5 text-[9px] font-inter-regular text-ctp-subtext0">
                        {item.description}
                      </Text>
                    ) : null}

                    <Text className="mt-0.5 text-[10px] font-inter-regular text-ctp-subtext0">
                      {money(item.unitPrice)} each
                    </Text>
                  </View>

                  <Text className="w-10 text-center text-[11px] font-inter-regular text-ctp-subtext0">
                    {item.quantity}
                  </Text>

                  <Text className="w-24 text-right text-[11px] font-inter-regular text-ctp-subtext0">
                    {money(item.lineTotal)}
                  </Text>
                </View>
              ))}
            </View>

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Financial summary */}

            <View className="gap-2">
              <View className="flex-row justify-between gap-3">
                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  Original subtotal
                </Text>

                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  {money(amounts.grossSubtotal)}
                </Text>
              </View>

              {amounts.discountAmount > 0 ? (
                <View className="flex-row justify-between gap-3">
                  <Text className="text-[11px] font-inter-semibold text-ctp-green">
                    Discount ({amounts.discountPercent}%)
                  </Text>

                  <Text className="text-[11px] font-inter-semibold text-ctp-green">
                    -{money(amounts.discountAmount)}
                  </Text>
                </View>
              ) : null}

              {sale.discount_authorized_username ? (
                <View className="flex-row justify-between gap-3">
                  <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                    Discount approved by
                  </Text>

                  <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                    {sale.discount_authorized_username}
                  </Text>
                </View>
              ) : null}

              <View className="flex-row justify-between gap-3">
                <Text className="text-[11px] font-inter-semibold text-ctp-text">
                  Subtotal after discount
                </Text>

                <Text className="text-[11px] font-inter-semibold text-ctp-text">
                  {money(amounts.subtotal)}
                </Text>
              </View>

              <View className="flex-row justify-between gap-3">
                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  Tax
                </Text>

                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  {money(amounts.taxAmount)}
                </Text>
              </View>

              {amounts.roundingAdjustment !== 0 ? (
                <View className="flex-row justify-between gap-3">
                  <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                    Cash rounding
                  </Text>

                  <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                    {amounts.roundingAdjustment > 0 ? "+" : ""}
                    {money(amounts.roundingAdjustment)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Final total and payment */}

            <View className="gap-2">
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-xs font-inter-bold text-ctp-text">
                  TOTAL
                </Text>

                <Text className="text-xs font-inter-bold text-ctp-text">
                  {money(amounts.total)}
                </Text>
              </View>

              <View className="flex-row justify-between gap-3">
                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  Payment
                </Text>

                <Text className="text-[11px] font-inter-semibold text-ctp-text">
                  {sale.payment_method.toUpperCase()}
                </Text>
              </View>

              {sale.reference_number ? (
                <View className="flex-row justify-between gap-3">
                  <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                    Reference
                  </Text>

                  <Text className="flex-1 text-right text-[11px] font-inter-regular text-ctp-text">
                    {sale.reference_number}
                  </Text>
                </View>
              ) : null}

              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-[11px] font-inter-regular text-ctp-subtext0">
                  Amount Received / Paid
                </Text>

                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  {money(sale.amount_tendered)}
                </Text>
              </View>

              <View className="flex-row justify-between gap-3">
                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  Change
                </Text>

                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  {money(sale.change_due)}
                </Text>
              </View>
            </View>

            {/* Receipt notes */}

            {receiptSettings.receiptNotes ? (
              <>
                <View className="my-3 border-t border-dashed border-ctp-surface1" />

                <Text className="whitespace-pre-wrap text-center text-[10px] font-inter-regular leading-4 text-ctp-subtext0">
                  {receiptSettings.receiptNotes}
                </Text>
              </>
            ) : null}

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Footer */}

            <Text className="whitespace-pre-wrap text-center text-[11px] font-inter-semibold text-ctp-text">
              {receiptSettings.receiptFooter}
            </Text>

            {error ? (
              <Text className="mt-3 text-center text-xs leading-5 text-ctp-red">
                {error}
              </Text>
            ) : null}

            {/* Actions */}

            <View className="mt-5 items-center gap-2 pb-2">
              {canGoBack ? (
                <Pressable
                  onPress={goBack}
                  disabled={exporting}
                  accessibilityRole="button"
                  className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3"
                >
                  <Text className="text-center text-sm font-inter-semibold text-ctp-text">
                    Back
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => router.dismissTo("/new-sale")}
                disabled={exporting}
                className="w-full rounded-lg border border-ctp-blue bg-ctp-blue px-4 py-3"
              >
                <Text className="text-center text-sm font-inter-semibold text-ctp-crust">
                  New Sale
                </Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  router.dismissTo("/dashboard")
                }
                disabled={exporting}
                className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3"
              >
                <Text className="text-center text-sm font-inter-semibold text-ctp-text">
                  Back to Home
                </Text>
              </Pressable>

              {sale.status === "completed" ? (
                <Pressable
                  onPress={() => setReversing(true)}
                  disabled={exporting}
                  accessibilityRole="button"
                  className="w-full rounded-lg border border-ctp-red/50 bg-ctp-base px-4 py-3"
                >
                  <Text className="text-center text-sm font-inter-semibold text-ctp-red">
                    Void / Refund
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleExport}
                disabled={exporting}
                accessibilityRole="button"
                accessibilityLabel="Export receipt as PDF"
                accessibilityState={{
                  disabled: exporting,
                  busy: exporting,
                }}
                className={`w-full flex-row items-center justify-center gap-2 rounded-lg border border-ctp-surface1 px-4 py-3 ${exporting ? "bg-ctp-surface0" : "bg-ctp-base"
                  }`}
              >
                {exporting ? (
                  <ActivityIndicator
                    size="small"
                    color="#89B4FA"
                  />
                ) : null}

                <Text className="text-center text-sm font-inter-semibold text-ctp-text">
                  {exporting
                    ? "Generating PDF..."
                    : "Export Receipt (PDF)"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {sale && reversing ? (
        <ReverseSaleSheet
          visible
          transactionCode={sale.transaction_code}
          onClose={() => setReversing(false)}
          onSubmit={async (request) => {
            setSale(await reverseSale(sale.transaction_code, request));
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
