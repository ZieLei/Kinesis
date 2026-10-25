import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Pressable,
  Text,
  FlatList,
} from 'react-native';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import LeftArrow from 'lucide-react-native/icons/chevron-left';
import RightArrow from 'lucide-react-native/icons/chevron-right';
import DoubleLeftArrow from 'lucide-react-native/icons/chevrons-left';
import DoubleRightArrow from 'lucide-react-native/icons/chevrons-right';

import { styledIcon } from '@/components/StyledIcon';
import dashboardData from '../data/dashboard-data.json';

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledShoppingCart = styledIcon(ShoppingCart);
const StyledLeftArrow = styledIcon(LeftArrow);
const StyledRightArrow = styledIcon(RightArrow);
const StyledDoubleLeftArrow = styledIcon(DoubleLeftArrow);
const StyledDoubleRightArrow = styledIcon(DoubleRightArrow);

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

const PAGE_SIZE = 10;

const statusStyles: Record<Transaction['status'], string> = {
  Confirmed: 'bg-ctp-green/15 text-ctp-green',
  Pending: 'bg-ctp-yellow/15 text-ctp-yellow',
  Cancelled: 'bg-ctp-red/15 text-ctp-red',
};

const money = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(amount);

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const formatTime = (date: Date) =>
  date.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

export default function Transactions() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);

  const transactions = dashboardData.transactions as Transaction[];

  const stats = useMemo(() => {
    const recentTransactions = [...transactions].sort(
      (a, b) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime(),
    );

    return {
      recentTransactions,
      totalTransactions: transactions.length,
      confirmedTransactions: transactions.filter(
        (transaction) => transaction.status === 'Confirmed',
      ).length,
      pendingTransactions: transactions.filter(
        (transaction) => transaction.status === 'Pending',
      ).length,
      cancelledTransactions: transactions.filter(
        (transaction) => transaction.status === 'Cancelled',
      ).length,
    };
  }, [transactions]);

  const totalPages = Math.ceil(
    stats.totalTransactions / PAGE_SIZE,
  );

  const pageNumbers = Array.from(
    { length: Math.min(4, totalPages) },
    (_, i) => {
      const startPage = Math.max(
        1,
        Math.min(currentPage - 1, totalPages - 3),
      );

      return startPage + i;
    },
  );

  const startIndex = (currentPage - 1) * PAGE_SIZE;

  const paginatedTransactions = stats.recentTransactions.slice(
    startIndex,
    startIndex + PAGE_SIZE,
  );

  const firstTransaction =
    stats.totalTransactions === 0 ? 0 : startIndex + 1;

  const lastTransaction = Math.min(
    startIndex + PAGE_SIZE,
    stats.totalTransactions,
  );

  const renderTransaction = ({
    item: transaction,
  }: {
    item: Transaction;
  }) => {
    const date = new Date(transaction.date);

    return (
      <View className="my-2 h-[90px] w-full flex-row items-center rounded-xl bg-ctp-mantle px-3">
        <View className="aspect-square rounded-lg bg-ctp-surface0 p-3">
          <StyledShoppingCart
            size={24}
            className="text-ctp-subtext0"
          />
        </View>

        <View className="ml-3 flex-1 justify-center gap-1">
          <Text
            className="text-base font-inter-bold text-ctp-text"
            numberOfLines={1}
          >
            Order #{transaction.id}
          </Text>

          <Text className="text-xs font-inter-semibold text-ctp-subtext0">
            {formatDate(date)}
          </Text>

          <Text className="text-xs font-inter-semibold text-ctp-subtext0">
            {formatTime(date)}
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
            className={`w-[85px] rounded-full py-1 text-center text-xs font-inter-bold ${statusStyles[transaction.status]
              }`}
          >
            {transaction.status}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-5 w-5 items-center justify-center"
          >
            <StyledChevronLeft
              size={20}
              className="text-ctp-text"
            />
          </Pressable>

          <Text className="text-lg font-inter-semibold text-ctp-text">
            Transactions
          </Text>

          <View className="h-5 w-5" />
        </View>

        <View className="mb-4 flex-row gap-4">
          <View className="flex-1 items-center rounded-xl bg-ctp-mantle p-2">
            <Text className="text-xs font-inter-medium text-ctp-subtext0">
              Total
            </Text>
            <Text className="mt-1 text-lg font-inter-bold text-ctp-text">
              {stats.totalTransactions}
            </Text>
          </View>

          <View className="flex-1 items-center rounded-xl bg-ctp-mantle p-2">
            <Text className="text-xs font-inter-medium text-ctp-subtext0">
              Confirmed
            </Text>
            <Text className="mt-1 text-lg font-inter-bold text-ctp-text">
              {stats.confirmedTransactions}
            </Text>
          </View>

          <View className="flex-1 items-center rounded-xl bg-ctp-mantle p-2">
            <Text className="text-xs font-inter-medium text-ctp-subtext0">
              Pending
            </Text>
            <Text className="mt-1 text-lg font-inter-bold text-ctp-text">
              {stats.pendingTransactions}
            </Text>
          </View>
        </View>

        {/* Paginated transaction list */}
        <FlatList
          className="flex-1"
          data={paginatedTransactions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTransaction}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-10">
              <StyledShoppingCart
                size={36}
                className="text-ctp-overlay1"
              />

              <Text className="mt-3 text-sm font-inter-medium text-ctp-subtext0">
                No transactions available.
              </Text>
            </View>
          }
        />

        {stats.totalTransactions > 0 && (
          <View className="flex-row items-center justify-center border-t border-ctp-surface0 py-4 pb-7">
            <View className="w-full flex-row items-center justify-center gap-2.5">
              <Pressable
                onPress={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className={`rounded-lg px-3 py-2.5 ${currentPage === 1
                    ? 'bg-ctp-surface0/50'
                    : 'bg-ctp-mantle'
                  }`}
              >
                <StyledDoubleLeftArrow
                  size={20}
                  className={
                    currentPage === 1
                      ? 'text-ctp-overlay1'
                      : 'text-ctp-text'
                  }
                />
              </Pressable>

              <Pressable
                onPress={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
                disabled={currentPage === 1}
                className={`rounded-lg px-3 py-2.5 ${currentPage === 1
                    ? 'bg-ctp-surface0/50'
                    : 'bg-ctp-mantle'
                  }`}
              >
                <StyledLeftArrow
                  size={20}
                  className={
                    currentPage === 1
                      ? 'text-ctp-overlay1'
                      : 'text-ctp-text'
                  }
                />
              </Pressable>

              {pageNumbers.map((page) => (
                <Pressable
                  key={page}
                  onPress={() => setCurrentPage(page)}
                  className={`h-10 min-w-10 items-center justify-center rounded-lg px-2 ${currentPage === page
                      ? 'bg-ctp-blue'
                      : 'bg-ctp-mantle'
                    }`}
                >
                  <Text
                    className={`text-base font-inter-bold ${currentPage === page
                        ? 'text-ctp-crust'
                        : 'text-ctp-subtext0'
                      }`}
                  >
                    {page}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() =>
                  setCurrentPage((page) =>
                    Math.min(totalPages, page + 1),
                  )
                }
                disabled={currentPage >= totalPages}
                className={`rounded-lg px-3 py-2.5 ${currentPage >= totalPages
                    ? 'bg-ctp-surface0/50'
                    : 'bg-ctp-mantle'
                  }`}
              >
                <StyledRightArrow
                  size={20}
                  className={
                    currentPage >= totalPages
                      ? 'text-ctp-overlay1'
                      : 'text-ctp-text'
                  }
                />
              </Pressable>

              <Pressable
                onPress={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`rounded-lg px-3 py-2.5 ${currentPage === totalPages
                    ? 'bg-ctp-surface0/50'
                    : 'bg-ctp-mantle'
                  }`}
              >
                <StyledDoubleRightArrow
                  size={20}
                  className={
                    currentPage === totalPages
                      ? 'text-ctp-overlay1'
                      : 'text-ctp-text'
                  }
                />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
