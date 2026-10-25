import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

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
import { useColorScheme } from "nativewind";

import products from "../data/products.json";

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

export default function ProductPerformance() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [filterVisible, setFilterVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterValues>({
    sold: ["all"],
  });

  const filterSections = useMemo<FilterSection[]>(() => {
    const categories = [
      ...new Set(products.map((product) => product.category)),
    ]
      .filter(Boolean)
      .sort();

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
  }, []);

  const filteredProducts = useMemo(() => {
    const selectedCategories = activeFilters.category ?? [];
    const selectedSoldRange = activeFilters.soldRange?.[0];

    return [...products]
      .filter((product) => {
        const matchesSearch = product.name
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase());

        const matchesCategory =
          selectedCategories.length === 0 ||
          selectedCategories.includes(product.category);

        let matchesSoldRange = true;

        switch (selectedSoldRange) {
          case "1-10":
            matchesSoldRange =
              product.sold >= 1 && product.sold <= 10;
            break;

          case "11-50":
            matchesSoldRange =
              product.sold >= 11 && product.sold <= 50;
            break;

          case "51+":
            matchesSoldRange = product.sold >= 51;
            break;

          case "zero":
            matchesSoldRange = product.sold === 0;
            break;

          case "all":
          default:
            matchesSoldRange = true;
            break;
        }

        return (
          matchesSearch &&
          matchesCategory &&
          matchesSoldRange
        );
      })
      .sort((a, b) => b.sold - a.sold);
  }, [searchQuery, activeFilters]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / ITEMS_PER_PAGE),
  );

  const safePage = Math.min(currentPage, totalPages);

  const paginatedProducts = useMemo(() => {
    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;

    return filteredProducts.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE,
    );
  }, [filteredProducts, safePage]);

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
    setActiveFilters({});
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
            onPress={() => router.back()}
            className="h-8 w-8 items-center justify-center"
          >
            <StyledChevronLeft
              size={22}
              className="text-ctp-text"
            />
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
            {filteredProducts.length} products found
          </Text>

          <Text className="font-inter-medium text-sm text-ctp-subtext0">
            Sorted by units sold
          </Text>
        </View>

        {/* Product list */}
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
        >
          {paginatedProducts.length > 0 ? (
            paginatedProducts.map((product) => {
              const rank =
                filteredProducts.findIndex(
                  (item) => item.id === product.id,
                ) + 1;

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
                  key={product.id}
                  className={`m-1 mb-3 flex-row rounded-lg border-[1px] bg-ctp-mantle ${rankBorder}`}
                  style={{
                    boxShadow:
                      "0px 0px 8px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <View className="m-2 h-20 w-20 items-center justify-center rounded-lg bg-ctp-surface0">
                    <Text className="font-inter-medium text-xs text-ctp-subtext0">
                      No image
                    </Text>
                  </View>

                  <View className="my-3 mx-1 flex-1 justify-between">
                    <Text
                      numberOfLines={2}
                      className="font-inter-semibold text-base text-ctp-text"
                    >
                      {product.name}
                    </Text>

                    <Text className="font-inter-semibold text-sm text-ctp-subtext0">
                      {money(product.price)}
                    </Text>
                  </View>

                  <View className="my-3 mr-3 items-end justify-between">
                    <Text className="font-inter-semibold text-sm text-ctp-text">
                      {number(product.sold)} pcs
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
        {filteredProducts.length > 0 && (
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

        {filteredProducts.length > 0 && (
          <Text className="pb-2 text-center font-inter-medium text-sm text-ctp-subtext0">
            Page {safePage} of {totalPages}
          </Text>
        )}
      </View>

      {/* Reusable filter modal */}
      <FilterModal
        visible={filterVisible}
        title="Filter Products"
        sections={filterSections}
        initialValues={activeFilters}
        onClose={() => setFilterVisible(false)}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />
    </SafeAreaView>
  );
}
