
import { useCallback, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";

import { styledIcon } from "@/components/StyledIcon";
import { useDashboardData, LOW_STOCK_THRESHOLD } from "@/hooks/useDashboardData";

import SunIcon from "lucide-react-native/icons/sun";
import MoonIcon from "lucide-react-native/icons/moon";
import PackageIcon from "lucide-react-native/icons/package";
import LayoutGridIcon from "lucide-react-native/icons/layout-grid";
import ShoppingCartIcon from "lucide-react-native/icons/shopping-cart";
import DollarSignIcon from "lucide-react-native/icons/dollar-sign";
import UserIcon from "lucide-react-native/icons/user";

import type { SaleListItem } from "@/types/sale";

const Package = styledIcon(PackageIcon);
const LayoutGrid = styledIcon(LayoutGridIcon);
const ShoppingCart = styledIcon(ShoppingCartIcon);
const DollarSign = styledIcon(DollarSignIcon);
const User = styledIcon(UserIcon);
const Sun = styledIcon(SunIcon);
const Moon = styledIcon(MoonIcon);

const money = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const shortMoney = (amount: number) => {
  if (amount >= 1_000_000) {
    return `₱${(amount / 1_000_000).toFixed(2)}M`;
  }

  if (amount >= 1_000) {
    return `₱${(amount / 1_000).toFixed(2)}K`;
  }

  return money(amount);
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  });

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });

const percentageChange = (
  current: number,
  previous: number,
): string | null => {
  if (previous === 0) {
    return current === 0 ? null : "New";
  }

  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change));

  return `${change >= 0 ? "+" : "-"}${rounded}%`;
};

function getStatusPresentation(status: string) {
  switch (status.toLowerCase()) {
    case "completed":
    case "confirmed":
      return {
        label: status.toLowerCase() === "completed" ? "Completed" : "Confirmed",
        style: "bg-ctp-green/15 text-ctp-green",
      };

    case "pending":
      return {
        label: "Pending",
        style: "bg-ctp-peach/15 text-ctp-peach",
      };

    case "cancelled":
    case "canceled":
      return {
        label: "Cancelled",
        style: "bg-ctp-red/15 text-ctp-red",
      };

    default:
      return {
        label: status.charAt(0).toUpperCase() + status.slice(1),
        style: "bg-ctp-surface0 text-ctp-text",
      };
  }
}

export default function Dashboard() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const { data, loading, error, loadDashboard } = useDashboardData();

  // Reload dashboard data whenever this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();

      void loadDashboard(controller.signal);

      return () => controller.abort();
    }, [loadDashboard]),
  );

  const toggleTheme = () => {
    setColorScheme(isDark ? "light" : "dark");
  };

  const stats = useMemo(() => {
    if (!data) return null;

    const lowStockCount = data.products.filter(
      (product) =>
        product.stock > 0 &&
        product.stock <= LOW_STOCK_THRESHOLD,
    ).length;

    const outOfStockCount = data.products.filter(
      (product) => product.stock === 0,
    ).length;

    const todaySales = data.dailyReport.current.sales;
    const previousDaySales = data.dailyReport.previous.sales;

    const thisWeekItems = data.weeklyReport.current.items;
    const lastWeekItems = data.weeklyReport.previous.items;

    const monthlySales = data.monthlyReport.current.sales;
    const previousMonthlySales = data.monthlyReport.previous.sales;

    return {
      todaySales,
      todayChange: percentageChange(todaySales, previousDaySales),
      lowStockCount,
      outOfStockCount,
      thisWeekItems,
      itemsChange: percentageChange(thisWeekItems, lastWeekItems),
      monthlySales,
      monthlyChange: percentageChange(
        monthlySales,
        previousMonthlySales,
      ),
      recentTransactions: data.recentTransactions.items,
      updatedDate: formatDate(new Date()),
    };
  }, [data]);

  const statCards = [
    {
      title: "Low stock",
      value:
        stats !== null
          ? stats.lowStockCount.toLocaleString("en-PH")
          : loading
            ? "…"
            : "—",
      icon: Package,
      subtitle: `1–${LOW_STOCK_THRESHOLD} units remaining`,
      change: null as string | null,
    },
    {
      title: "Out of stock",
      value:
        stats !== null
          ? stats.outOfStockCount.toLocaleString("en-PH")
          : loading
            ? "…"
            : "—",
      icon: LayoutGrid,
      subtitle: "Products with zero stock",
      change: null as string | null,
    },
    {
      title: "Items sold",
      value:
        stats !== null
          ? stats.thisWeekItems.toLocaleString("en-PH")
          : loading
            ? "…"
            : "—",
      icon: ShoppingCart,
      subtitle: "This week",
      change: stats?.itemsChange ?? null,
    },
    {
      title: "Monthly sales",
      value:
        stats !== null
          ? shortMoney(stats.monthlySales)
          : loading
            ? "Loading..."
            : "—",
      icon: DollarSign,
      subtitle: "Month to date",
      change: stats?.monthlyChange ?? null,
    },
  ];

  const recentTransactions: SaleListItem[] =
    stats?.recentTransactions ?? [];

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 py-7"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <Text
            className="text-2xl text-ctp-text"
            style={{ fontFamily: "FredokaOne" }}
          >
            Kinesis
          </Text>

          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={toggleTheme}
              accessibilityRole="button"
              accessibilityLabel={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              className="h-10 flex-row items-center justify-center gap-2 rounded-full border border-ctp-surface1 bg-ctp-mantle px-3"
            >
              {isDark ? (
                <Sun size={18} className="text-ctp-yellow" />
              ) : (
                <Moon size={18} className="text-ctp-text" />
              )}

              <Text className="text-sm font-inter-semibold text-ctp-text">
                {isDark ? "Light" : "Dark"}
              </Text>
            </Pressable>

            <View className="h-10 w-10 items-center justify-center rounded-full border border-ctp-surface1 bg-ctp-mantle">
              <User size={20} className="text-ctp-text" />
            </View>
          </View>
        </View>

        <View className="flex-row items-center justify-between py-6">
          <Text className="text-lg font-inter-medium text-ctp-text">
            Welcome, User!
          </Text>

          {stats ? (
            <Text className="text-xs font-inter-medium text-ctp-subtext0">
              Updated {stats.updatedDate}
            </Text>
          ) : null}
        </View>

        {error ? (
          <View className="mb-4 gap-3 rounded-lg border border-ctp-red/40 bg-ctp-red/10 p-3">
            <Text className="text-sm leading-5 text-ctp-red">
              Dashboard refresh failed: {error}
            </Text>

            <Pressable
              onPress={() => void loadDashboard()}
              className="self-start rounded-md bg-ctp-surface0 px-3 py-2"
            >
              <Text className="text-sm font-inter-semibold text-ctp-text">
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Today's sales */}
        <View className="relative min-h-[200px] overflow-hidden rounded-[10px]">
          {!isDark ? (
            <LinearGradient
              colors={["#45475A", "#181825"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              }}
            />
          ) : (
            <View
              className="absolute inset-0"
              style={{ backgroundColor: "#dce0e8" }}
            />
          )}

          <View className="px-5 py-[15px]">
            <Text
              className={`text-md font-inter ${isDark ? "text-[#4C4F69]" : "text-white/90"
                }`}
            >
              Today's Sales
            </Text>

            <Text
              className={`my-3 text-2xl tracking-[1px] font-inter-semibold ${isDark ? "text-[#4C4F69]" : "text-white"
                }`}
            >
              {stats ? money(stats.todaySales) : loading ? "Loading..." : "—"}
            </Text>

            <View className="flex-row items-center">
              {stats?.todayChange !== null && stats?.todayChange !== undefined ? (
                <Text
                  className={`rounded-full px-2 py-1 text-xs font-inter-extrabold ${isDark ? "bg-ctp-surface2/30" : "bg-white"
                    } ${stats.todayChange.startsWith("-")
                      ? "text-[#D20F39]"
                      : "text-[#40A02B]"
                    }`}
                >
                  {stats.todayChange}
                </Text>
              ) : (
                <Text
                  className={`rounded-full px-2 py-1 text-xs font-inter-semibold ${isDark
                    ? "bg-[#DCE0E8] text-[#4C4F69]"
                    : "bg-white/15 text-white"
                    }`}
                >
                  N/A
                </Text>
              )}

              <Text
                className={`ml-2 font-inter ${isDark ? "text-[#6C6F85]" : "text-white/80"
                  }`}
              >
                Compared with yesterday.
              </Text>
            </View>
          </View>
        </View>

        {/* Inventory and sales statistic cards */}
        <View className="flex-row justify-between py-[20px]">
          {statCards.slice(0, 2).map((card) => {
            const Icon = card.icon;

            return (
              <View
                key={card.title}
                className={`h-[149px] w-[48%] flex-col rounded-lg px-[15px] py-[15px] ${isDark ? "bg-ctp-surface0" : "bg-white"
                  }`}
              >
                <View className="flex-row items-center gap-1.5">
                  <View className="h-8 w-8 items-center justify-center rounded-full">
                    <Icon size={20} className="text-ctp-text" />
                  </View>

                  <Text className="text-md font-inter-semibold text-ctp-text">
                    {card.title}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between py-5">
                  <Text className="text-xl font-inter-bold text-ctp-text">
                    {card.value}
                  </Text>
                </View>

                <View className="-mx-[15px] h-[1px] bg-ctp-surface2/15" />

                <Text className="mt-auto font-inter-medium text-xs text-ctp-text/50">
                  {card.subtitle}
                </Text>
              </View>
            );
          })}
        </View>

        <View className="flex-row justify-between">
          {statCards.slice(2, 4).map((card) => {
            const Icon = card.icon;

            return (
              <View
                key={card.title}
                className={`h-[149px] w-[48%] flex-col rounded-lg px-[15px] py-[15px] ${isDark ? "bg-ctp-surface0" : "bg-white"
                  }`}
              >
                <View className="flex-row items-center gap-1.5">
                  <View className="h-8 w-8 items-center justify-center rounded-full">
                    <Icon size={20} className="text-ctp-text" />
                  </View>

                  <Text className="text-md font-inter-semibold text-ctp-text">
                    {card.title}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between gap-1 py-5">
                  <Text
                    className="flex-1 text-xl font-inter-bold text-ctp-text"
                    numberOfLines={1}
                  >
                    {card.value}
                  </Text>

                  {card.change !== null ? (
                    <Text
                      className={`rounded-full px-2 py-1 text-xs font-inter-bold ${card.change.startsWith("-")
                        ? "bg-ctp-red/15 text-ctp-red"
                        : "bg-ctp-green/15 text-ctp-green"
                        }`}
                    >
                      {card.change}
                    </Text>
                  ) : null}
                </View>

                <View className="-mx-[15px] h-[1px] bg-ctp-surface2/15" />

                <Text className="mt-auto font-inter-medium text-xs text-ctp-text/50">
                  {card.subtitle}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Recent transactions */}
        <View
          className={`mt-[20px] min-h-[300px] w-full flex-col rounded-[10px] px-5 py-4 ${isDark ? "bg-ctp-surface0" : "bg-white"
            }`}
        >
          <View className="mb-3 flex-row items-center">
            <Text className="text-lg font-inter-medium text-ctp-text">
              Recent Transactions
            </Text>

            <Pressable
              className="ml-auto rounded-md bg-ctp-surface1 px-2 py-2"
              onPress={() => router.push("/transactions")}
            >
              <Text
                className="text-xs font-inter-bold text-ctp-subtext1"
                selectable={false}
              >
                View All
              </Text>
            </Pressable>
          </View>

          {loading && !data ? (
            <View className="flex-1 items-center justify-center py-10">
              <Text className="text-sm font-inter-medium text-ctp-subtext0">
                Loading dashboard data...
              </Text>
            </View>
          ) : !data ? (
            <View className="flex-1 items-center justify-center py-10">
              <Text className="text-center text-sm font-inter-medium text-ctp-subtext0">
                Dashboard data is unavailable. Try refreshing.
              </Text>
            </View>
          ) : recentTransactions.length === 0 ? (
            <View className="flex-1 items-center justify-center py-10">
              <Text className="text-sm font-inter-medium text-ctp-text">
                No transactions available.
              </Text>
            </View>
          ) : (
            recentTransactions.map((transaction) => {
              const date = new Date(transaction.created_at);
              const status = getStatusPresentation(transaction.status);

              return (
                <View
                  key={transaction.id}
                  className="my-2 min-h-[70px] w-full flex-row items-center"
                >
                  <View className="aspect-square rounded-lg bg-ctp-base p-3">
                    <ShoppingCart size={24} className="text-ctp-text" />
                  </View>

                  <View className="ml-2 flex-1 flex-col gap-2">
                    <Text
                      className="text-sm font-inter-bold text-ctp-text"
                      numberOfLines={1}
                    >
                      Order #{transaction.id}
                    </Text>

                    <Text className="text-xs font-inter-semibold text-ctp-text/40">
                      {formatTime(date)}
                      {"\n"}
                      {formatDate(date)}
                    </Text>
                  </View>

                  <View className="ml-2 items-end">
                    <Text
                      className="mb-2 text-sm font-inter-bold text-ctp-text"
                      numberOfLines={1}
                    >
                      {money(transaction.total)}
                    </Text>

                    <Text
                      className={`min-w-[80px] rounded-full px-2 py-1 text-center text-xs font-inter-semibold ${status.style}`}
                    >
                      {status.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
