
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
import Circle from "lucide-react-native/icons/circle";

import products from "@/data/products.json";
import FilterModal, {
  FilterSection,
  FilterValues,
} from "@/components/modals/FilterModal";

type Product = (typeof products)[number];

const formatPrice = (price: number) =>
  price.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Stock() {
  const openItemId = useSharedValue<number | null>(null);
  const scrollY = useSharedValue(0);

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

  const { width } = useWindowDimensions();

  const categories = useMemo(
    () => [
      "All",
      ...new Set(inventory.map((product) => product.category)),
    ],
    [inventory]
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
      options.find((value) => value.startsWith("status:")) ??
      "status:all";

    const selectedSort = options.find((value) =>
      value.startsWith("sort:")
    );

    const minText = activeFilters.priceRange?.[0] ?? "";
    const maxText = activeFilters.priceRange?.[1] ?? "";

    const minPrice = minText.trim() === "" ? null : Number(minText);
    const maxPrice = maxText.trim() === "" ? null : Number(maxText);

    const result = inventory.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

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
      (product) => product.stock === 0
    ).length;

    const lowStock = inventory.filter(
      (product) => product.stock > 0 && product.stock < 10
    ).length;

    const totalItems = inventory.reduce(
      (sum, product) => sum + product.stock,
      0
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
  };

  const applyPricePercentage = (percentage: number) => {
    if (!editingItem) return;

    const adjustedPrice =
      editingItem.price * (1 + percentage / 100);

    setEditPrice(
      Math.max(0, adjustedPrice).toFixed(2)
    );
  };

  const saveProduct = () => {
    if (!editingItem) return;

    const name = editName.trim();
    const price = Number(editPrice);
    const stock = Number(editStock);

    if (!name) {
      return;
    }

    if (
      editPrice.trim() === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return;
    }

    if (
      editStock.trim() === "" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return;
    }

    const updatedProduct: Product = {
      ...editingItem,
      name,
      category: editCategory,
      price: Number(price.toFixed(2)),
      stock,
    };

    setInventory((previous) =>
      previous.map((product) =>
        product.id === editingItem.id
          ? updatedProduct
          : product
      )
    );

    setEditingItem(null);
  };

  const addCategory = () => {
    const category = newCategory.trim();

    if (!category) return;

    setEditCategory(category);
    setNewCategory("");
    setShowNewCategory(false);
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
      Extrapolation.CLAMP
    ),
    marginBottom: interpolate(
      scrollY.value,
      [0, 100],
      [8, 0],
      Extrapolation.CLAMP
    ),
    opacity: interpolate(
      scrollY.value,
      [0, 60],
      [1, 0],
      Extrapolation.CLAMP
    ),
    overflow: "hidden",
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
    <SafeAreaView className="flex-1 bg-[#F5F5F5]">
      <View className="flex-1 px-5 pt-7">
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-5 w-5 items-center justify-center"
          >
            <ChevronLeft size={22} color="#000000" />
          </Pressable>

          <Text className="font-inter-semibold text-lg">
            Inventory
          </Text>

          <View className="h-5 w-5 items-center justify-center" />
        </View>

        <Animated.View style={searchBarStyle}>
          <View className="flex-row items-center gap-2">
            <View className="flex-1 justify-center">
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
                onChangeText={setSearchQuery}
                className="h-[42px] w-full rounded-md border-[1.5px] border-black/10 bg-white pl-10 pr-12 font-inter-regular"
              />

              <Pressable
                onPress={() => setFilterVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Filter products"
                className="absolute right-2 z-10 h-9 min-w-9 flex-row items-center justify-center rounded-md px-1"
              >
                <Funnel
                  size={18}
                  color={activeFilterCount > 0 ? "#000000" : "#666666"}
                />

                {activeFilterCount > 0 && (
                  <View className="ml-1 h-5 min-w-5 items-center justify-center rounded-full bg-black px-1">
                    <Text className="font-inter-semibold text-xs text-white">
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
              className="rounded-lg border-[1px] border-black/5 bg-white p-2"
              style={{ width: "48%" }}
            >
              <Text className="text-center font-inter-medium text-sm text-black/70">
                {stat.label}
              </Text>
              <Text className="text-center font-inter-bold text-base">
                {stat.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-1">
          <Text className="pb-2 font-inter-semibold text-lg text-black/80">
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
                  ? "bg-black/5"
                  : "bg-transparent"
                  }`}
              >
                <Text
                  className={`font-inter-semibold text-base ${selectedCategory === category
                    ? "text-black"
                    : "text-black/70"
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
                <Text className="text-center font-inter-semibold text-base">
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

        <Host style={{ position: "absolute", width }}>
          <BottomSheet
            isPresented={editingItem !== null}
            onDismiss={() => setEditingItem(null)}
            containerColor="#F5F5F5"
          >
            <RNHostView matchContents>
              <View style={{ width }} className="px-5 pb-8 pt-5">
                <View className="mb-6 flex-row items-center justify-between">
                  <Pressable
                    onPress={() => setEditingItem(null)}
                    className="h-9 w-9 items-center justify-center rounded-full bg-black/5"
                  >
                    <ChevronLeft size={20} color="#000000" />
                  </Pressable>

                  <Text className="font-inter-semibold text-lg">
                    Edit Product
                  </Text>

                  <View className="h-9 w-9" />
                </View>

                <ScrollView
                  style={{ maxHeight: 590 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View className="mb-4 rounded-2xl border border-black/5 bg-white p-4">
                    <View className="mb-3">
                      <Text className="font-inter-semibold text-lg">
                        Product details
                      </Text>
                      <Text className="mt-1 font-inter-regular text-xs text-black/50">
                        Update the information for this item.
                      </Text>
                    </View>

                    <Pressable
                      className="mb-3 aspect-square w-full items-center justify-center rounded-xl bg-black/5"
                      style={{
                        borderWidth: 1,
                        borderColor: "rgb(0,0,0,0.3)",
                        borderStyle: "dashed",
                      }}
                    >
                      <Text className="font-inter-medium text-sm py-8 text-black/50">
                        Add Image
                      </Text>
                    </Pressable>

                    <Text className="mb-2 font-inter-semibold text-sm">
                      Product Name
                    </Text>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Enter product name"
                      placeholderTextColor="rgba(0,0,0,0.35)"
                      selectionColor="#000000"
                      className="rounded-lg border border-black/10 bg-[#F8F8F8] px-3 py-3 font-inter-medium text-black"
                    />
                  </View>

                  <View className="mb-4 rounded-2xl border border-black/5 bg-white p-4">
                    <Text className="mb-1 font-inter-semibold text-lg">
                      Stock quantity
                    </Text>
                    <Text className="mb-4 font-inter-regular text-xs text-black/50">
                      Set the available quantity for this product.
                    </Text>

                    <View className="flex-row items-center justify-between rounded-xl bg-[#F5F5F5] p-3">
                      <Pressable
                        onPress={() =>
                          setEditStock((current) =>
                            String(Math.max(0, (Number(current) || 0) - 1))
                          )
                        }
                        className="h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-white"
                      >
                        <Text className="font-inter-semibold text-xl">−</Text>
                      </Pressable>

                      <View className="w-40 px-1">
                        <TextInput
                          value={editStock}
                          onChangeText={(value) =>
                            setEditStock(value.replace(/[^0-9]/g, ""))
                          }
                          keyboardType="number-pad"
                          inputMode="numeric"
                          selectTextOnFocus
                          className="text-center justify-center font-inter-semibold text-2xl text-black bg-white h-13 rounded-lg border border-black/20"
                        />
                        <Text className="text-center font-inter-regular text-xs text-black/50">
                          units in stock
                        </Text>
                      </View>

                      <Pressable
                        onPress={() =>
                          setEditStock((current) =>
                            String((Number(current) || 0) + 1)
                          )
                        }
                        className="h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-white"
                      >
                        <Text className="font-inter-semibold text-xl text-black">
                          +
                        </Text>
                      </Pressable>
                    </View>

                    <View className="mt-3 flex-row gap-2">
                      <View
                        className={`flex-1 rounded-lg p-3 ${Number(editStock) === 0
                          ? "bg-red-50"
                          : Number(editStock) < 10
                            ? "bg-yellow-50"
                            : "bg-green-50"
                          }`}
                      >
                        <Text
                          className={`text-center font-inter-semibold text-sm ${Number(editStock) === 0
                            ? "text-red-700"
                            : Number(editStock) < 10
                              ? "text-yellow-800"
                              : "text-green-800"
                            }`}
                        >
                          {Number(editStock) === 0
                            ? "Out of stock"
                            : Number(editStock) < 10
                              ? "Low stock"
                              : "In stock"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="mb-4 rounded-2xl border border-black/5 bg-white p-4">
                    <Text className="mb-1 font-inter-semibold text-lg">
                      Category
                    </Text>
                    <Text className="mb-3 font-inter-regular text-xs text-black/50">
                      Choose an existing category.
                    </Text>

                    <View className="flex-row flex-wrap gap-2">
                      {categories
                        .filter((category) => category !== "All")
                        .map((category) => (
                          <Pressable
                            key={category}
                            onPress={() => setEditCategory(category)}
                            className={`rounded-full border px-3 py-2 ${editCategory === category
                              ? "border-blue-900"
                              : "border-black/10"
                              }`}
                          >
                            <Text
                              className={`font-inter-medium text-sm ${editCategory === category
                                ? "text-black"
                                : "text-black"
                                }`}
                            >
                              {category}
                            </Text>
                          </Pressable>
                        ))}
                    </View>

                    <Pressable
                      onPress={() => setShowNewCategory((value) => !value)}
                      className="mt-3 self-start rounded-lg border border-dashed border-black/20 px-3 py-2"
                    >
                      <Text className="font-inter-semibold text-sm text-black/70">
                        + Add category
                      </Text>
                    </Pressable>

                    {showNewCategory && (
                      <View className="mt-3 flex-row gap-2">
                        <TextInput
                          value={newCategory}
                          onChangeText={setNewCategory}
                          placeholder="New category name"
                          placeholderTextColor="rgba(0,0,0,0.35)"
                          className="flex-1 rounded-lg border border-black/10 bg-[#F8F8F8] px-3 py-2 font-inter-regular text-black"
                        />
                        <Pressable
                          onPress={addCategory}
                          className="justify-center rounded-lg bg-blue-900 px-4"
                        >
                          <Text className="font-inter-semibold text-white">
                            Add
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  <View className="mb-4 rounded-2xl border border-black/5 bg-white p-4">
                    <Text className="mb-1 font-inter-semibold text-base">
                      Price management
                    </Text>
                    <Text className="mb-4 font-inter-regular text-xs text-black/50">
                      Percentage changes are calculated from the original
                      product price, not compounded.
                    </Text>

                    <View className="mb-4 rounded-xl bg-[#F5F5F5] p-3">
                      <Text className="font-inter-regular text-xs text-black/50">
                        Original price
                      </Text>
                      <Text className="mt-1 font-inter-semibold text-lg">
                        ₱{formatPrice(editingItem?.price ?? 0)}
                      </Text>
                    </View>

                    <Text className="mb-2 font-inter-semibold text-sm">
                      Quick price adjustments
                    </Text>

                    <View className="mb-2 flex-row gap-2">
                      {[-10, -5, 5, 10].map((percentage) => (
                        <Pressable
                          key={percentage}
                          onPress={() => applyPricePercentage(percentage)}
                          className={`flex-1 items-center rounded-lg border p-3 ${percentage < 0
                            ? "border-red-100 bg-red-50"
                            : "border-green-100 bg-green-50"
                            }`}
                        >
                          <Text
                            className={`font-inter-semibold text-sm ${percentage < 0
                              ? "text-red-700"
                              : "text-green-800"
                              }`}
                          >
                            {percentage > 0 ? "+" : ""}
                            {percentage}%
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View className="mb-4 flex-row gap-2">
                      {[15, 20].map((percentage) => (
                        <Pressable
                          key={percentage}
                          onPress={() => applyPricePercentage(percentage)}
                          className="flex-1 items-center rounded-lg border border-green-100 bg-green-50 p-3"
                        >
                          <Text className="font-inter-semibold text-sm text-green-800">
                            +{percentage}%
                          </Text>
                        </Pressable>
                      ))}

                      <Pressable
                        onPress={() => {
                          if (editingItem) {
                            setEditPrice(editingItem.price.toFixed(2));
                          }
                        }}
                        className="flex-1 items-center rounded-lg border border-black/10 bg-[#F8F8F8] p-3"
                      >
                        <Text className="font-inter-semibold text-sm">
                          Reset
                        </Text>
                      </Pressable>
                    </View>

                    <Text className="mb-2 mt-2 font-inter-semibold text-sm">
                      Custom percentage
                    </Text>

                    <View className="flex-row gap-2">
                      <View className="flex-1 flex-row items-center rounded-lg border border-black/10 bg-[#F8F8F8] px-3">
                        <TextInput
                          value={customPercent}
                          onChangeText={setCustomPercent}
                          keyboardType="numbers-and-punctuation"
                          inputMode="decimal"
                          placeholder="e.g. 12 or -8"
                          placeholderTextColor="rgba(0,0,0,0.35)"
                          className="flex-1 py-3 font-inter-medium text-black"
                        />
                        <Text className="font-inter-semibold text-black/50">
                          %
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => {
                          const percentage = Number(customPercent);

                          if (
                            customPercent.trim() !== "" &&
                            Number.isFinite(percentage) &&
                            percentage >= -100 &&
                            editingItem
                          ) {
                            applyPricePercentage(percentage);
                          }
                        }}
                        className="justify-center rounded-lg bg-blue-900 px-4"
                      >
                        <Text className="font-inter-semibold text-white">
                          Apply
                        </Text>
                      </Pressable>
                    </View>

                    <Text className="mb-2 mt-5 font-inter-semibold text-sm">
                      Final selling price
                    </Text>

                    <View className="flex-row items-center rounded-lg border border-black/10 bg-[#F8F8F8] px-3">
                      <Text className="mr-2 font-inter-semibold text-black/60">
                        ₱
                      </Text>
                      <TextInput
                        value={editPrice}
                        onChangeText={setEditPrice}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        placeholder="Enter price"
                        placeholderTextColor="rgba(0,0,0,0.35)"
                        className="flex-1 py-3 font-inter-semibold text-lg text-black"
                      />
                    </View>

                    {editPrice.trim() !== "" &&
                      Number.isFinite(Number(editPrice)) &&
                      Number(editPrice) >= 0 && (
                        <Text className="mt-2 font-inter-regular text-xs text-black/50">
                          Current selling price: ₱
                          {formatPrice(Number(editPrice))}
                        </Text>
                      )}
                  </View>
                </ScrollView>

                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    onPress={() => setEditingItem(null)}
                    className="flex-1 rounded-xl border border-black/20 bg-white p-4"
                  >
                    <Text className="text-center font-inter-semibold">
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={saveProduct}
                    className="flex-1 rounded-xl bg-black p-4"
                  >
                    <Text className="text-center font-inter-semibold text-white">
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

function StockItem({
  item,
  openItemId,
  onEdit,
}: StockItemProps) {
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
    }
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
        Math.min(0, startX.value + event.translationX)
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
    <View className="my-2 overflow-hidden rounded-xl bg-black/5">
      <View className="absolute right-3 h-full flex-row items-center justify-center gap-6">
        <Pressable
          onPress={() => onEdit(item)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.name}`}
          className="h-[40px] w-[40px] items-center justify-center rounded-lg bg-white/80"
        >
          <Pencil size={20} color="#1e40af" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
          className="h-[40px] w-[40px] items-center justify-center rounded-lg bg-white/80"
        >
          <Trash size={20} color="#dc2626" />
        </Pressable>
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            swipeStyle,
            item.stock === 0
              ? {
                borderWidth: 1,
                borderColor: "#ef4444",
              }
              : item.stock < 10
                ? {
                  borderWidth: 1,
                  borderColor: "#e8b900",
                }
                : {
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.1)",
                },
          ]}
          className="flex-row rounded-xl bg-white"
        >
          <View className="flex-1 flex-row px-3 py-[10px]">
            <View className="h-20 w-20 rounded-lg bg-black/10" />

            <View className="ml-3 flex-1">
              <Text className="font-inter-medium text-base">
                {item.name}
              </Text>

              <Text className="font-inter-semibold text-sm text-black/60">
                ₱{formatPrice(item.price)}
              </Text>

              <Text
                className={`mt-auto font-inter-semibold text-sm ${item.stock === 0
                  ? "text-red-800"
                  : item.stock < 10
                    ? "text-yellow-600"
                    : "text-black"
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
