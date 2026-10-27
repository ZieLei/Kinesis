
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Download from "lucide-react-native/icons/download";
import Funnel from "lucide-react-native/icons/funnel";

import { styledIcon } from "@/components/StyledIcon";
import {
  fetchProductSalesReport,
  fetchSalesReport,
} from "@/lib/salesApi";
import type {
  ProductSalesReport,
  ReportPeriod,
  SalesReportResponse,
} from "@/types/sale";

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledDownload = styledIcon(Download);
const StyledFunnel = styledIcon(Funnel);

const options = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
] as const;

const money = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const number = (value: number) => value.toLocaleString("en-PH");

const periodLabels: Record<
  ReportPeriod,
  { current: string; previous: string }
> = {
  daily: { current: "Today", previous: "Yesterday" },
  weekly: { current: "This Week", previous: "Last Week" },
  monthly: { current: "This Month", previous: "Last Month" },
  yearly: { current: "This Year", previous: "Last Year" },
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The report could not be loaded.";
}

export default function Reports() {
  const [selected, setSelected] = useState<"sale" | "product">("sale");
  const [open, setOpen] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [refreshCount, setRefreshCount] = useState(0);

  const [salesReport, setSalesReport] =
    useState<SalesReportResponse | null>(null);
  const [productReport, setProductReport] =
    useState<ProductSalesReport | null>(null);

  const [salesLoading, setSalesLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [salesError, setSalesError] = useState("");
  const [productsError, setProductsError] = useState("");

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();

      setSalesLoading(true);
      setProductsLoading(true);
      setSalesError("");
      setProductsError("");

      void fetchSalesReport(period, controller.signal)
        .then((report) => {
          if (!controller.signal.aborted) {
            setSalesReport(report);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setSalesError(getErrorMessage(error));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSalesLoading(false);
          }
        });

      void fetchProductSalesReport(5, controller.signal)
        .then((report) => {
          if (!controller.signal.aborted) {
            setProductReport(report);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setProductsError(getErrorMessage(error));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setProductsLoading(false);
          }
        });

      return () => controller.abort();
    }, [period, refreshCount]),
  );

  const selectedLabel =
    options.find((option) => option.value === period)?.label ?? "Monthly";

  const refreshReports = () => {
    setOpen(null);
    setRefreshCount((value) => value + 1);
  };

  const handleExport = async () => {
    if (!salesReport) {
      refreshReports();
      return;
    }

    const currentLabels = periodLabels[period];

    const message = [
      "KINESIS REPORT",
      `Period: ${selectedLabel}`,
      `Generated: ${new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
      })}`,
      "",
      "LIFETIME TOTALS",
      `Sales: ${money(salesReport.lifetime.sales)}`,
      `Transactions: ${number(salesReport.lifetime.transactions)}`,
      `Items sold: ${number(salesReport.lifetime.items)}`,
      "",
      currentLabels.current,
      `Sales: ${money(salesReport.current.sales)}`,
      `Transactions: ${number(salesReport.current.transactions)}`,
      `Items sold: ${number(salesReport.current.items)}`,
      "",
      currentLabels.previous,
      `Sales: ${money(salesReport.previous.sales)}`,
      `Transactions: ${number(salesReport.previous.transactions)}`,
      `Items sold: ${number(salesReport.previous.items)}`,
    ].join("\n");

    try {
      await Share.share({
        title: "Kinesis Sales Report",
        message,
      });
    } catch {
      // Dismissing the native share sheet does not affect saved sales.
    }
  };

  const renderPeriodSelector = () => (
    <View className="relative z-20">
      <Pressable
        onPress={() => setOpen(open === "period" ? null : "period")}
        accessibilityRole="button"
        accessibilityLabel={`Selected period: ${selectedLabel}`}
        className="h-11 w-[130px] flex-row items-center justify-between rounded-md border border-ctp-surface0 bg-ctp-mantle px-3"
      >
        <Text className="font-inter-medium text-ctp-text">
          {selectedLabel}
        </Text>

        <Text className="text-ctp-subtext0">▼</Text>
      </Pressable>

      {open === "period" ? (
        <View className="absolute right-0 top-12 z-50 w-[150px] rounded-xl border border-ctp-surface0 bg-ctp-mantle p-1">
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                setPeriod(option.value);
                setOpen(null);
              }}
              className="rounded-lg px-3 py-3"
            >
              <Text className="font-inter-medium text-ctp-text">
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const renderComparisonCard = (
    title: string,
    lifetimeTotal: number,
    current: number,
    previous: number,
    format: (value: number) => string,
  ) => {
    const maxValue = Math.max(current, previous, 1);

    const change =
      previous === 0
        ? current > 0
          ? null
          : 0
        : ((current - previous) / previous) * 100;

    const positive = change === null ? true : change >= 0;
    const labels = periodLabels[period];

    return (
      <View className="gap-3 rounded-md bg-ctp-mantle p-3">
        <View className="flex-row justify-between gap-3">
          <Text className="flex-1 font-inter-semibold text-ctp-text">
            {title}
          </Text>

          <Text className="font-inter-semibold text-ctp-text">
            {format(lifetimeTotal)}
          </Text>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <Text className="w-[90px] text-xs font-inter-medium text-ctp-subtext0">
              {labels.current}
            </Text>

            <View className="h-3 flex-1 overflow-hidden rounded-full bg-ctp-surface0">
              <View
                className="h-3 rounded-full bg-ctp-blue"
                style={{
                  width: `${(current / maxValue) * 100}%`,
                }}
              />
            </View>

            <Text className="w-[75px] text-right text-xs text-ctp-text">
              {format(current)}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Text className="w-[90px] text-xs font-inter-medium text-ctp-subtext0">
              {labels.previous}
            </Text>

            <View className="h-3 flex-1 overflow-hidden rounded-full bg-ctp-surface0">
              <View
                className="h-3 rounded-full bg-ctp-overlay0"
                style={{
                  width: `${(previous / maxValue) * 100}%`,
                }}
              />
            </View>

            <Text className="w-[75px] text-right text-xs text-ctp-text">
              {format(previous)}
            </Text>
          </View>
        </View>

        <View
          className={`self-start rounded-2xl border px-3 py-1 ${positive
              ? "border-ctp-green/50 bg-ctp-green/15"
              : "border-ctp-red/50 bg-ctp-red/15"
            }`}
        >
          <Text
            className={`text-sm font-inter-semibold ${positive ? "text-ctp-green" : "text-ctp-red"
              }`}
          >
            {change === null
              ? "No previous-period baseline"
              : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs previous period`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-8 w-8 items-center justify-center"
          >
            <StyledChevronLeft size={22} className="text-ctp-text" />
          </Pressable>

          <Text className="font-inter-semibold text-lg text-ctp-text">
            Reports
          </Text>

          <Pressable
            onPress={handleExport}
            accessibilityRole="button"
            accessibilityLabel="Export sales report"
            className="h-8 w-8 items-center justify-center"
          >
            <StyledDownload size={22} className="text-ctp-text" />
          </Pressable>
        </View>

        {/* Report tabs */}
        <View className="flex-row justify-center gap-4 rounded-md border border-ctp-surface0 bg-ctp-mantle p-2">
          {(["sale", "product"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                setSelected(tab);
                setOpen(null);
              }}
              className={`flex-1 items-center justify-center rounded-md py-4 ${selected === tab ? "bg-ctp-blue" : "bg-ctp-mantle"
                }`}
            >
              <Text
                className={`font-inter-medium text-base ${selected === tab ? "text-ctp-crust" : "text-ctp-text"
                  }`}
              >
                {tab === "sale" ? "Sale" : "Product"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-1">
          {selected === "sale" ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-4 pt-5 pb-8"
            >
              <View className="rounded-lg bg-ctp-mantle p-3">
                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg text-ctp-text">
                    Sales Report
                  </Text>

                  {renderPeriodSelector()}
                </View>

                {/* Reserved for future sales chart integration. */}
                <View className="items-center justify-center rounded-lg bg-ctp-base py-8">
                  <Text className="font-inter-medium text-base text-ctp-text">
                    GRAPH
                  </Text>
                </View>
              </View>

              {salesLoading ? (
                <View className="rounded-lg bg-ctp-mantle p-4">
                  <Text className="text-sm font-inter-medium text-ctp-subtext0">
                    Loading sales from the database...
                  </Text>
                </View>
              ) : salesError ? (
                <View className="gap-3 rounded-lg border border-ctp-red/40 bg-ctp-red/10 p-4">
                  <Text className="font-inter-medium text-sm text-ctp-red">
                    {salesError}
                  </Text>

                  <Pressable
                    onPress={refreshReports}
                    className="self-start rounded-md bg-ctp-surface0 px-4 py-2"
                  >
                    <Text className="font-inter-semibold text-sm text-ctp-text">
                      Retry
                    </Text>
                  </Pressable>
                </View>
              ) : salesReport ? (
                <>
                  {salesReport.lifetime.transactions === 0 ? (
                    <View className="gap-1 rounded-lg bg-ctp-mantle p-4">
                      <Text className="font-inter-semibold text-base text-ctp-text">
                        No sales recorded yet
                      </Text>
                      <Text className="text-sm leading-5 text-ctp-subtext0">
                        Complete a checkout to save a transaction and populate
                        these reports. Existing product records are not counted
                        as historical sales.
                      </Text>
                    </View>
                  ) : null}

                  {renderComparisonCard(
                    "Total Sales",
                    salesReport.lifetime.sales,
                    salesReport.current.sales,
                    salesReport.previous.sales,
                    money,
                  )}

                  {renderComparisonCard(
                    "Total Transactions",
                    salesReport.lifetime.transactions,
                    salesReport.current.transactions,
                    salesReport.previous.transactions,
                    number,
                  )}

                  {renderComparisonCard(
                    "Total Items Sold",
                    salesReport.lifetime.items,
                    salesReport.current.items,
                    salesReport.previous.items,
                    number,
                  )}
                </>
              ) : null}
            </ScrollView>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-4 pt-5 pb-8"
            >
              <View className="rounded-lg bg-ctp-mantle p-3">
                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg text-ctp-text">
                    Top Categories
                  </Text>

                  <Text className="text-xs font-inter-medium text-ctp-subtext0">
                    All recorded sales
                  </Text>
                </View>

                {/* Reserved for future category chart integration. */}
                <View className="h-52 w-full items-center justify-center rounded-lg bg-ctp-base">
                  <Text className="text-base text-ctp-text">CHART</Text>
                </View>

                {productsLoading ? (
                  <Text className="mt-3 text-sm text-ctp-subtext0">
                    Loading category sales...
                  </Text>
                ) : productsError ? (
                  <View className="mt-3 gap-2">
                    <Text className="text-sm text-ctp-red">
                      {productsError}
                    </Text>

                    <Pressable
                      onPress={refreshReports}
                      className="self-start rounded-md bg-ctp-surface0 px-3 py-2"
                    >
                      <Text className="font-inter-semibold text-sm text-ctp-text">
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                ) : productReport && productReport.categories.length > 0 ? (
                  <View className="mt-3 gap-3">
                    {productReport.categories.slice(0, 5).map((category) => (
                      <View
                        key={category.category}
                        className="flex-row items-center justify-between gap-3"
                      >
                        <View className="flex-1">
                          <Text className="font-inter-medium text-sm text-ctp-text">
                            {category.category}
                          </Text>
                          <Text className="text-xs text-ctp-subtext0">
                            {number(category.units_sold)} pcs sold
                          </Text>
                        </View>

                        <Text className="font-inter-semibold text-sm text-ctp-text">
                          {money(category.revenue)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : productReport ? (
                  <Text className="mt-3 text-sm text-ctp-subtext0">
                    No completed sales to categorize yet.
                  </Text>
                ) : null}
              </View>

              <View className="rounded-lg bg-ctp-mantle p-3">
                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg text-ctp-text">
                    Top Products
                  </Text>

                  <View className="flex-row items-center gap-3">
                    <View className="h-7 w-7 items-center justify-center rounded-md bg-ctp-surface0">
                      <StyledFunnel size={14} className="text-ctp-text" />
                    </View>

                    <Pressable
                      onPress={() => router.push("/product-performance")}
                      className="rounded-md bg-ctp-surface0 px-2 py-2"
                    >
                      <Text className="font-inter-bold text-xs text-ctp-text">
                        View All
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {productsLoading ? (
                  <Text className="py-6 text-center text-sm text-ctp-subtext0">
                    Loading product sales...
                  </Text>
                ) : productsError ? (
                  <View className="gap-3 py-4">
                    <Text className="text-center text-sm text-ctp-red">
                      {productsError}
                    </Text>

                    <Pressable
                      onPress={refreshReports}
                      className="self-center rounded-md bg-ctp-surface0 px-4 py-2"
                    >
                      <Text className="font-inter-semibold text-sm text-ctp-text">
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                ) : productReport && productReport.top_products.length > 0 ? (
                  productReport.top_products.map((product, index) => (
                    <View
                      key={
                        product.product_id ??
                        `${product.category}-${product.name}`
                      }
                      className={`m-2 flex-row rounded-lg border-[1.5px] bg-ctp-base ${index === 0
                          ? "border-ctp-yellow"
                          : index === 1
                            ? "border-ctp-rosewater/60"
                            : index === 2
                              ? "border-ctp-peach/90"
                              : "border-transparent"
                        }`}
                      style={{
                        boxShadow: "0px 0px 8px 2px rgba(0, 0, 0, 0.05)",
                      }}
                    >
                      <View className="m-2 h-20 w-20 items-center justify-center rounded-lg bg-ctp-surface0">
                        <Text className="text-xs font-inter-medium text-ctp-subtext0">
                          #{index + 1}
                        </Text>
                      </View>

                      <View className="mx-1 my-3 flex-1 justify-between">
                        <Text
                          numberOfLines={2}
                          className="font-inter-semibold text-base text-ctp-text"
                        >
                          {product.name}
                        </Text>

                        <Text
                          numberOfLines={1}
                          className="text-xs font-inter-medium text-ctp-subtext0"
                        >
                          {product.category}
                        </Text>
                      </View>

                      <View className="mr-3 my-3 items-end justify-between">
                        <Text className="font-inter-semibold text-sm text-ctp-text">
                          {number(product.units_sold)} pcs
                        </Text>

                        <Text className="text-right text-xs font-inter-medium text-ctp-subtext0">
                          {money(product.revenue)}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : productReport ? (
                  <View className="items-center py-8">
                    <Text className="text-center font-inter-medium text-sm text-ctp-subtext0">
                      No completed product sales yet.
                    </Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
