import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { fetchSale } from "@/lib/salesApi";
import type { SaleRecord } from "@/types/sale";

function formatMoney(
  amount: number,
  currencySymbol: string,
  currencyPlacement: "before" | "after",
  decimalPrecision: number,
): string {
  const formatted = amount.toLocaleString("en-PH", {
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

  const requestedPrecision = Number(snapshot.decimalPrecision ?? "2");

  const decimalPrecision =
    Number.isInteger(requestedPrecision) &&
      requestedPrecision >= 0 &&
      requestedPrecision <= 3
      ? requestedPrecision
      : 2;

  return {
    currencySymbol: snapshot.currencySymbol || "₱",
    currencyPlacement: snapshot.currencyPlacement ?? "before",
    decimalPrecision,
    receiptHeader:
      snapshot.receiptHeader?.trim() || "KINESIS MOTORCYCLE PARTS",
    receiptFooter:
      snapshot.receiptFooter?.trim() || "Thank you for your purchase!",
    receiptNotes: snapshot.receiptNotes?.trim() || "",
  };
}

function createReceiptText(sale: SaleRecord): string {
  const { date, time } = formatDate(sale.created_at);

  const settings = getReceiptSettings(sale);

  const money = (amount: number) =>
    formatMoney(
      amount,
      settings.currencySymbol,
      settings.currencyPlacement,
      settings.decimalPrecision,
    );

  const taxAmount = sale.tax_amount ?? 0;

  const roundingAdjustment =
    sale.rounding_adjustment ??
    sale.total - sale.subtotal - taxAmount;

  const itemLines = sale.items.map(
    (item) =>
      `${item.product_name} — ${item.quantity} x ${money(item.unit_price)} = ${money(item.line_total)}`,
  );

  return [
    settings.receiptHeader,
    "Transaction Receipt",
    "",
    `Transaction: ${sale.transaction_code}`,
    `Date: ${date}`,
    `Time: ${time}`,
    "",
    ...itemLines,
    "",
    `Subtotal: ${money(sale.subtotal)}`,
    `Tax: ${money(taxAmount)}`,
    ...(roundingAdjustment !== 0
      ? [`Cash rounding: ${money(roundingAdjustment)}`]
      : []),
    `TOTAL: ${money(sale.total)}`,
    `Payment: ${sale.payment_method.toUpperCase()}`,
    ...(sale.reference_number
      ? [`Reference: ${sale.reference_number}`]
      : []),
    `Amount received/paid: ${money(sale.amount_tendered)}`,
    `Change: ${money(sale.change_due)}`,
    "",
    ...(settings.receiptNotes
      ? [settings.receiptNotes, ""]
      : []),
    settings.receiptFooter,
  ].join("\n");
}

export default function Receipt() {
  const params = useLocalSearchParams<{
    transactionCode?: string | string[];
  }>();

  const transactionCode = Array.isArray(params.transactionCode)
    ? params.transactionCode[0]
    : params.transactionCode;

  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

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
        if (controller.signal.aborted) return;
        setSale(savedSale);
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
    if (!sale) return;

    try {
      await Share.share({
        title: `Kinesis Receipt ${sale.transaction_code}`,
        message: createReceiptText(sale),
      });
    } catch {
      setError("The receipt could not be shared.");
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

  const taxAmount = sale?.tax_amount ?? 0;

  const roundingAdjustment = sale
    ? sale.rounding_adjustment ??
    sale.total - sale.subtotal - taxAmount
    : 0;

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
              onPress={() => router.replace("/new-sale")}
              className="mt-3 rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3"
            >
              <Text className="text-center font-inter-semibold text-sm text-ctp-text">
                Back to New Sale
              </Text>
            </Pressable>
          </View>
        ) : sale && receiptSettings ? (
          <View className="w-full max-w-sm self-center rounded-lg border border-ctp-surface0 bg-ctp-mantle p-5">
            {/* Receipt header */}
            <Text className="whitespace-pre-wrap text-center font-fredoka text-2xl font-bold text-ctp-text">
              {receiptSettings.receiptHeader}
            </Text>

            <Text className="mt-1 text-center font-inter-medium text-xs text-ctp-subtext0">
              Transaction Receipt
            </Text>

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Sale information */}
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

              <View className="flex-row justify-between gap-3">
                <Text className="text-xs font-inter-regular text-ctp-subtext0">
                  Status
                </Text>

                <Text className="text-right text-xs font-inter-semibold text-ctp-green">
                  {sale.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Line items */}
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

              {sale.items.map((item) => (
                <View
                  key={item.id}
                  className="flex-row items-start"
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-[11px] font-inter-medium text-ctp-text">
                      {item.product_name}
                    </Text>

                    <Text className="mt-0.5 text-[10px] font-inter-regular text-ctp-subtext0">
                      {money(item.unit_price)} each
                    </Text>
                  </View>

                  <Text className="w-10 text-center text-[11px] font-inter-regular text-ctp-subtext0">
                    {item.quantity}
                  </Text>

                  <Text className="w-24 text-right text-[11px] font-inter-regular text-ctp-subtext0">
                    {money(item.line_total)}
                  </Text>
                </View>
              ))}
            </View>

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Totals */}
            <View className="gap-2">
              <View className="flex-row justify-between gap-3">
                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  Subtotal
                </Text>

                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  {money(sale.subtotal)}
                </Text>
              </View>

              <View className="flex-row justify-between gap-3">
                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  Tax
                </Text>

                <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                  {money(taxAmount)}
                </Text>
              </View>

              {roundingAdjustment !== 0 && (
                <View className="flex-row justify-between gap-3">
                  <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                    Cash rounding
                  </Text>

                  <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                    {roundingAdjustment > 0 ? "+" : ""}
                    {money(roundingAdjustment)}
                  </Text>
                </View>
              )}
            </View>

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            {/* Payment summary */}
            <View className="gap-2">
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-xs font-inter-bold text-ctp-text">
                  TOTAL
                </Text>

                <Text className="text-xs font-inter-bold text-ctp-text">
                  {money(sale.total)}
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

            {receiptSettings.receiptNotes ? (
              <>
                <View className="my-3 border-t border-dashed border-ctp-surface1" />

                <Text className="whitespace-pre-wrap text-center text-[10px] font-inter-regular leading-4 text-ctp-subtext0">
                  {receiptSettings.receiptNotes}
                </Text>
              </>
            ) : null}

            <View className="my-3 border-t border-dashed border-ctp-surface1" />

            <Text className="whitespace-pre-wrap text-center text-[11px] font-inter-semibold text-ctp-text">
              {receiptSettings.receiptFooter}
            </Text>

            {error ? (
              <Text className="mt-2 text-center text-xs text-ctp-red">
                {error}
              </Text>
            ) : null}

            {/* Actions */}
            <View className="mt-5 items-center gap-2 pb-2">
              <Pressable
                onPress={() => router.replace("/new-sale")}
                className="w-full rounded-lg border border-ctp-blue bg-ctp-blue px-4 py-3"
              >
                <Text className="text-center text-sm font-inter-semibold text-ctp-crust">
                  New Sale
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.replace("/(tabs)/dashboard")}
                className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3"
              >
                <Text className="text-center text-sm font-inter-semibold text-ctp-text">
                  Back to Home
                </Text>
              </Pressable>

              <Pressable
                onPress={handleExport}
                className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3"
              >
                <Text className="text-center text-sm font-inter-semibold text-ctp-text">
                  Export Receipt
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
