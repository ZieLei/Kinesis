import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import dashboardData from '../../data/dashboard-data.json';
import products from '../../data/products.json';

import Package from 'lucide-react-native/icons/package';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import DollarSign from 'lucide-react-native/icons/dollar-sign';
import User from 'lucide-react-native/icons/user';

import { useRouter } from 'expo-router';

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
  Confirmed: 'bg-green-100 text-green-600',
  Pending: 'bg-yellow-100 text-yellow-600',
  Cancelled: 'bg-red-100 text-red-600',
};

export default function Dashboard() {
  const router = useRouter();
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
    <SafeAreaView className="flex-1 bg-[#F5F5F5]">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 py-7"
      >
        <View className="flex-row items-center justify-between">
          <Text
            className="text-2xl text-black"
            style={{ fontFamily: 'FredokaOne' }}
          >
            Kinesis
          </Text>

          <View className="h-10 w-10 items-center justify-center rounded-full bg-black/10">
            <User size={20} color="#000000" />
          </View>
        </View>

        <Text className="py-6 text-lg font-inter-medium">
          Welcome, User!
        </Text>

        <LinearGradient
          colors={['#575757', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 10,
            minHeight: 200,
            paddingHorizontal: 20,
            paddingVertical: 15,
          }}
        >
          <Text className="text-md font-inter text-white/90">
            Today's Sales
          </Text>

          <Text className="my-3 text-2xl tracking-[1px] text-white font-inter-semibold">
            {money(stats.todaySales)}
          </Text>

          <View className="flex-row items-center">
            {stats.todayChange !== null ? (
              <Text
                className={`rounded-full bg-white px-2 py-1 text-xs font-inter-extrabold ${stats.todayChange.startsWith('-')
                  ? 'text-red-600'
                  : 'text-green-600'
                  }`}
              >
                {stats.todayChange}
              </Text>
            ) : (
              <Text className="rounded-full bg-white/15 px-2 py-1 text-xs text-white font-inter-semibold">
                N/A
              </Text>
            )}

            <Text className="ml-2 font-inter text-white/80">
              From the same day last week.
            </Text>
          </View>
        </LinearGradient>

        <View className="flex-row justify-between py-[20px]">
          {statCards.slice(0, 2).map((card) => {
            const Icon = card.icon;

            return (
              <View
                key={card.title}
                className="h-[149px] w-[48%] flex-col rounded-[10px] bg-white px-[15px] py-[15px]"
              >
                <View className="flex-row items-center gap-1.5">
                  <View className="h-8 w-8 items-center justify-center rounded-full">
                    <Icon size={20} color="#000000" />
                  </View>

                  <Text className="text-md font-inter-semibold">
                    {card.title}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between py-5">
                  <Text className="text-xl font-inter-bold">
                    {card.value}
                  </Text>
                </View>

                <View className="-mx-[15px] h-[1px] bg-black/5" />

                <Text className="mt-auto text-xs text-black/30 font-inter-medium">
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
                className="h-[149px] w-[48%] flex-col rounded-[10px] bg-white px-[15px] py-[15px]"
              >
                <View className="flex-row items-center gap-1.5">
                  <View className="h-8 w-8 items-center justify-center rounded-full">
                    <Icon size={20} color="#000000" />
                  </View>

                  <Text className="text-md font-inter-semibold">
                    {card.title}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between py-5">
                  <Text
                    className="text-xl font-inter-bold"
                    numberOfLines={1}
                  >
                    {card.value}
                  </Text>

                  {card.change !== null && (
                    <Text
                      className={`rounded-full px-2 py-1 text-xs font-inter-bold ${card.change.startsWith('-')
                        ? 'bg-red-100 text-red-600'
                        : 'bg-green-200/50 text-green-600'
                        }`}
                    >
                      {card.change}
                    </Text>
                  )}
                </View>

                <View className="-mx-[15px] h-[1px] bg-black/5" />

                <Text className="mt-auto text-xs text-black/30 font-inter-medium">
                  {card.subtitle}
                </Text>
              </View>
            );
          })}
        </View>

        <View className="mt-[20px] min-h-[300px] w-full flex-col rounded-[10px] bg-white px-5 py-4">
          <View className="mb-3 flex-row items-center">
            <Text className="text-lg text-black font-inter-medium">
              Recent Transactions
            </Text>

            <Pressable
              className="ml-auto rounded-md bg-black/10 px-2 py-2"
              onPress={() => {
                router.push('/transactions')
              }}
            >
              <Text
                className="text-xs font-inter-bold"
                selectable={false}
              >
                View All
              </Text>
            </Pressable>
          </View>

          {stats.recentTransactions.length === 0 ? (
            <View className="flex-1 items-center justify-center py-10">
              <Text className="text-sm text-black/40 font-inter-medium">
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
                  <View className="aspect-square rounded-lg bg-black/5 p-3">
                    <ShoppingCart size={24} color="#000000" />
                  </View>

                  <View className="ml-2 flex-1 flex-col gap-2">
                    <Text
                      className="text-base text-black font-inter-bold"
                      numberOfLines={1}
                    >
                      Order #{transaction.id}
                    </Text>

                    <Text className="text-xs text-black/40 font-inter-semibold">
                      {formatTime(date)}
                      {'\n'}
                      {formatDate(date)}
                    </Text>
                  </View>

                  <View className="ml-2 items-end">
                    <Text
                      className="mb-2 text-base font-inter-bold"
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
