
import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import products from "@/data/products.json";
import dashboardData from "@/data/dashboard-data.json";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Download from "lucide-react-native/icons/download";
import Funnel from "lucide-react-native/icons/funnel";

const options = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
] as const;

type Period = (typeof options)[number]["value"];

const money = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const number = (value: number) => value.toLocaleString("en-PH");

const confirmedTransactions = dashboardData.transactions.filter(
  (transaction) => transaction.status === "Confirmed"
);

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

export default function Reports() {
  const [selected, setSelected] = useState<"sale" | "product">("sale");
  const [open, setOpen] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");

  const selectedLabel =
    options.find((option) => option.value === period)?.label ?? "Monthly";

  const totals = useMemo(() => {
    return confirmedTransactions.reduce(
      (result, transaction) => {
        result.sales += transaction.total;
        result.transactions += 1;
        result.items += transaction.items.reduce(
          (sum, item) => sum + item.quantity,
          0
        );
        return result;
      },
      { sales: 0, transactions: 0, items: 0 }
    );
  }, []);

  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const thisMonth = monthKey(now);

    const previousDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );
    const lastMonth = monthKey(previousDate);

    const summarize = (key: string) => {
      const monthTransactions = confirmedTransactions.filter(
        (transaction) =>
          monthKey(new Date(transaction.date)) === key
      );

      return {
        sales: monthTransactions.reduce(
          (sum, transaction) => sum + transaction.total,
          0
        ),
        transactions: monthTransactions.length,
        items: monthTransactions.reduce(
          (sum, transaction) =>
            sum +
            transaction.items.reduce(
              (itemSum, item) => itemSum + item.quantity,
              0
            ),
          0
        ),
      };
    };

    return {
      current: summarize(thisMonth),
      previous: summarize(lastMonth),
    };
  }, []);

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5)
      .map((product, index) => ({
        ...product,
        rank: index + 1,
        change:
          index % 2 === 0
            ? "↑0.0" + (index + 1)
            : "↓0.0" + (index + 1),
      }));
  }, []);

  const renderPeriodSelector = () => (
    <View className="relative z-20">
      <Pressable
        onPress={() =>
          setOpen(open === "period" ? null : "period")
        }
        className="h-11 w-[130px] flex-row items-center justify-between rounded-md border border-black/10 bg-white px-3"
      >
        <Text className="font-inter-medium text-black">
          {selectedLabel}
        </Text>
        <Text className="text-black">▼</Text>
      </Pressable>

      {open === "period" && (
        <View className="absolute right-0 top-12 z-50 w-[150px] rounded-xl border border-black/10 bg-white p-1">
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                setPeriod(option.value);
                setOpen(null);
              }}
              className="rounded-lg px-3 py-3"
            >
              <Text className="font-inter-medium text-black">
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const renderComparisonCard = (
    title: string,
    total: number,
    current: number,
    previous: number,
    format: (value: number) => string
  ) => {
    const maxValue = Math.max(current, previous, 1);

    const change =
      previous === 0
        ? current > 0
          ? null
          : 0
        : ((current - previous) / previous) * 100;

    const positive = change === null ? current > 0 : change >= 0;

    return (
      <View className="gap-3 rounded-md bg-white p-3">
        <View className="flex-row justify-between gap-3">
          <Text className="flex-1 font-inter-semibold">
            {title}
          </Text>

          <Text className="font-inter-semibold">
            {format(total)}
          </Text>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <Text className="w-[90px] text-xs font-inter-medium">
              This Month
            </Text>

            <View className="h-3 flex-1 overflow-hidden rounded-full bg-black/10">
              <View
                className="h-3 rounded-full bg-black/80"
                style={{
                  width: `${(current / maxValue) * 100}%`,
                }}
              />
            </View>

            <Text className="w-[75px] text-right text-xs">
              {format(current)}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Text className="w-[90px] text-xs font-inter-medium">
              Last Month
            </Text>

            <View className="h-3 flex-1 overflow-hidden rounded-full bg-black/10">
              <View
                className="h-3 rounded-full bg-black/40"
                style={{
                  width: `${(previous / maxValue) * 100}%`,
                }}
              />
            </View>

            <Text className="w-[75px] text-right text-xs">
              {format(previous)}
            </Text>
          </View>
        </View>

        <View
          className={`self-start rounded-2xl border px-3 py-1 ${positive
            ? "border-green-500 bg-green-100"
            : "border-red-500 bg-red-100"
            }`}
        >
          <Text
            className={`text-sm font-inter-semibold ${positive ? "text-green-700" : "text-red-700"
              }`}
          >
            {change === null
              ? "No previous-month baseline"
              : `${change >= 0 ? "+" : ""}${change.toFixed(
                1
              )}% vs last month`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F5]">
      <View className="flex-1 px-5 pt-7">
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-8 w-8 items-center justify-center"
          >
            <ChevronLeft size={22} color="#000000" />
          </Pressable>

          <Text className="font-inter-semibold text-lg">
            Reports
          </Text>

          <Pressable
            onPress={() => setOpen(null)}
            className="h-8 w-8 items-center justify-center"
            accessibilityLabel="Report options"
          >
            <Download size={22} color="#000000" />
          </Pressable>
        </View>

        <View className="flex-row justify-center gap-4 rounded-md border border-black/5 bg-white p-2">
          {(["sale", "product"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                setSelected(tab);
                setOpen(null);
              }}
              className={`flex-1 items-center justify-center rounded-md py-4 ${selected === tab ? "bg-blue-700" : "bg-white"
                }`}
            >
              <Text
                className={`font-inter-medium text-base ${selected === tab ? "text-white" : "text-black"
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
              <View className="rounded-lg bg-white p-3">
                <View className="flex-row items-center justify-between pb-2">
                  <View>
                    <Text className="font-inter-semibold text-lg">
                      Sales Report
                    </Text>
                  </View>

                  {renderPeriodSelector()}
                </View>

                <View className="items-center justify-center rounded-lg bg-gray-50 py-8">
                  <Text className="font-inter-medium text-base text-black">
                    GRAPH
                  </Text>
                </View>
              </View>

              {renderComparisonCard(
                "Total Sales",
                totals.sales,
                monthlyComparison.current.sales,
                monthlyComparison.previous.sales,
                money
              )}

              {renderComparisonCard(
                "Total Transactions",
                totals.transactions,
                monthlyComparison.current.transactions,
                monthlyComparison.previous.transactions,
                number
              )}

              {renderComparisonCard(
                "Total Items Sold",
                totals.items,
                monthlyComparison.current.items,
                monthlyComparison.previous.items,
                number
              )}

            </ScrollView>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-4 pt-5 pb-8"
            >
              <View className="rounded-lg bg-white p-3">
                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg">
                    Top Categories
                  </Text>

                  {renderPeriodSelector()}
                </View>

                <View className="h-52 w-full items-center justify-center rounded-lg bg-gray-100">
                  <Text className="text-base text-black">
                    CHART
                  </Text>
                </View>
              </View>

              <View className="rounded-lg bg-white p-3">
                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg">
                    Top Products
                  </Text>

                  <View className="flex-row items-center gap-3">
                    <View className="h-7 w-7 items-center justify-center rounded-md bg-black/10">
                      <Funnel size={14} color="#000000" />
                    </View>

                    <Pressable
                      onPress={() => router.push('/product-performance')}
                      className="rounded-md bg-black/10 px-2 py-2">
                      <Text className="text-xs font-inter-bold">
                        View All
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {topProducts.map((product) => (
                  <View
                    key={product.rank}
                    className={`m-2 flex-row rounded-lg bg-white ${product.rank === 1
                      ? "border-yellow-400"
                      : product.rank === 2
                        ? "border-gray-400"
                        : product.rank === 3
                          ? "border-amber-700"
                          : "border-transparent"
                      } ${product.rank <= 3 ? "border-b-4" : ""}`}
                    style={{
                      boxShadow:
                        "0px 0px 8px 2px rgba(0, 0, 0, 0.05)",
                    }}
                  >
                    <View className="m-2 h-20 w-20 rounded-lg bg-black/15" />

                    <View className="my-3 mx-1 flex-1 justify-between">
                      <Text className="font-inter-semibold text-md">
                        {product.name}
                      </Text>

                      <Text className="font-inter-semibold text-sm text-black/50">
                        {money(product.price)}
                      </Text>
                    </View>

                    <View className="my-3 mr-3 items-end justify-between">
                      <Text className="font-inter-semibold">
                        {number(product.sold)} pcs
                      </Text>

                      <Text
                        className={`font-inter-semibold ${product.change.startsWith("↑")
                          ? "text-green-500"
                          : "text-red-500"
                          }`}
                      >
                        {product.change}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
