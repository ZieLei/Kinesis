import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import dashboardData from '../../data/dashboard-data.json';
import products from '../../data/products.json';
import { styledIcon } from '@/components/StyledIcon'

import { useColorScheme } from "nativewind";
import SunIcon from "lucide-react-native/icons/sun";
import MoonIcon from "lucide-react-native/icons/moon";

import PackageIcon from "lucide-react-native/icons/package";
import LayoutGridIcon from "lucide-react-native/icons/layout-grid";
import ShoppingCartIcon from "lucide-react-native/icons/shopping-cart";
import DollarSignIcon from "lucide-react-native/icons/dollar-sign";
import UserIcon from "lucide-react-native/icons/user";

import { useRouter } from 'expo-router';

const Package = styledIcon(PackageIcon);
const LayoutGrid = styledIcon(LayoutGridIcon);
const ShoppingCart = styledIcon(ShoppingCartIcon);
const DollarSign = styledIcon(DollarSignIcon);
const User = styledIcon(UserIcon);
const Sun = styledIcon(SunIcon);
const Moon = styledIcon(MoonIcon);

type Transaction = {
  id: number;
  date: string;
  status: 'Confirmed' | 'Pending' | 'Cancelled';
  total: number;
  items: {
    productId: number;
    name: string;
    quantity: number;
    price: number;
  }[];
};

const transactions = dashboardData.transactions as Transaction[];

const money = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const shortMoney = (amount: number) => {
  if (amount >= 1000000) {
    return `₱${(amount / 1000000).toFixed(2)}M`;
  }

  if (amount >= 1000) {
    return `₱${(amount / 1000).toFixed(2)}K`;
  }

  return money(amount);
};

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-PH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const formatTime = (date: Date) =>
  date.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });

const startOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const startOfWeek = (date: Date) => {
  const result = startOfDay(date);
  const day = result.getDay();

  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));

  return result;
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const sumSales = (start: Date, end: Date) =>
  transactions.reduce((sum, transaction) => {
    const date = new Date(transaction.date);

    if (
      transaction.status !== 'Confirmed' ||
      date < start ||
      date >= end
    ) {
      return sum;
    }

    return sum + transaction.total;
  }, 0);

const sumItemsSold = (start: Date, end: Date) =>
  transactions.reduce((sum, transaction) => {
    const date = new Date(transaction.date);

    if (
      transaction.status !== 'Confirmed' ||
      date < start ||
      date >= end
    ) {
      return sum;
    }

    return (
      sum +
      transaction.items.reduce(
        (itemSum, item) => itemSum + item.quantity,
        0,
      )
    );
  }, 0);

const percentageChange = (
  current: number,
  previous: number,
): string | null => {
  if (previous === 0) {
    if (current === 0) return null;
    return '+100%';
  }

  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change));

  return `${change >= 0 ? '+' : '-'}${rounded}%`;
};

const statusStyles = {
  Confirmed: 'bg-ctp-green/15 text-ctp-green',
  Pending: 'bg-ctp-peach/15 text-ctp-peach',
  Cancelled: 'bg-ctp-red/15 text-ctp-red',
};

export default function Dashboard() {
  const router = useRouter();
  const { colorScheme, setColorScheme } = useColorScheme();

  const isDark = colorScheme === "dark";

  const toggleTheme = () => {
    setColorScheme(isDark ? "light" : "dark");
  };
  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaySales = sumSales(today, tomorrow);

    const previousWeekSameDay = new Date(today);
    previousWeekSameDay.setDate(
      previousWeekSameDay.getDate() - 7,
    );

    const previousWeekSameDayEnd = new Date(
      previousWeekSameDay,
    );
    previousWeekSameDayEnd.setDate(
      previousWeekSameDayEnd.getDate() + 1,
    );

    const previousDaySales = sumSales(
      previousWeekSameDay,
      previousWeekSameDayEnd,
    );

    const weekStart = startOfWeek(now);

    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const previousWeekEnd = new Date(previousWeekStart);
    previousWeekEnd.setDate(
      previousWeekEnd.getDate() + (now.getDay() === 0 ? 7 : now.getDay() - 1),
    );

    const elapsed = now.getTime() - weekStart.getTime();

    const comparablePreviousWeekEnd = new Date(
      previousWeekStart.getTime() + elapsed,
    );

    const thisWeekSales = sumSales(weekStart, now);
    const lastWeekSales = sumSales(
      previousWeekStart,
      comparablePreviousWeekEnd,
    );

    const thisWeekItems = sumItemsSold(weekStart, now);
    const lastWeekItems = sumItemsSold(
      previousWeekStart,
      comparablePreviousWeekEnd,
    );

    const monthStart = startOfMonth(now);

    const nextMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    );

    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const elapsedMonth = now.getTime() - monthStart.getTime();

    const comparablePreviousMonthEnd = new Date(
      previousMonthStart.getTime() + elapsedMonth,
    );

    const monthlySales = sumSales(monthStart, nextMonthStart);
    const previousMonthlySales = sumSales(
      previousMonthStart,
      comparablePreviousMonthEnd,
    );

    const uniqueCategories = new Set(
      products
        .map((product) => product.category)
        .filter(Boolean),
    );

    const recentTransactions = [...transactions]
      .sort(
        (a, b) =>
          new Date(b.date).getTime() -
          new Date(a.date).getTime(),
      )
      .slice(0, 5);

    return {
      todaySales,
      todayChange: percentageChange(
        todaySales,
        previousDaySales,
      ),
      productsCount: products.length,
      categoriesCount: uniqueCategories.size,
      thisWeekItems,
      itemsChange: percentageChange(
        thisWeekItems,
        lastWeekItems,
      ),
      monthlySales,
      monthlyChange: percentageChange(
        monthlySales,
        previousMonthlySales,
      ),
      thisWeekSales,
      lastWeekSales,
      recentTransactions,
      updatedDate: formatDate(now),
    };
  }, []);

  // TODO: Change Products and Categories cards to Low stock and no stock indicator cards
  const statCards = [
    {
      title: 'Products',
      value: stats.productsCount.toLocaleString('en-PH'),
      icon: Package,
      subtitle: 'In inventory',
      change: null,
    },
    {
      title: 'Categories',
      value: stats.categoriesCount.toString(),
      icon: LayoutGrid,
      subtitle: 'Available categories',
      change: null,
    },
    {
      title: 'Items sold',
      value: stats.thisWeekItems.toLocaleString('en-PH'),
      icon: ShoppingCart,
      subtitle: 'This week',
      change: stats.itemsChange,
    },
    {
      title: 'Monthly sales',
      value: shortMoney(stats.monthlySales),
      icon: DollarSign,
      subtitle: 'Month to date',
      change: stats.monthlyChange,
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 py-7"
      >
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
        <Text className="py-6 text-lg font-inter-medium text-ctp-text">
          Welcome, User!
        </Text>
        {/* TODO: Change colors here because the catpuccin colors cant be used in style sheets and the text cant be changed becaue color changes depending on the mode*/}
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
              {money(stats.todaySales)}
            </Text>

            <View className="flex-row items-center">
              {stats.todayChange !== null ? (
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
                From the same day last week.
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row justify-between py-[20px]">
          {statCards.slice(0, 2).map((card) => {
            const Icon = card.icon;

            return (
              <View
                key={card.title}
                className={`h-[149px] w-[48%] flex-col rounded-lg px-[15px] py-[15px] ${isDark ? "bg-ctp-surface0" : "bg-white"} `}
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

                <Text className="mt-auto text-xs text-ctp-text/50 font-inter-medium">
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
                className={`h-[149px] w-[48%] flex-col rounded-lg px-[15px] py-[15px] ${isDark ? "bg-ctp-surface0" : "bg-white"} `}
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
                  <Text
                    className="text-xl font-inter-bold text-ctp-text"
                    numberOfLines={1}
                  >
                    {card.value}
                  </Text>

                  {card.change !== null && (
                    <Text
                      className={`rounded-full px-2 py-1 text-xs font-inter-bold ${card.change.startsWith('-')
                        ? 'bg-ctp-red/15 text-ctp-red'
                        : 'bg-ctp-green/15 text-ctp-green'
                        }`}
                    >
                      {card.change}
                    </Text>
                  )}
                </View>

                <View className="-mx-[15px] h-[1px] bg-ctp-surface2/15" />

                <Text className="mt-auto text-xs text-ctp-text/50 font-inter-medium">
                  {card.subtitle}
                </Text>
              </View>
            );
          })}
        </View>

        <View className={`mt-[20px] min-h-[300px] w-full flex-col rounded-[10px] px-5 py-4 ${isDark ? "bg-ctp-surface0" : "bg-white"}`}>
          <View className="mb-3 flex-row items-center">
            <Text className="text-lg text-ctp-text font-inter-medium">
              Recent Transactions
            </Text>

            <Pressable
              className="ml-auto rounded-md bg-ctp-surface1 px-2 py-2"
              onPress={() => {
                router.push('/transactions')
              }}
            >
              <Text
                className="text-xs font-inter-bold text-ctp-subtext1"
                selectable={false}
              >
                View All
              </Text>
            </Pressable>
          </View>

          {stats.recentTransactions.length === 0 ? (
            <View className="flex-1 items-center justify-center py-10">
              <Text className="text-sm text-ctp-text font-inter-medium">
                No transactions available.
              </Text>
            </View>
          ) : (
            stats.recentTransactions.map((transaction) => {
              const date = new Date(transaction.date);

              return (
                <View
                  key={transaction.id}
                  className="my-2 h-[70px] w-full flex-row items-center"
                >
                  <View className="aspect-square rounded-lg bg-ctp-base p-3">
                    <ShoppingCart size={24} className="text-ctp-text" />
                  </View>

                  <View className="ml-2 flex-1 flex-col gap-2">
                    <Text
                      className="text-base text-ctp-text font-inter-bold"
                      numberOfLines={1}
                    >
                      Order #{transaction.id}
                    </Text>

                    <Text className="text-xs text-ctp-text/40 font-inter-semibold">
                      {formatTime(date)}
                      {'\n'}
                      {formatDate(date)}
                    </Text>
                  </View>

                  <View className="ml-2 items-end">
                    <Text
                      className="mb-2 text-base font-inter-bold text-ctp-text"
                      numberOfLines={1}
                    >
                      {money(transaction.total)}
                    </Text>

                    <Text
                      className={`w-[80px] rounded-full py-1 text-center text-sm font-inter-semibold ${statusStyles[transaction.status]
                        }`}
                    >
                      {transaction.status}
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
