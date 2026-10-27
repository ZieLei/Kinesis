import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useMemo } from "react";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";

import Camera from "lucide-react-native/icons/focus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";

import { useCart } from "@/app/context/CartContext";
import CategoryTabs from "@/components/CategoryTabs";
import CollapsibleSearchBar from "@/components/CollapsibleSearchBar";
import CheckoutBar from "@/components/new-sale/CheckoutBar";
import SaleProductItem from "@/components/new-sale/SaleProductItem";
import ScreenHeader from "@/components/ScreenHeader";
import { styledIcon } from "@/components/StyledIcon";
import { useInventory } from "@/hooks/useInventory";
import { useSaleProducts } from "@/hooks/useSaleProducts";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Product } from "@/types/product";

const CameraIcon = styledIcon(Camera);
const RefreshCwIcon = styledIcon(RefreshCw);

export default function NewSale() {
  const scrollY = useSharedValue(0);

  const { isDark, selection } = useThemeColors();

  const {
    inventory: products,
    loading,
    refreshing,
    loadError,
    fetchInventory,
    refreshInventory,
  } = useInventory();

  const {
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filteredProducts,
  } = useSaleProducts(products);

  const { addToCart, items, decreaseQuantity, total } = useCart();

  const cartItemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  // Load when this screen is focused and cancel requests on blur/unmount.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();

      void fetchInventory(true, controller.signal);

      return () => {
        controller.abort();
      };
    }, [fetchInventory]),
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const handleAddToCart = useCallback(
    (product: Product) => {
      const existingCartItem = cartItemsById.get(product.id);

      // Do not add more units than the inventory currently reports.
      if (existingCartItem && existingCartItem.quantity >= product.stock) {
        return;
      }

      if (product.stock <= 0) return;

      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
      });
    },
    [addToCart, cartItemsById],
  );

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <ScreenHeader
          title="New Sale"
          onBack={() => router.back()}
          right={
            <Pressable
              onPress={() => router.push("/")}
              className="h-8 w-8 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Scan product"
            >
              <CameraIcon size={22} className="text-ctp-text" />
            </Pressable>
          }
        />

        <CollapsibleSearchBar
          scrollY={scrollY}
          value={searchQuery}
          onChangeText={setSearchQuery}
          expandedMargin={20}
        />

        <View className="flex-1">
          <Text className="font-inter-semibold text-base text-ctp-text">
            Categories
          </Text>

          <CategoryTabs
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />

          {loading && products.length === 0 ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={selection} />
              <Text className="font-inter-medium text-sm text-ctp-subtext0">
                Loading products...
              </Text>
            </View>
          ) : loadError && products.length === 0 ? (
            <View className="flex-1 items-center justify-center px-5">
              <Text className="mb-2 text-center font-inter-semibold text-base text-ctp-text">
                Could not load products
              </Text>
              <Text className="mb-4 text-center font-inter-regular text-sm text-ctp-subtext0">
                {loadError}
              </Text>
              <Pressable
                onPress={() => void fetchInventory()}
                className="flex-row items-center gap-2 rounded-lg bg-ctp-blue px-4 py-3"
              >
                <RefreshCwIcon
                  size={16}
                  className={isDark ? "text-ctp-crust" : "text-white"}
                />
                <Text
                  className={`font-inter-semibold text-sm ${isDark ? "text-ctp-crust" : "text-white"
                    }`}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {loadError ? (
                <Pressable
                  onPress={refreshInventory}
                  className="mb-2 rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-3"
                >
                  <Text className="font-inter-medium text-xs text-ctp-red">
                    Refresh failed. Showing previously loaded products. Tap to
                    retry.
                  </Text>
                </Pressable>
              ) : null}

              <Animated.FlatList
                data={filteredProducts}
                keyExtractor={(item) => item.id.toString()}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={refreshInventory}
                    tintColor={selection}
                  />
                }
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item }) => (
                  <SaleProductItem
                    item={item}
                    cartQuantity={cartItemsById.get(item.id)?.quantity}
                    onAdd={handleAddToCart}
                    onDecrease={decreaseQuantity}
                  />
                )}
                ListEmptyComponent={
                  <View className="items-center justify-center py-6">
                    <Text className="text-center font-inter-semibold text-base text-ctp-subtext0">
                      {searchQuery.trim()
                        ? `No results matching "${searchQuery.trim()}"`
                        : "No products found"}
                    </Text>
                  </View>
                }
              />
            </>
          )}

          <CheckoutBar
            total={total}
            onOpenCart={() => router.push("/cart")}
            onCheckout={() => router.push("/checkout")}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
