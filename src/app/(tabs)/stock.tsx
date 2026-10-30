import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import Plus from "lucide-react-native/icons/plus";

import FilterModal from "@/components/modals/FilterModal";
import CategoryTabs from "@/components/CategoryTabs";
import EditProductSheet from "@/components/stock/EditProductSheet";
import StockHeader from "@/components/stock/StockHeader";
import StockItem from "@/components/stock/StockItem";
import CollapsibleSearchBar from "@/components/CollapsibleSearchBar";
import StockStats from "@/components/stock/StockStats";
import { useInventory } from "@/hooks/useInventory";
import { useStockFilters } from "@/hooks/useStockFilters";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useTerminalSettings } from "@/app/context/TerminalSettingsContext";
import { computeStockStats, LOW_STOCK_THRESHOLD } from "@/lib/products";
import { styledIcon } from "@/components/StyledIcon";
import type { Product, ProductFormValues } from "@/types/product";

const StyledPlus = styledIcon(Plus);

export default function Stock() {
  const openItemId = useSharedValue<number | null>(null);
  const scrollY = useSharedValue(0);

  const { isDark, selection } = useThemeColors();

  const { settings } = useTerminalSettings();

  const parsedThreshold = Number(
    settings?.lowStockThreshold ?? LOW_STOCK_THRESHOLD,
  );

  const lowStockThreshold =
    Number.isSafeInteger(parsedThreshold) && parsedThreshold >= 0
      ? parsedThreshold
      : LOW_STOCK_THRESHOLD;

  const {
    inventory,
    loading,
    refreshing,
    loadError,
    fetchInventory,
    refreshInventory,
    addProduct,
    saveProduct,
    removeProduct,
  } = useInventory();

  const {
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filterVisible,
    setFilterVisible,
    activeFilters,
    setActiveFilters,
    resetFilters,
    filterSections,
    filteredProducts,
    activeFilterCount,
  } = useStockFilters(inventory, lowStockThreshold);

  const [editingItem, setEditingItem] = useState<Product | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      void fetchInventory();
    }, [fetchInventory]),
  );

  const stockStats = useMemo(
    () => computeStockStats(inventory, lowStockThreshold),
    [inventory, lowStockThreshold],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const closeProductSheet = () => {
    setEditingItem(null);
    setAddingProduct(false);
  };

  const handleSaveProduct = async (
    product: Product | null,
    values: ProductFormValues,
  ) => {
    if (product) {
      const savedProduct = await saveProduct(product.id, values);

      closeProductSheet();

      Alert.alert(
        "Product updated",
        `${savedProduct.name} was saved successfully.`,
      );

      return;
    }

    const createdProduct = await addProduct(values);

    closeProductSheet();

    Alert.alert(
      "Product created",
      `${createdProduct.name} was added to your inventory.`,
    );
  };

  const confirmDeleteProduct = (product: Product) => {
    Alert.alert(
      "Delete product?",
      `This will permanently delete "${product.name}" from the inventory.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(product.id);

            try {
              await removeProduct(product.id);

              setEditingItem((current) =>
                current?.id === product.id ? null : current,
              );

              Alert.alert(
                "Product deleted",
                `${product.name} was deleted.`,
              );
            } catch (error) {
              Alert.alert(
                "Delete failed",
                error instanceof Error
                  ? error.message
                  : "Could not delete this product.",
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <StockHeader
          title="Inventory"
          refreshing={refreshing}
          refreshDisabled={loading || refreshing}
          onBack={() => router.back()}
          onRefresh={refreshInventory}
        />

        <CollapsibleSearchBar
          scrollY={scrollY}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onOpenFilters={() => setFilterVisible(true)}
          activeFilterCount={activeFilterCount}
        />

        <StockStats stats={stockStats} />

        <View className="flex-1">
          <View className="flex-row items-center justify-between pb-2">
            <Text className="font-inter-semibold text-lg text-ctp-text">
              Categories
            </Text>

            <Text className="font-inter-regular text-xs text-ctp-subtext0">
              Low stock: ≤ {lowStockThreshold} units
            </Text>
          </View>

          <CategoryTabs
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />

          {loading && inventory.length === 0 ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={selection} />

              <Text className="font-inter-medium text-sm text-ctp-subtext0">
                Loading inventory...
              </Text>
            </View>
          ) : loadError && inventory.length === 0 ? (
            <View className="flex-1 items-center justify-center px-3">
              <Text className="mb-2 text-center font-inter-semibold text-base text-ctp-red">
                Could not load inventory
              </Text>

              <Text className="mb-4 text-center font-inter-regular text-sm text-ctp-subtext0">
                {loadError}
              </Text>

              <Pressable
                onPress={() => void fetchInventory()}
                className="rounded-lg bg-ctp-blue px-5 py-3"
              >
                <Text
                  className={`font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
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
                  onPress={() => void fetchInventory(false)}
                  className="mb-2 rounded-lg bg-ctp-red/10 p-3"
                >
                  <Text className="font-inter-medium text-sm text-ctp-red">
                    Refresh failed. Showing the last loaded inventory. Tap to
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
                contentContainerStyle={{
                  paddingBottom: 100,
                  alignItems: "stretch",
                  justifyContent: "flex-start",
                }}
                refreshing={refreshing}
                onRefresh={refreshInventory}
                renderItem={({ item }) => (
                  <StockItem
                    item={item}
                    openItemId={openItemId}
                    onEdit={setEditingItem}
                    onDelete={confirmDeleteProduct}
                    deleting={deletingId === item.id}
                  />
                )}
                ListEmptyComponent={
                  <View className="items-center justify-center py-8">
                    <Text className="text-center font-inter-semibold text-base text-ctp-subtext0">
                      {inventory.length === 0
                        ? "Your inventory is empty."
                        : searchQuery.trim()
                          ? `No results matching "${searchQuery}"`
                          : "No products match these filters."}
                    </Text>
                  </View>
                }
              />
            </>
          )}
        </View>

        <Pressable
          onPress={() => {
            setEditingItem(null);
            setAddingProduct(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add product"
          disabled={loading && inventory.length === 0}
          className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-ctp-blue shadow-lg"
        >
          <StyledPlus
            size={26}
            className={isDark ? "text-ctp-crust" : "text-white"}
          />
        </Pressable>

        <FilterModal
          visible={filterVisible}
          title="Filter Inventory"
          sections={filterSections}
          initialValues={activeFilters}
          onClose={() => setFilterVisible(false)}
          onApply={setActiveFilters}
          onReset={resetFilters}
        />

        <EditProductSheet
          product={editingItem}
          visible={addingProduct}
          categories={categories}
          onClose={closeProductSheet}
          onSave={handleSaveProduct}
        />
      </View>
    </SafeAreaView>
  );
}
