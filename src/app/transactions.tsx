
import { getStatusPresentation } from "@/lib/saleStatus";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ShoppingCart from "lucide-react-native/icons/shopping-cart";
import LeftArrow from "lucide-react-native/icons/chevron-left";
import RightArrow from "lucide-react-native/icons/chevron-right";
import DoubleLeftArrow from "lucide-react-native/icons/chevrons-left";
import DoubleRightArrow from "lucide-react-native/icons/chevrons-right";

import { styledIcon } from "@/components/StyledIcon";
import { fetchSalesList } from "@/lib/salesApi";
import type { SaleListItem, SalesListResponse } from "@/types/sale";
import { useBackNavigation } from "@/hooks/useBackNavigation";

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

export default function Transactions() {
  // "/dashboard" is only the Up target for a screen opened with no history
  // (deep link / web refresh); normal back pops the real stack.
  const { goBack } = useBackNavigation("/dashboard");

  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    "completed" | "voided" | "refunded" | undefined
  >(undefined);
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
        statusFilter,
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
    }, [currentPage, refreshCount, statusFilter]),
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
  const reversedCount =
    (statusCounts.voided ?? 0) + (statusCounts.refunded ?? 0);

  const firstTransaction =
    totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

  const lastTransaction = Math.min(safePage * PAGE_SIZE, totalCount);

  const renderTransaction = ({ item }: { item: SaleListItem }) => {
    const presentation = getStatusPresentation(item.status);

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/receipt",
            params: { transactionCode: item.transaction_code },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`Open receipt ${item.transaction_code}`}
        className="my-2 min-h-[90px] w-full flex-row items-center rounded-xl bg-ctp-mantle px-3 py-3 active:opacity-70"
      >
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
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={goBack}
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
              Voided / Refunded
            </Text>
            <Text className="mt-1 text-lg font-inter-bold text-ctp-text">
              {response ? reversedCount.toLocaleString("en-PH") : loading ? "…" : "—"}
            </Text>
          </View>
        </View>

        <View className="mb-3 flex-row gap-2">
          {(
            [
              [undefined, "All"],
              ["completed", "Completed"],
              ["voided", "Voided"],
              ["refunded", "Refunded"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={label}
              onPress={() => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: statusFilter === value }}
              className={`rounded-full border px-3 py-1.5 ${
                statusFilter === value
                  ? "border-ctp-blue bg-ctp-blue/10"
                  : "border-ctp-surface1 bg-ctp-base"
              }`}
            >
              <Text className="text-xs font-inter-semibold text-ctp-text">
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && !response ? (
          <LoadingState message="Loading transactions..." />
        ) : error && !response ? (
          <ErrorState
            title="Transactions could not be loaded"
            message={error}
            onRetry={() => setRefreshCount((count) => count + 1)}
          />
        ) : (
          <FlatList
            className="flex-1"
            data={transactions}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderTransaction}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
            ListHeaderComponent={
              error ? (
                <ErrorState
                  title="Could not refresh"
                  message={error}
                  onRetry={() => setRefreshCount((count) => count + 1)}
                />
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                icon={<StyledShoppingCart size={36} className="text-ctp-overlay1" />}
                message={
                  statusFilter
                    ? `No ${statusFilter} transactions.`
                    : "No transactions yet."
                }
              />
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
