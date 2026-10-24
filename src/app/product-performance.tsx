
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

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronsLeft from "lucide-react-native/icons/chevrons-left";
import ChevronsRight from "lucide-react-native/icons/chevrons-right";
import Search from "lucide-react-native/icons/search";
import Funnel from "lucide-react-native/icons/funnel";

import products from "../data/products.json";

const ITEMS_PER_PAGE = 10;

const money = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const number = (value: number) => value.toLocaleString("en-PH");

export default function ProductPerformance() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => b.sold - a.sold)
      .filter((product) =>
        product.name
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase()),
      );
  }, [searchQuery]);

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

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F5]">
      <View className="flex-1 px-5 pt-7">
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-8 w-8 items-center justify-center"
          >
            <ChevronLeft size={22} color="#000000" />
          </Pressable>

          <Text className="font-inter-semibold text-lg">
            Product Performance
          </Text>

          <View className="h-8 w-8" />
        </View>

        <View className="mb-3 justify-center">
          <View
            pointerEvents="none"
            className="absolute left-3 z-10"
          >
            <Search size={18} color="#666666" />
          </View>

          <TextInput
            placeholder="Search parts..."
            placeholderTextColor="#666666"
            selectionColor="#000000"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            className="h-[42px] w-full rounded-md border-[1.5px] border-black/10 bg-white pl-10 pr-3 font-inter-regular"
          />

          <View
            pointerEvents="none"
            className="absolute right-3 z-10">

            <Funnel size={18} color="#666666" />

          </View>
        </View>

        <View className="mb-2 flex-row items-center justify-between">
          <Text className="font-inter-medium text-sm text-black/50">
            {filteredProducts.length} products found
          </Text>

          <Text className="font-inter-medium text-sm text-black/50">
            Sorted by units sold
          </Text>
        </View>

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
                  ? "border-yellow-400"
                  : rank === 2
                    ? "border-gray-400"
                    : rank === 3
                      ? "border-amber-700"
                      : "border-black/20";

              const rankText =
                rank === 1
                  ? "text-yellow-400"
                  : rank === 2
                    ? "text-gray-400"
                    : rank === 3
                      ? "text-amber-700"
                      : "text-black/30";

              return (
                <View
                  key={product.id}
                  className={`m-1 mb-3 flex-row rounded-lg border-[1px] bg-white ${rankBorder}`}
                  style={{
                    boxShadow:
                      "0px 0px 8px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  {/* Product image placeholder */}
                  <View className="m-2 h-20 w-20 rounded-lg bg-black/10 items-center justify-center">
                    <Text className="font-inter-medium text-xs text-black/30">
                      No image
                    </Text>
                  </View>

                  {/* Product details */}
                  <View className="my-3 mx-1 flex-1 justify-between">
                    <Text
                      numberOfLines={2}
                      className="font-inter-semibold text-base"
                    >
                      {product.name}
                    </Text>

                    <Text className="font-inter-semibold text-sm text-black/50">
                      {money(product.price)}
                    </Text>
                  </View>

                  {/* Performance */}
                  <View className="my-3 mr-3 items-end justify-between">
                    <Text className="font-inter-semibold text-sm">
                      {number(product.sold)} pcs
                    </Text>

                    <Text className={`font-inter-semibold text-sm ${rankText}`}>
                      Rank #{rank}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View className="items-center py-12">
              <Search size={28} color="#999999" />

              <Text className="mt-3 font-inter-semibold text-base">
                No products found
              </Text>

              <Text className="mt-1 text-sm text-black/50">
                Try searching for a different part.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Pagination */}
        {filteredProducts.length > 0 && (
          <View className="flex-row items-center justify-center border-t border-black/5 py-4">
            <View className="w-full flex-row items-center justify-center gap-1.5">
              {/* First page */}
              <Pressable
                onPress={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === 1 ? "bg-black/5" : "bg-white"
                  }`}
              >
                <ChevronsLeft
                  size={18}
                  color={safePage === 1 ? "#AAAAAA" : "#000000"}
                />
              </Pressable>

              {/* Previous page */}
              <Pressable
                onPress={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
                disabled={safePage === 1}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === 1 ? "bg-black/5" : "bg-white"
                  }`}
              >
                <ChevronLeft
                  size={18}
                  color={safePage === 1 ? "#AAAAAA" : "#000000"}
                />
              </Pressable>

              {/* Page numbers */}
              {pageNumbers.map((page) => (
                <Pressable
                  key={page}
                  onPress={() => setCurrentPage(page)}
                  className={`h-10 min-w-9 items-center justify-center rounded-lg px-2 ${safePage === page ? "bg-black" : "bg-white"
                    }`}
                >
                  <Text
                    className={`font-inter-bold text-sm ${safePage === page
                      ? "text-white"
                      : "text-black/60"
                      }`}
                  >
                    {page}
                  </Text>
                </Pressable>
              ))}

              {/* Next page */}
              <Pressable
                onPress={() =>
                  setCurrentPage((page) =>
                    Math.min(totalPages, page + 1),
                  )
                }
                disabled={safePage === totalPages}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === totalPages ? "bg-black/5" : "bg-white"
                  }`}
              >
                <ChevronRight
                  size={18}
                  color={
                    safePage === totalPages ? "#AAAAAA" : "#000000"
                  }
                />
              </Pressable>

              {/* Last page */}
              <Pressable
                onPress={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className={`h-10 items-center justify-center rounded-lg px-2 ${safePage === totalPages ? "bg-black/5" : "bg-white"
                  }`}
              >
                <ChevronsRight
                  size={18}
                  color={
                    safePage === totalPages ? "#AAAAAA" : "#000000"
                  }
                />
              </Pressable>
            </View>
          </View>
        )}

        {filteredProducts.length > 0 && (
          <Text className="pb-2 text-center font-inter-medium text-sm text-black/40">
            Page {safePage} of {totalPages}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
