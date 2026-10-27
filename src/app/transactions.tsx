
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ShoppingCart from "lucide-react-native/icons/shopping-cart";
import LeftArrow from "lucide-react-native/icons/chevron-left";
import RightArrow from "lucide-react-native/icons/chevron-right";
import DoubleLeftArrow from "lucide-react-native/icons/chevrons-left";
import DoubleRightArrow from "lucide-react-native/icons/chevrons-right";

import { styledIcon } from "@/components/StyledIcon";
import { fetchSalesList } from "@/lib/salesApi";
import type { SaleListItem, SalesListResponse } from "@/types/sale";

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledShoppingCart = styledIcon(ShoppingCart);
const StyledLeftArrow = styledIcon(LeftArrow);
const StyledRightArrow = styledIcon(RightArrow);
const StyledDoubleLeftArrow = styledIcon(DoubleLeftArrow);
const StyledDoubleRightArrow = styledIcon(DoubleRightArrow);

const PAGE_SIZE = 10;

const money = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });

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
        style: "bg-ctp-yellow/15 text-ctp-yellow",
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

export default function Transactions() {
  const router = useRouter();

  const [currentPage, setCurrentPage] = useState(1);
  const [refreshCount, setRefreshCount] = useState(0);
  const [response, setResponse] = useState<SalesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();

      setLoading(true);
      setError("");

      void fetchSalesList(
        PAGE_SIZE,
        (currentPage - 1) * PAGE_SIZE,
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;

          setResponse(result);

          const availablePages = Math.max(
            1,
            Math.ceil(result.count / PAGE_SIZE),
          );

          setCurrentPage((page) => Math.min(page, availablePages));
        })
        .catch((requestError: unknown) => {
          if (controller.signal.aborted) return;

          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load transactions.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });

      return () => controller.abort();
    }, [currentPage, refreshCount]),
  );

  const transactions = response?.items ?? [];
  const totalCount = response?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageNumbers = useMemo(() => {
    const visibleCount = Math.min(4, totalPages);
    const startPage = Math.max(
      1,
      Math.min(currentPage - 1, totalPages - visibleCount + 1),
    );

    return Array.from(
      { length: visibleCount },
      (_, index) => startPage + index,
    );
  }, [currentPage, totalPages]);

  const statusCounts = response?.statuses ?? {};
  const completedCount = statusCounts.completed ?? statusCounts.confirmed ?? 0;
  const pendingCount = statusCounts.pending ?? 0;

  const firstTransaction =
    totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

  const lastTransaction = Math.min(safePage * PAGE_SIZE, totalCount);

  const renderTransaction = ({ item }: { item: SaleListItem }) => {
    const presentation = getStatusPresentation(item.status);

    return (
      <View className="my-2 min-h-[90px] w-full flex-row items-center rounded-xl bg-ctp-mantle px-3 py-3">
        <View className="aspect-square rounded-lg bg-ctp-surface0 p-3">
          <StyledShoppingCart size={24} className="text-ctp-subtext0" />
        </View>

        <View className="ml-3 flex-1 justify-center gap-1">
          <Text
            className="text-sm font-inter-bold text-ctp-text"
            numberOfLines={1}
          >
            Order #{item.id}
          </Text>

          <Text
            className="text-xs font-inter-semibold text-ctp-subtext0"
            numberOfLines={1}
          >
            {item.transaction_code}
          </Text>

          <Text className="text-xs font-inter-semibold text-ctp-subtext0">
            {formatDate(item.created_at)}
          </Text>

          <Text className="text-xs font-inter-semibold text-ctp-subtext0">
            {formatTime(item.created_at)} · {item.item_count}{" "}
            {item.item_count === 1 ? "item" : "items"}
          </Text>
        </View>

        <View className="ml-2 items-end">
          <Text className="mb-2 text-sm font-inter-bold text-ctp-text">
            {money(item.total)}
          </Text>

          <Text
            className={`min-w-[85px] rounded-full px-2 py-1 text-center text-xs font-inter-bold ${presentation.style}`}
          >
            {presentation.label}
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
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-8 w-8 items-center justify-center"
          >
            <StyledChevronLeft size={20} className="text-ctp-text" />
          </Pressable>

          <Text className="text-lg font-inter-semibold text-ctp-text">
            Transactions
          </Text>

          <View className="h-8 w-8" />
        </View>

        <View className="mb-4 flex-row gap-3">
          <View className="flex-1 items-center rounded-xl bg-ctp-mantle p-2">
            <Text className="text-xs font-inter-medium text-ctp-subtext0">
              Total
            </Text>
            <Text className="mt-1 text-lg font-inter-bold text-ctp-text">
              {response ? totalCount.toLocaleString("en-PH") : loading ? "…" : "—"}
            </Text>
          </View>

          <View className="flex-1 items-center rounded-xl bg-ctp-mantle p-2">
            <Text className="text-xs font-inter-medium text-ctp-subtext0">
              Completed
            </Text>
            <Text className="mt-1 text-lg font-inter-bold text-ctp-text">
              {response ? completedCount.toLocaleString("en-PH") : loading ? "…" : "—"}
            </Text>
          </View>

          <View className="flex-1 items-center rounded-xl bg-ctp-mantle p-2">
            <Text className="text-xs font-inter-medium text-ctp-subtext0">
              Pending
            </Text>
            <Text className="mt-1 text-lg font-inter-bold text-ctp-text">
              {response ? pendingCount.toLocaleString("en-PH") : loading ? "…" : "—"}
            </Text>
          </View>
        </View>

        {error ? (
          <View className="mb-3 gap-2 rounded-lg border border-ctp-red/40 bg-ctp-red/10 p-3">
            <Text className="text-sm leading-5 text-ctp-red">{error}</Text>

            <Pressable
              onPress={() => setRefreshCount((count) => count + 1)}
              className="self-start rounded-md bg-ctp-surface0 px-3 py-2"
            >
              <Text className="text-sm font-inter-semibold text-ctp-text">
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        {loading && !response ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#89B4FA" />
            <Text className="text-sm font-inter-medium text-ctp-subtext0">
              Loading transactions...
            </Text>
          </View>
        ) : (
          <FlatList
            className="flex-1"
            data={transactions}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderTransaction}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-10">
                <StyledShoppingCart size={36} className="text-ctp-overlay1" />
                <Text className="mt-3 text-sm font-inter-medium text-ctp-subtext0">
                  {error
                    ? "Transactions could not be loaded."
                    : "No transactions available."}
                </Text>
              </View>
            }
          />
        )}

        {totalCount > 0 ? (
          <>
            <View className="flex-row items-center justify-center border-t border-ctp-surface0 py-3">
              <Text className="text-xs font-inter-medium text-ctp-subtext0">
                Showing {firstTransaction}–{lastTransaction} of {totalCount}
              </Text>
            </View>

            <View className="flex-row items-center justify-center gap-2.5 pb-5">
              <Pressable
                onPress={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className={`rounded-lg px-3 py-2.5 ${safePage === 1 ? "bg-ctp-surface0/50" : "bg-ctp-mantle"
                  }`}
              >
                <StyledDoubleLeftArrow
                  size={20}
                  className={safePage === 1 ? "text-ctp-overlay1" : "text-ctp-text"}
                />
              </Pressable>

              <Pressable
                onPress={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safePage === 1}
                className={`rounded-lg px-3 py-2.5 ${safePage === 1 ? "bg-ctp-surface0/50" : "bg-ctp-mantle"
                  }`}
              >
                <StyledLeftArrow
                  size={20}
                  className={safePage === 1 ? "text-ctp-overlay1" : "text-ctp-text"}
                />
              </Pressable>

              {pageNumbers.map((page) => (
                <Pressable
                  key={page}
                  onPress={() => setCurrentPage(page)}
                  className={`h-10 min-w-10 items-center justify-center rounded-lg px-2 ${safePage === page ? "bg-ctp-blue" : "bg-ctp-mantle"
                    }`}
                >
                  <Text
                    className={`text-base font-inter-bold ${safePage === page ? "text-ctp-crust" : "text-ctp-subtext0"
                      }`}
                  >
                    {page}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safePage >= totalPages}
                className={`rounded-lg px-3 py-2.5 ${safePage >= totalPages
                    ? "bg-ctp-surface0/50"
                    : "bg-ctp-mantle"
                  }`}
              >
                <StyledRightArrow
                  size={20}
                  className={safePage >= totalPages ? "text-ctp-overlay1" : "text-ctp-text"}
                />
              </Pressable>

              <Pressable
                onPress={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className={`rounded-lg px-3 py-2.5 ${safePage === totalPages
                    ? "bg-ctp-surface0/50"
                    : "bg-ctp-mantle"
                  }`}
              >
                <StyledDoubleRightArrow
                  size={20}
                  className={safePage === totalPages ? "text-ctp-overlay1" : "text-ctp-text"}
                />
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
