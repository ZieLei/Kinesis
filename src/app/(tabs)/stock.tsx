

import {
  Text,
  TextInput,
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useState } from "react";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  SharedValue,
  interpolate,
  Extrapolation,
  withSpring,
  useAnimatedReaction,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Host, BottomSheet, RNHostView } from "@expo/ui";

import Pencil from "lucide-react-native/icons/pencil";
import Trash from "lucide-react-native/icons/trash";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Funnel from "lucide-react-native/icons/funnel";
import Search from "lucide-react-native/icons/search";
import Plus from "lucide-react-native/icons/plus";
import X from "lucide-react-native/icons/x";

import products from "@/data/products.json";
import FilterModal, {
  FilterSection,
  FilterValues,
} from "@/components/modals/FilterModal";
import { styledIcon } from "@/components/StyledIcon";

const StyledPencil = styledIcon(Pencil);
const StyledTrash = styledIcon(Trash);
const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledFunnel = styledIcon(Funnel);
const StyledSearch = styledIcon(Search);
const StyledPlus = styledIcon(Plus);
const StyledX = styledIcon(X);

type Product = (typeof products)[number];

const formatPrice = (price: number) =>
  price.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Stock() {
  const openItemId = useSharedValue<number | null>(null);
  const scrollY = useSharedValue(0);

  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [inventory, setInventory] = useState<Product[]>(products);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  const [activeFilters, setActiveFilters] = useState<FilterValues>({
    inventoryOptions: ["status:all"],
  });

  const [editingItem, setEditingItem] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editStock, setEditStock] = useState("0");
  const [editPrice, setEditPrice] = useState("0");
  const [customPercent, setCustomPercent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [editError, setEditError] = useState("");

  const categories = useMemo(
    () => ["All", ...new Set(inventory.map((product) => product.category))],
    [inventory],
  );

  const filterSections: FilterSection[] = [
    {
      key: "inventoryOptions",
      title: "Inventory Options",
      type: "multiple",
      options: [
        { label: "All items", value: "status:all" },
        { label: "Low stock", value: "status:low" },
        { label: "Out of stock", value: "status:out" },
        { label: "Stock: Low to high", value: "sort:stock-low-high" },
        { label: "Stock: High to low", value: "sort:stock-high-low" },
        { label: "Price: High to low", value: "sort:price-desc" },
        { label: "Name: A to Z", value: "sort:name-asc" },
      ],
    },
    {
      key: "priceRange",
      title: "Price Range (₱)",
      type: "range",
    },
  ];

  const filteredProducts = useMemo(() => {
    const options = activeFilters.inventoryOptions ?? [];

    const selectedStatus =
      options.find((value) => value.startsWith("status:")) ?? "status:all";

    const selectedSort = options.find((value) => value.startsWith("sort:"));

    const minText = activeFilters.priceRange?.[0] ?? "";
    const maxText = activeFilters.priceRange?.[1] ?? "";

    const minPrice = minText.trim() === "" ? null : Number(minText);
    const maxPrice = maxText.trim() === "" ? null : Number(maxText);

    const result = inventory.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase());

      const matchesStatus =
        selectedStatus === "status:low"
          ? product.stock > 0 && product.stock < 10
          : selectedStatus === "status:out"
            ? product.stock === 0
            : true;

      const matchesMinPrice =
        minPrice === null ||
        (Number.isFinite(minPrice) && product.price >= minPrice);

      const matchesMaxPrice =
        maxPrice === null ||
        (Number.isFinite(maxPrice) && product.price <= maxPrice);

      return (
        matchesCategory &&
        matchesSearch &&
        matchesStatus &&
        matchesMinPrice &&
        matchesMaxPrice
      );
    });

    return result.sort((a, b) => {
      switch (selectedSort) {
        case "sort:stock-low-high":
          return a.stock - b.stock;
        case "sort:stock-high-low":
          return b.stock - a.stock;
        case "sort:price-desc":
          return b.price - a.price;
        case "sort:name-asc":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [inventory, selectedCategory, searchQuery, activeFilters]);

  const handleResetFilters = () => {
    setActiveFilters({
      inventoryOptions: ["status:all"],
    });
  };

  const stockStats = useMemo(() => {
    const outOfStock = inventory.filter(
      (product) => product.stock === 0,
    ).length;

    const lowStock = inventory.filter(
      (product) => product.stock > 0 && product.stock < 10,
    ).length;

    const totalItems = inventory.reduce(
      (sum, product) => sum + product.stock,
      0,
    );

    return {
      outOfStock,
      lowStock,
      totalItems,
      totalProducts: inventory.length,
    };
  }, [inventory]);

  const beginEditing = (product: Product) => {
    setEditingItem(product);
    setEditName(product.name);
    setEditCategory(product.category);
    setEditStock(String(product.stock));
    setEditPrice(String(product.price));
    setCustomPercent("");
    setNewCategory("");
    setShowNewCategory(false);
    setEditError("");
  };

  const closeEditSheet = () => {
    setEditingItem(null);
    setEditError("");
    setCustomPercent("");
    setNewCategory("");
    setShowNewCategory(false);
  };

  const applyPricePercentage = (percentage: number) => {
    const currentPrice = Number(editPrice);

    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
      setEditError("Enter a valid price before applying an adjustment.");
      return;
    }

    const adjustedPrice = currentPrice * (1 + percentage / 100);

    setEditPrice(Math.max(0, adjustedPrice).toFixed(2));
    setCustomPercent("");
    setEditError("");
  };

  const applyCustomPercentage = () => {
    const percentage = Number(customPercent);

    if (
      customPercent.trim() === "" ||
      !Number.isFinite(percentage) ||
      percentage < -100
    ) {
      setEditError("Enter a valid percentage of -100 or higher.");
      return;
    }

    applyPricePercentage(percentage);
  };

  const saveProduct = () => {
    if (!editingItem) return;

    const name = editName.trim();
    const category = editCategory.trim();
    const price = Number(editPrice);
    const stock = Number(editStock);

    if (!name) {
      setEditError("Product name is required.");
      return;
    }

    if (!category) {
      setEditError("Choose or enter a category.");
      return;
    }

    if (
      editPrice.trim() === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setEditError("Enter a valid price of 0 or higher.");
      return;
    }

    if (
      editStock.trim() === "" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setEditError("Stock must be a whole number of 0 or higher.");
      return;
    }

    const updatedProduct: Product = {
      ...editingItem,
      name,
      category,
      price: Number(price.toFixed(2)),
      stock,
    };

    setInventory((previous) =>
      previous.map((product) =>
        product.id === editingItem.id ? updatedProduct : product,
      ),
    );

    closeEditSheet();
  };

  const addCategory = () => {
    const category = newCategory.trim();

    if (!category) {
      setEditError("Enter a category name first.");
      return;
    }

    setEditCategory(category);
    setNewCategory("");
    setShowNewCategory(false);
    setEditError("");
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const searchBarStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [0, 100],
      [50, 0],
      Extrapolation.CLAMP,
    ),
    marginBottom: interpolate(
      scrollY.value,
      [0, 100],
      [8, 0],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(
      scrollY.value,
      [0, 60],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    overflow: "hidden" as const,
  }));

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
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-8 w-8 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <StyledChevronLeft size={22} className="text-ctp-text" />
          </Pressable>

          <Text className="font-inter-semibold text-lg text-ctp-text">
            Inventory
          </Text>

          <View className="h-8 w-8" />
        </View>

        <Animated.View style={searchBarStyle}>
          <View className="flex-row items-center gap-2">
            <View className="flex-1 justify-center">
              <View
                pointerEvents="none"
                className="absolute left-3 z-10"
              >
                <StyledSearch size={18} className="text-ctp-subtext0" />
              </View>

              <TextInput
                placeholder="Search parts..."
                placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="h-[42px] w-full rounded-md border-[1.5px] border-ctp-surface2 bg-ctp-mantle pl-10 pr-12 font-inter-regular text-ctp-text"
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
                      ? "text-ctp-text"
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
          </View>
        </Animated.View>

        <View className="flex-row flex-wrap justify-between gap-2 pb-4">
          {[
            { label: "Out of stock", value: stockStats.outOfStock },
            { label: "Low stock", value: stockStats.lowStock },
            { label: "Total items", value: stockStats.totalItems },
            { label: "Total products", value: stockStats.totalProducts },
          ].map((stat) => (
            <View
              key={stat.label}
              className="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-2"
              style={{ width: "48%" }}
            >
              <Text className="text-center font-inter-medium text-sm text-ctp-subtext0">
                {stat.label}
              </Text>
              <Text className="text-center font-inter-bold text-base text-ctp-text">
                {stat.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-1">
          <Text className="pb-2 font-inter-semibold text-lg text-ctp-text">
            Categories
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            className="mb-3 mt-2 h-[40px] shrink-0"
          >
            {categories.map((category) => (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                className={`self-start rounded-full px-3 py-[8px] ${selectedCategory === category
                    ? "bg-ctp-surface1"
                    : "bg-transparent"
                  }`}
              >
                <Text
                  className={`font-inter-semibold text-base ${selectedCategory === category
                      ? "text-ctp-text"
                      : "text-ctp-subtext0"
                    }`}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Animated.FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id.toString()}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <StockItem
                item={item}
                openItemId={openItemId}
                onEdit={beginEditing}
              />
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-6">
                <Text className="text-center font-inter-semibold text-base text-ctp-subtext0">
                  {searchQuery.trim()
                    ? `No results matching "${searchQuery}"`
                    : "No products found"}
                </Text>
              </View>
            }
          />
        </View>

        <FilterModal
          visible={filterVisible}
          title="Filter Inventory"
          sections={filterSections}
          initialValues={activeFilters}
          onClose={() => setFilterVisible(false)}
          onApply={setActiveFilters}
          onReset={handleResetFilters}
        />

        {/* Edit Product Bottom Sheet */}
        <Host style={{ position: "absolute", width }}>
          <BottomSheet
            isPresented={editingItem !== null}
            onDismiss={closeEditSheet}
            containerColor={isDark ? "#1E1E2E" : "#EFF1F5"}
          >
            <RNHostView matchContents>
              <View
                style={{ width }}
                className="bg-ctp-base px-5 pb-8 pt-5"
              >
                <View className="mb-6 flex-row items-center justify-between">
                  <Pressable
                    onPress={closeEditSheet}
                    accessibilityRole="button"
                    accessibilityLabel="Close edit product"
                    className="h-9 w-9 items-center justify-center rounded-full bg-ctp-surface0"
                  >
                    <StyledChevronLeft
                      size={20}
                      className="text-ctp-text"
                    />
                  </Pressable>

                  <Text className="font-inter-semibold text-lg text-ctp-text">
                    Edit Product
                  </Text>

                  <View className="h-9 w-9" />
                </View>

                <ScrollView
                  style={{ maxHeight: 590 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View className="mb-4 rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4">
                    <View className="mb-4">
                      <Text className="font-inter-semibold text-lg text-ctp-text">
                        Product details
                      </Text>
                      <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                        Update the product name and inventory category.
                      </Text>
                    </View>

                    <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                      Product Name
                    </Text>
                    <TextInput
                      value={editName}
                      onChangeText={(value) => {
                        setEditName(value);
                        setEditError("");
                      }}
                      placeholder="Enter product name"
                      placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                      selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                      maxLength={120}
                      className="mb-4 rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text"
                    />

                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="font-inter-semibold text-sm text-ctp-text">
                        Category
                      </Text>

                      <Pressable
                        onPress={() => {
                          setShowNewCategory((previous) => !previous);
                          setNewCategory("");
                          setEditError("");
                        }}
                        className="flex-row items-center gap-1 rounded-lg px-2 py-1"
                      >
                        {showNewCategory ? (
                          <StyledX size={15} className="text-ctp-subtext0" />
                        ) : (
                          <StyledPlus size={15} className="text-ctp-blue" />
                        )}
                        <Text className="font-inter-semibold text-xs text-ctp-blue">
                          {showNewCategory ? "Cancel" : "New category"}
                        </Text>
                      </Pressable>
                    </View>

                    {showNewCategory ? (
                      <View className="mb-3 flex-row items-center gap-2">
                        <TextInput
                          value={newCategory}
                          onChangeText={(value) => {
                            setNewCategory(value);
                            setEditError("");
                          }}
                          placeholder="New category name"
                          placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                          selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                          maxLength={60}
                          className="flex-1 rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-regular text-ctp-text"
                        />
                        <Pressable
                          onPress={addCategory}
                          className="items-center justify-center rounded-lg bg-ctp-blue px-4 py-3"
                        >
                          <Text
                            className={`font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
                              }`}
                          >
                            Add
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View className="mb-3 flex-row flex-wrap gap-2">
                        {categories
                          .filter((category) => category !== "All")
                          .map((category) => (
                            <Pressable
                              key={category}
                              onPress={() => {
                                setEditCategory(category);
                                setEditError("");
                              }}
                              className={`rounded-full border px-3 py-2 ${editCategory === category
                                  ? "border-ctp-blue bg-ctp-blue/15"
                                  : "border-ctp-surface2 bg-ctp-base"
                                }`}
                            >
                              <Text
                                className={`font-inter-medium text-xs ${editCategory === category
                                    ? "text-ctp-blue"
                                    : "text-ctp-subtext0"
                                  }`}
                              >
                                {category}
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    )}

                    <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                      Selected category
                    </Text>
                    <Text className="font-inter-medium text-sm text-ctp-subtext0">
                      {editCategory || "No category selected"}
                    </Text>
                  </View>

                  <View className="mb-4 rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4">
                    <Text className="font-inter-semibold text-lg text-ctp-text">
                      Inventory
                    </Text>
                    <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
                      Set the current quantity available in stock.
                    </Text>

                    <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                      Stock Quantity
                    </Text>
                    <TextInput
                      value={editStock}
                      onChangeText={(value) => {
                        setEditStock(value);
                        setEditError("");
                      }}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                      selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                      className="rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text"
                    />

                    <Text className="mt-2 font-inter-regular text-xs text-ctp-subtext0">
                      Set to 0 when the product is out of stock.
                    </Text>
                  </View>

                  <View className="mb-4 rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4">
                    <Text className="font-inter-semibold text-lg text-ctp-text">
                      Product pricing
                    </Text>
                    <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
                      Update the selling price or apply a percentage adjustment.
                    </Text>

                    <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                      Selling Price
                    </Text>

                    <View className="flex-row items-center rounded-lg border border-ctp-surface2 bg-ctp-base px-3">
                      <Text className="mr-2 font-inter-semibold text-ctp-subtext0">
                        ₱
                      </Text>
                      <TextInput
                        value={editPrice}
                        onChangeText={(value) => {
                          setEditPrice(value);
                          setEditError("");
                        }}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        placeholder="0.00"
                        placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                        selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                        className="flex-1 py-3 font-inter-medium text-ctp-text"
                      />
                    </View>

                    <Text className="mb-2 mt-5 font-inter-semibold text-sm text-ctp-text">
                      Quick price adjustment
                    </Text>
                    <View className="flex-row gap-2">
                      {[
                        { label: "-10%", value: -10 },
                        { label: "-5%", value: -5 },
                        { label: "+5%", value: 5 },
                        { label: "+10%", value: 10 },
                      ].map((adjustment) => (
                        <Pressable
                          key={adjustment.label}
                          onPress={() =>
                            applyPricePercentage(adjustment.value)
                          }
                          className="flex-1 items-center rounded-lg border border-ctp-surface2 bg-ctp-base py-3"
                        >
                          <Text
                            className={`font-inter-semibold text-xs ${adjustment.value < 0
                                ? "text-ctp-red"
                                : "text-ctp-green"
                              }`}
                          >
                            {adjustment.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text className="mb-2 mt-4 font-inter-semibold text-sm text-ctp-text">
                      Custom adjustment (%)
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        value={customPercent}
                        onChangeText={(value) => {
                          setCustomPercent(value);
                          setEditError("");
                        }}
                        keyboardType="numbers-and-punctuation"
                        placeholder="e.g. 12 or -5"
                        placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                        selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                        className="flex-1 rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text"
                      />
                      <Pressable
                        onPress={applyCustomPercentage}
                        className="rounded-lg bg-ctp-blue px-4 py-3"
                      >
                        <Text
                          className={`font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
                            }`}
                        >
                          Apply
                        </Text>
                      </Pressable>
                    </View>

                    {editPrice.trim() !== "" &&
                      Number.isFinite(Number(editPrice)) &&
                      Number(editPrice) >= 0 && (
                        <Text className="mt-3 font-inter-regular text-xs text-ctp-subtext0">
                          New selling price: ₱{formatPrice(Number(editPrice))}
                        </Text>
                      )}
                  </View>

                  {editError ? (
                    <View className="mb-4 rounded-xl bg-ctp-red/15 p-3">
                      <Text className="font-inter-medium text-sm text-ctp-red">
                        {editError}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    onPress={closeEditSheet}
                    className="flex-1 rounded-xl border border-ctp-surface2 bg-ctp-mantle p-4"
                  >
                    <Text className="text-center font-inter-semibold text-ctp-text">
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={saveProduct}
                    className="flex-1 flex-row items-center justify-center rounded-xl bg-ctp-blue p-4"
                  >
                    <Text
                      className={`font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
                        }`}
                    >
                      Save Changes
                    </Text>
                  </Pressable>
                </View>
              </View>
            </RNHostView>
          </BottomSheet>
        </Host>
      </View>
    </SafeAreaView>
  );
}

type StockItemProps = {
  item: Product;
  openItemId: SharedValue<number | null>;
  onEdit: (item: Product) => void;
};

function StockItem({ item, openItemId, onEdit }: StockItemProps) {
  const ACTION_WIDTH = 120;
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const activeGestureId = useSharedValue<number | null>(null);

  useAnimatedReaction(
    () => openItemId.value,
    (currentId) => {
      if (currentId !== item.id) {
        translateX.value = withSpring(0);
      }
    },
  );

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const gesture = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onStart(() => {
      if (
        activeGestureId.value !== null &&
        activeGestureId.value !== item.id
      ) {
        return;
      }

      activeGestureId.value = item.id;
      startX.value = translateX.value;
      openItemId.value = item.id;
    })
    .onUpdate((event) => {
      if (activeGestureId.value !== item.id) {
        return;
      }

      translateX.value = Math.max(
        -ACTION_WIDTH,
        Math.min(0, startX.value + event.translationX),
      );
    })
    .onEnd(() => {
      if (translateX.value < -60) {
        translateX.value = withSpring(-ACTION_WIDTH);
      } else {
        translateX.value = withSpring(0);
      }
    });

  return (
    <View className="my-2 overflow-hidden rounded-xl bg-ctp-surface0">
      <View className="absolute right-3 h-full flex-row items-center justify-center gap-6">
        <Pressable
          onPress={() => onEdit(item)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.name}`}
          className="h-[40px] w-[40px] items-center justify-center rounded-lg bg-ctp-mantle"
        >
          <StyledPencil size={20} className="text-ctp-blue" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
          className="h-[40px] w-[40px] items-center justify-center rounded-lg bg-ctp-mantle"
        >
          <StyledTrash size={20} className="text-ctp-red" />
        </Pressable>
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            swipeStyle,
            item.stock === 0
              ? {
                borderWidth: 1,
                borderColor: "#F38BA8",
              }
              : item.stock < 10
                ? {
                  borderWidth: 1,
                  borderColor: "#F9E2AF",
                }
                : {
                  borderWidth: 1,
                  borderColor: "rgba(128, 128, 128, 0.15)",
                },
          ]}
          className="flex-row rounded-xl bg-ctp-mantle"
        >
          <View className="flex-1 flex-row px-3 py-[10px]">
            <View className="h-20 w-20 rounded-lg bg-ctp-surface0" />

            <View className="ml-3 flex-1">
              <Text className="font-inter-medium text-base text-ctp-text">
                {item.name}
              </Text>

              <Text className="font-inter-semibold text-sm text-ctp-subtext0">
                ₱{formatPrice(item.price)}
              </Text>

              <Text
                className={`mt-auto font-inter-semibold text-sm ${item.stock === 0
                    ? "text-ctp-red"
                    : item.stock < 10
                      ? "text-ctp-yellow"
                      : "text-ctp-text"
                  }`}
              >
                Stock: {item.stock}
              </Text>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

