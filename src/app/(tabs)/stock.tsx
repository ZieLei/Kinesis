
import { SHOW_AFTER, useScrollToTop } from "@/hooks/useScrollToTop";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import { scheduleOnRN } from "react-native-worklets";
import { LoadingState } from "@/components/ui/StateViews";
import {
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useBackNavigation } from "@/hooks/useBackNavigation";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import Plus from "lucide-react-native/icons/plus";
import PackagePlus from "lucide-react-native/icons/package-plus";
import ArchiveIcon from "lucide-react-native/icons/archive";

import ConfirmDialog from "@/components/ConfirmDialog";
import FilterModal from "@/components/modals/FilterModal";
import Snackbar from "@/components/Snackbar";
import CategoryTabs from "@/components/CategoryTabs";
import EditProductSheet from "@/components/stock/EditProductSheet";
import ReceiveStockSheet from "@/components/stock/ReceiveStockSheet";
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
import type { InventoryReceiptCreate } from "@/types/inventory";

const StyledPlus = styledIcon(Plus);
const StyledArchive = styledIcon(ArchiveIcon);

export default function Stock() {
  const top = useScrollToTop();
  const { canGoBack, goBack } = useBackNavigation();
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
    archiveProduct,
    receiveStock,
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
  const [receivingStock, setReceivingStock] = useState(false);
  // Product awaiting archive confirmation, and the in-flight request.
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const hideNotice = useCallback(() => setNotice(null), []);

  useFocusEffect(
    useCallback(() => {
      void fetchInventory();
    }, [fetchInventory]),
  );

  const stockStats = useMemo(
    () => computeStockStats(inventory, lowStockThreshold),
    [inventory, lowStockThreshold],
  );

  const shownTop = useSharedValue(false);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;

      const show = event.contentOffset.y > SHOW_AFTER;
      if (show !== shownTop.value) {
        shownTop.value = show;
        scheduleOnRN(top.setVisible, show);
      }
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

      setNotice(`${savedProduct.name} was saved.`);

      return;
    }

    const createdProduct = await addProduct(values);

    closeProductSheet();

    setNotice(`${createdProduct.name} was added to your inventory.`);
  };

  const handleReceiveStock = async (
    values: InventoryReceiptCreate,
  ) => {
    const receipt = await receiveStock(values);
    const receivedItem = receipt.items[0];

    setNotice(
      `${receivedItem.product_name}: ${receivedItem.quantity} units received · ` +
        `total ₱${receipt.total_cost.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
    );
  };

  const requestArchive = (product: Product) => {
    setArchiveError("");
    setArchiveTarget(product);
  };

  const cancelArchive = () => {
    if (archiving) return;
    setArchiveTarget(null);
    setArchiveError("");
  };

  const confirmArchive = async () => {
    const product = archiveTarget;
    if (!product || archiving) return;

    setArchiving(true);
    setArchiveError("");

    try {
      await archiveProduct(product.id);

      setEditingItem((current) =>
        current?.id === product.id ? null : current,
      );
      setArchiveTarget(null);
      setNotice(`${product.name} was archived.`);
    } catch (error) {
      setArchiveError(
        error instanceof Error
          ? error.message
          : "Could not archive this product. Check your connection and try again.",
      );
    } finally {
      setArchiving(false);
    }
  };

  // Stats, the category row and the tabs scroll together with the list, so the
  // products get the whole screen instead of a strip below a fixed header.
  const listHeader = (
    <View>
      <StockStats stats={stockStats} />

          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-inter-semibold text-lg text-ctp-text">
              Categories
            </Text>

            <Pressable
              onPress={() => setReceivingStock(true)}
              disabled={inventory.length === 0 || loading}
              accessibilityRole="button"
              accessibilityLabel="Receive stock"
              className={`flex-row items-center gap-2 rounded-lg border border-ctp-blue/40 bg-ctp-blue/10 px-3 py-2 ${inventory.length === 0 || loading ? "opacity-40" : ""
                }`}
            >
              <PackagePlus
                size={16}
                color={isDark ? "#89B4FA" : "#1E66F5"}
              />

              <Text className="font-inter-semibold text-xs text-ctp-blue">
                Receive Stock
              </Text>
            </Pressable>
          </View>

          <Text className="mb-2 font-inter-regular text-xs text-ctp-subtext0">
            Low stock: ≤ {lowStockThreshold} units
          </Text>

          <CategoryTabs
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <StockHeader
          title="Inventory"
          refreshing={refreshing}
          refreshDisabled={loading || refreshing}
          onBack={canGoBack ? goBack : undefined}
          onRefresh={refreshInventory}
        />

        <CollapsibleSearchBar
          scrollY={scrollY}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onOpenFilters={() => setFilterVisible(true)}
          activeFilterCount={activeFilterCount}
        />

        <View className="flex-1">
          {loading && inventory.length === 0 ? (
            <>
              {listHeader}
              <LoadingState message="Loading inventory..." />
            </>
          ) : loadError && inventory.length === 0 ? (
            <View className="flex-1">
              {listHeader}
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
                ref={top.ref}
                data={filteredProducts}
                keyExtractor={(item) => item.id.toString()}
                ListHeaderComponent={listHeader}
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
                    onArchive={requestArchive}
                    archiving={archiving && archiveTarget?.id === item.id}
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

        <ReceiveStockSheet
          visible={receivingStock}
          products={inventory}
          onClose={() => setReceivingStock(false)}
          onReceive={handleReceiveStock}
        />

        <ConfirmDialog
          visible={archiveTarget !== null}
          title="Archive product?"
          message={
            archiveTarget
              ? `"${archiveTarget.name}" will be removed from inventory and ` +
                "sales. Its stock, cost, SKU and sales history are kept, and " +
                "an administrator can restore it from the admin console."
              : ""
          }
          confirmLabel="Archive"
          icon={
            <View className="h-11 w-11 items-center justify-center rounded-full bg-ctp-surface0">
              <StyledArchive size={22} className="text-ctp-text" />
            </View>
          }
          busy={archiving}
          error={archiveError}
          onConfirm={() => void confirmArchive()}
          onCancel={cancelArchive}
        />

        <Snackbar message={notice} onHide={hideNotice} />
      </View>
          <ScrollToTopButton visible={top.visible} onPress={top.scrollToTop} />
    </SafeAreaView>
  );
}
