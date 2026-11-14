
import { useScrollToTop } from "@/hooks/useScrollToTop";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
} from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import FilterModal, {
  type FilterSection,
  type FilterValues,
} from "@/components/modals/FilterModal";

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronsLeft from "lucide-react-native/icons/chevrons-left";
import ChevronsRight from "lucide-react-native/icons/chevrons-right";
import Search from "lucide-react-native/icons/search";
import Funnel from "lucide-react-native/icons/funnel";

import { styledIcon } from "@/components/StyledIcon";
import ProductThumbnail from "@/components/reports/ProductThumbnail";
import { useColorScheme } from "nativewind";
import { useInventory } from "@/hooks/useInventory";
import { fetchProductSalesReport } from "@/lib/salesApi";
import { formatRangeLabel, validateRange } from "@/lib/dateRange";
import type { ProductSalesReport, ReportPeriod, ReportQuery } from "@/types/sale";
import { useBackNavigation } from "@/hooks/useBackNavigation";

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledChevronRight = styledIcon(ChevronRight);
const StyledChevronsLeft = styledIcon(ChevronsLeft);
const StyledChevronsRight = styledIcon(ChevronsRight);
const StyledSearch = styledIcon(Search);
const StyledFunnel = styledIcon(Funnel);

const ITEMS_PER_PAGE = 10;

const money = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const number = (value: number) => value.toLocaleString("en-PH");

const REPORT_PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly", "yearly", "custom"];

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  yearly: "This year",
  custom: "Custom range",
};

// Same ranges as before, now applied by the report endpoint to real sales.
const SOLD_RANGES: Record<string, { minUnits?: number; maxUnits?: number }> = {
  "1-10": { minUnits: 1, maxUnits: 10 },
  "11-50": { minUnits: 11, maxUnits: 50 },
  "51+": { minUnits: 51 },
  zero: { maxUnits: 0 },
};

export default function ProductPerformance() {
  const top = useScrollToTop();
  // "/reports" is only the Up target for a screen opened with no history
  // (deep link / web refresh); normal back pops the real stack.
  const { goBack } = useBackNavigation("/reports");
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  // Same report and period as the Top Products card on the Reports tab.
  const {
    period: periodParam,
    start: startParam,
    end: endParam,
  } = useLocalSearchParams<{ period?: string; start?: string; end?: string }>();
  const periodName = REPORT_PERIODS.find((value) => value === periodParam);

  // A custom range is only usable with two valid dates; otherwise fall back
  // to the unfiltered, all-time list.
  const period = useMemo<ReportQuery | undefined>(() => {
    if (!periodName) return undefined;
    if (periodName !== "custom") return { period: periodName };
    if (!startParam || !endParam || validateRange(startParam, endParam)) return undefined;
    return { period: "custom", start: startParam, end: endParam };
  }, [periodName, startParam, endParam]);

  // Only used to offer categories of active products that have not sold.
  const { inventory, fetchInventory } = useInventory();

  const [report, setReport] = useState<ProductSalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterVisible, setFilterVisible] = useState(false);

  const [activeFilters, setActiveFilters] = useState<FilterValues>({
    soldRange: ["all"],
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectedCategories = activeFilters.category;
  const selectedSoldRange = activeFilters.soldRange?.[0] ?? "all";
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();

      void fetchInventory(true, controller.signal);

      setLoading(true);
      setLoadError(null);

      void fetchProductSalesReport(ITEMS_PER_PAGE, controller.signal, period, {
        offset,
        search: debouncedSearch,
        categories: selectedCategories,
        includeUnsold: true,
        ...SOLD_RANGES[selectedSoldRange],
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setReport(result);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setLoadError(
              error instanceof Error
                ? error.message
                : "Product sales could not be loaded.",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });

      return () => controller.abort();
    }, [
      fetchInventory,
      period,
      offset,
      debouncedSearch,
      selectedCategories,
      selectedSoldRange,
      refreshCount,
    ]),
  );

  const filterSections = useMemo<FilterSection[]>(() => {
    const categories = [
      ...new Set([
        ...inventory.map((product) => product.category),
        ...(report?.categories ?? []).map((item) => item.category),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return [
      {
        key: "category",
        title: "Category",
        type: "multiple",
        options: categories.map((category) => ({
          label: category,
          value: category,
        })),
      },
      {
        key: "soldRange",
        title: "Units Sold",
        type: "single",
        options: [
          { label: "Any amount", value: "all" },
          { label: "1–10 pcs", value: "1-10" },
          { label: "11–50 pcs", value: "11-50" },
          { label: "51+ pcs", value: "51+" },
          { label: "Not yet sold", value: "zero" },
        ],
      },
    ];
  }, [inventory, report]);

  const totalProducts = report?.total_products ?? 0;

  const totalPages = Math.max(1, Math.ceil(totalProducts / ITEMS_PER_PAGE));

  const safePage = Math.min(currentPage, totalPages);

  const paginatedProducts = report?.top_products ?? [];

  const pageNumbers = useMemo(() => {
    const start = Math.max(
      1,
      Math.min(safePage - 2, totalPages - 4),
    );

    const end = Math.min(totalPages, start + 4);

    return Array.from(
      { length: end - start + 1 },
      (_, index) => start + index,
    );
  }, [safePage, totalPages]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleApplyFilters = (values: FilterValues) => {
    setActiveFilters(values);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setActiveFilters({ soldRange: ["all"] });
    setCurrentPage(1);
  };

  const activeFilterCount = Object.entries(activeFilters).reduce(
    (total, [key, values]) => {
      if (key === "soldRange" && values.includes("all")) {
        return total;
      }

      return total + values.length;
    },
    0,
  );

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-8 w-8 items-center justify-center"
          >
            <StyledChevronLeft size={22} className="text-ctp-text" />
          </Pressable>

          <Text className="font-inter-semibold text-lg text-ctp-text">
            Product Performance
          </Text>

          <View className="h-8 w-8" />
        </View>

        {/* Search and filter */}
        <View className="mb-3 justify-center">
          <View
            pointerEvents="none"
            className="absolute left-3 z-10"
          >
            <StyledSearch
              size={18}
              className="text-ctp-subtext0"
            />
          </View>

          <TextInput
            placeholder="Search parts..."
            placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
            selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            className="h-[42px] w-full rounded-md border-[1.5px] border-ctp-surface1 bg-ctp-mantle pl-10 pr-12 font-inter-regular text-ctp-text"
          />

          <Pressable
            onPress={() => setFilterVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Filter products"
            className="absolute right-2 z-10 h-9 min-w-9 flex-row items-center justify-center rounded-md px-1"
          >
            <StyledFunnel
              size={18}
              className={
                activeFilterCount > 0
                  ? "text-ctp-blue"
                  : "text-ctp-subtext0"
              }
            />

            {activeFilterCount > 0 && (
              <View className="ml-1 h-5 min-w-5 items-center justify-center rounded-full bg-ctp-blue px-1">
                <Text className="font-inter-semibold text-xs text-ctp-crust">
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Result count */}
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="font-inter-medium text-sm text-ctp-subtext0">
            {loading
              ? "Loading products..."
              : loadError
                ? "Products unavailable"
                : `${totalProducts} products found`}
          </Text>

          <Text className="font-inter-medium text-sm text-ctp-subtext0">
            {period?.start && period.end ? formatRangeLabel(period.start, period.end) : period ? PERIOD_LABELS[period.period] : "All time"} · by units sold
          </Text>
        </View>

        {/* Product list */}
        <ScrollView
          ref={top.ref}
          onScroll={top.onScroll}
          scrollEventThrottle={top.scrollEventThrottle}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
        >
          {loading ? (
            <View className="items-center py-12">
              <Text className="font-inter-medium text-sm text-ctp-subtext0">
                Fetching products from the database...
              </Text>
            </View>
          ) : loadError ? (
            <View className="items-center gap-3 px-3 py-12">
              <Text className="text-center font-inter-medium text-sm text-ctp-red">
                {loadError}
              </Text>

              <Pressable
                onPress={() => setRefreshCount((count) => count + 1)}
                className="rounded-md bg-ctp-surface0 px-4 py-2"
              >
                <Text className="font-inter-semibold text-sm text-ctp-text">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : paginatedProducts.length > 0 ? (
            paginatedProducts.map((product, index) => {
              const rank = offset + index + 1;

              const rankBorder =
                rank === 1
                  ? "border-ctp-yellow"
                  : rank === 2
                    ? "border-ctp-overlay1"
                    : rank === 3
                      ? "border-ctp-peach"
                      : "border-ctp-surface1";

              const rankText =
                rank === 1
                  ? "text-ctp-yellow"
                  : rank === 2
                    ? "text-ctp-overlay1"
                    : rank === 3
                      ? "text-ctp-peach"
                      : "text-ctp-subtext0";

              return (
                <View
                  key={product.product_id ?? `history-${product.sku ?? product.name}`}
                  className={`m-1 mb-3 flex-row rounded-lg border-[1px] bg-ctp-mantle ${rankBorder}`}
                  style={{
                    boxShadow:
                      "0px 0px 8px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <ProductThumbnail product={product} fallback="No image" />

                  <View className="mx-1 my-3 flex-1 justify-between">
                    <Text
                      numberOfLines={2}
                      className="font-inter-semibold text-base text-ctp-text"
                    >
                      {product.name}
                    </Text>

                    <Text className="font-inter-semibold text-sm text-ctp-subtext0">
                      {money(product.revenue)}
                      {product.archived
                        ? " · Archived"
                        : product.deleted
                          ? " · Removed"
                          : ""}
                    </Text>
                  </View>

                  <View className="mr-3 my-3 items-end justify-between">
                    <Text className="font-inter-semibold text-sm text-ctp-text">
                      {number(product.units_sold)} pcs
                    </Text>

                    <Text
                      className={`font-inter-semibold text-sm ${rankText}`}
                    >
                      Rank #{rank}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View className="items-center py-12">
              <StyledSearch
                size={28}
                className="text-ctp-overlay1"
              />

              <Text className="mt-3 font-inter-semibold text-base text-ctp-text">
                No products found
              </Text>

              <Text className="mt-1 text-sm text-ctp-subtext0">
                Try changing your search or filters.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Pagination */}
        {!loading && !loadError && totalProducts > 0 && (
          <View className="flex-row items-center justify-center border-t border-ctp-surface0 py-4">
            <View className="w-full flex-row items-center justify-center gap-1.5">
              <Pressable
                onPress={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === 1
                    ? "bg-ctp-surface0/50"
                    : "bg-ctp-mantle"
                  }`}
              >
                <StyledChevronsLeft
                  size={18}
                  className={
                    safePage === 1
                      ? "text-ctp-overlay1"
                      : "text-ctp-text"
                  }
                />
              </Pressable>

              <Pressable
                onPress={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
                disabled={safePage === 1}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === 1
                    ? "bg-ctp-surface0/50"
                    : "bg-ctp-mantle"
                  }`}
              >
                <StyledChevronLeft
                  size={18}
                  className={
                    safePage === 1
                      ? "text-ctp-overlay1"
                      : "text-ctp-text"
                  }
                />
              </Pressable>

              {pageNumbers.map((page) => (
                <Pressable
                  key={page}
                  onPress={() => setCurrentPage(page)}
                  className={`h-10 min-w-9 items-center justify-center rounded-lg px-2 ${safePage === page
                      ? "bg-ctp-blue"
                      : "bg-ctp-mantle"
                    }`}
                >
                  <Text
                    className={`font-inter-bold text-sm ${safePage === page
                        ? "text-ctp-crust"
                        : "text-ctp-subtext0"
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
                disabled={safePage === totalPages}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === totalPages
                    ? "bg-ctp-surface0/50"
                    : "bg-ctp-mantle"
                  }`}
              >
                <StyledChevronRight
                  size={18}
                  className={
                    safePage === totalPages
                      ? "text-ctp-overlay1"
                      : "text-ctp-text"
                  }
                />
              </Pressable>

              <Pressable
                onPress={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === totalPages
                    ? "bg-ctp-surface0/50"
                    : "bg-ctp-mantle"
                  }`}
              >
                <StyledChevronsRight
                  size={18}
                  className={
                    safePage === totalPages
                      ? "text-ctp-overlay1"
                      : "text-ctp-text"
                  }
                />
              </Pressable>
            </View>
          </View>
        )}

        {!loading && !loadError && totalProducts > 0 && (
          <Text className="pb-2 text-center font-inter-medium text-sm text-ctp-subtext0">
            Page {safePage} of {totalPages}
          </Text>
        )}
      </View>

      <FilterModal
        visible={filterVisible}
        title="Filter Products"
        sections={filterSections}
        initialValues={activeFilters}
        onClose={() => setFilterVisible(false)}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />
          <ScrollToTopButton visible={top.visible} onPress={top.scrollToTop} bottom={112} />
    </SafeAreaView>
  );
}
