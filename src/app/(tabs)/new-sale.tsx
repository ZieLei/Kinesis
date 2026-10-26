
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useFocusEffect, router } from "expo-router";
import { useCart } from "../context/CartContext";
import { useColorScheme } from "nativewind";

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Search from "lucide-react-native/icons/search";
import Camera from "lucide-react-native/icons/focus";
import ImageOff from "lucide-react-native/icons/image-off";
import RefreshCw from "lucide-react-native/icons/refresh-cw";

import { styledIcon } from "@/components/StyledIcon";

const ChevronLeftIcon = styledIcon(ChevronLeft);
const SearchIcon = styledIcon(Search);
const CameraIcon = styledIcon(Camera);
const ImageOffIcon = styledIcon(ImageOff);
const RefreshCwIcon = styledIcon(RefreshCw);

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://192.168.254.199:8000"
).replace(/\/+$/, "");

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15000;

type Product = {
  id: number;
  sku: string | null;
  name: string;
  category: string;
  price: number;
  stock: number;
  howMuchSold: number;
  image_path: string | null;
  image_url: string | null;
};

type ProductPage = {
  items: Product[];
  limit: number;
  offset: number;
  count: number;
};

async function apiRequest<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const abortRequest = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abortRequest, { once: true });
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Request failed (${response.status}).`;

      try {
        const body = await response.json();

        if (typeof body.detail === "string") {
          message = body.detail;
        }
      } catch {
        // Keep the HTTP status message if the response isn't JSON.
      }

      throw new Error(message);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Loading products timed out. Check your Wi-Fi and backend.",
      );
    }

    if (error instanceof Error && error.message.startsWith("Request failed")) {
      throw error;
    }

    console.error("[New Sale] API request failed:", error);

    throw new Error(
      `Cannot reach Kinesis at ${API_BASE_URL}. Check that FastAPI is running and your phone can reach your laptop.`,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
}

function getImageUri(product: Product): string | null {
  if (!product.image_url) return null;

  const imageUrl = product.image_url.startsWith("http://") ||
    product.image_url.startsWith("https://")
    ? product.image_url
    : `${API_BASE_URL}${product.image_url.startsWith("/") ? "" : "/"}${product.image_url}`;

  return imageUrl;
}

function formatPrice(value: number): string {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function NewSale() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [failedImages, setFailedImages] = useState<number[]>([]);

  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const { addToCart, items, decreaseQuantity, total } = useCart();

  const cartItemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const loadProducts = useCallback(
    async (isRefresh = false, signal?: AbortSignal) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setLoadError("");

      try {
        const allProducts: Product[] = [];
        let offset = 0;
        let totalCount = 0;

        do {
          const page = await apiRequest<ProductPage>(
            `/api/products?limit=${PAGE_SIZE}&offset=${offset}`,
            signal,
          );

          if (
            !page ||
            !Array.isArray(page.items) ||
            !Number.isFinite(page.count)
          ) {
            throw new Error("The backend returned an invalid product list.");
          }

          allProducts.push(...page.items);
          totalCount = page.count;

          if (page.items.length === 0) break;

          offset += page.items.length;
        } while (offset < totalCount);

        if (signal?.aborted) return;

        setProducts(allProducts);
        setFailedImages([]);
      } catch (error) {
        if (signal?.aborted) return;

        console.error("[New Sale] Product loading failed:", error);

        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load products. Please try again.",
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  // Load when this screen is focused and cancel requests on blur/unmount.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();

      void loadProducts(false, controller.signal);

      return () => {
        controller.abort();
      };
    }, [loadProducts]),
  );

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(
          products
            .filter((product) => product.stock > 0)
            .map((product) => product.category),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [products],
  );

  // Reset a removed category to All when inventory changes.
  useEffect(() => {
    if (
      selectedCategory !== "All" &&
      !categories.includes(selectedCategory)
    ) {
      setSelectedCategory("All");
    }
  }, [categories, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const matchesSearch =
        product.name.toLowerCase().includes(normalizedQuery) ||
        (product.sku ?? "").toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const scrollY = useSharedValue(0);

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
      [20, 0],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(
      scrollY.value,
      [0, 60],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const handleAddToCart = useCallback(
    (product: Product) => {
      const existingCartItem = cartItemsById.get(product.id);

      // Do not add more units than the inventory currently reports.
      if (
        existingCartItem &&
        existingCartItem.quantity >= product.stock
      ) {
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
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-8 w-8 items-center justify-center"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeftIcon size={22} className="text-ctp-text" />
          </Pressable>

          <Text className="font-inter-semibold text-lg text-ctp-text">
            New Sale
          </Text>

          <Pressable
            onPress={() => router.push("/")}
            className="h-8 w-8 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Scan product"
          >
            <CameraIcon size={22} className="text-ctp-text" />
          </Pressable>
        </View>

        {/* Search */}
        <Animated.View style={[searchBarStyle, { overflow: "hidden" }]}>
          <View className="justify-center">
            <View
              pointerEvents="none"
              className="absolute left-3 z-10"
            >
              <SearchIcon size={18} className="text-ctp-subtext0" />
            </View>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search parts or SKU..."
              placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
              selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
              accessibilityLabel="Search products"
              returnKeyType="search"
              className="h-[42px] w-full rounded-md border-[1.5px] border-ctp-surface2 bg-ctp-mantle pl-10 pr-3 font-inter-regular text-ctp-text"
            />
          </View>
        </Animated.View>

        <View className="flex-1">
          {/* Categories */}
          <Text className="font-inter-semibold text-base text-ctp-text">
            Categories
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            className="mb-3 mt-2 h-[40px] shrink-0"
          >
            {categories.map((category) => {
              const isSelected = selectedCategory === category;

              return (
                <Pressable
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={`self-start rounded-full px-3 py-[8px] ${isSelected ? "bg-ctp-surface1" : "bg-transparent"
                    }`}
                >
                  <Text
                    className={`font-inter-semibold text-base ${isSelected ? "text-ctp-text" : "text-ctp-subtext0"
                      }`}
                  >
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Loading / error / products */}
          {loading && products.length === 0 ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator
                size="large"
                color={isDark ? "#89B4FA" : "#1E66F5"}
              />
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
                onPress={() => void loadProducts()}
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
                  onPress={() => void loadProducts(true)}
                  className="mb-2 rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-3"
                >
                  <Text className="font-inter-medium text-xs text-ctp-red">
                    Refresh failed. Showing previously loaded products. Tap to retry.
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
                    onRefresh={() => void loadProducts(true)}
                    tintColor={isDark ? "#89B4FA" : "#1E66F5"}
                  />
                }
                contentContainerStyle={{
                  paddingBottom: 24,
                }}
                renderItem={({ item }) => {
                  const cartItem = cartItemsById.get(item.id);
                  const imageUri = getImageUri(item);
                  const imageFailed = failedImages.includes(item.id);
                  const atStockLimit =
                    !!cartItem && cartItem.quantity >= item.stock;

                  return (
                    <View className="my-2 flex-row rounded-xl border border-ctp-surface0 bg-ctp-mantle">
                      <Pressable
                        onPress={() => handleAddToCart(item)}
                        disabled={item.stock <= 0 || atStockLimit}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${item.name} to cart`}
                        accessibilityState={{
                          disabled: item.stock <= 0 || atStockLimit,
                        }}
                        className={`flex-1 flex-row px-3 py-[10px] ${item.stock <= 0 || atStockLimit ? "opacity-60" : ""
                          }`}
                        android_ripple={{
                          color: "rgba(128, 128, 128, 0.12)",
                        }}
                      >
                        {/* Product image */}
                        <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-ctp-surface0">
                          {imageUri && !imageFailed ? (
                            <Image
                              source={{ uri: imageUri }}
                              resizeMode="cover"
                              className="h-full w-full"
                              onError={() => {
                                setFailedImages((previous) =>
                                  previous.includes(item.id)
                                    ? previous
                                    : [...previous, item.id],
                                );
                              }}
                            />
                          ) : (
                            <ImageOffIcon
                              size={22}
                              className="text-ctp-subtext0"
                            />
                          )}
                        </View>

                        <View className="ml-3 flex-1">
                          <Text
                            numberOfLines={2}
                            className="font-inter-medium text-base text-ctp-text"
                          >
                            {item.name}
                          </Text>

                          {item.sku ? (
                            <Text
                              numberOfLines={1}
                              className="mt-0.5 font-inter-regular text-xs text-ctp-subtext0"
                            >
                              SKU: {item.sku}
                            </Text>
                          ) : null}

                          <Text className="font-inter-semibold text-sm text-ctp-subtext0">
                            ₱{formatPrice(item.price)}
                          </Text>

                          <Text
                            className={`mt-auto font-inter-medium text-sm ${item.stock <= 0
                                ? "text-ctp-red"
                                : "text-ctp-subtext1"
                              }`}
                          >
                            {item.stock <= 0
                              ? "Out of stock"
                              : `Stock: ${item.stock}`}
                          </Text>
                        </View>
                      </Pressable>

                      {/* Decrease quantity */}
                      {cartItem ? (
                        <Pressable
                          onPress={() => decreaseQuantity(item.id)}
                          disabled={cartItem.quantity <= 0}
                          accessibilityRole="button"
                          accessibilityLabel={`Decrease ${item.name} quantity`}
                          className="mr-2 mt-2 h-8 w-[60px] flex-row items-center justify-center rounded-lg border border-ctp-surface2 bg-ctp-base"
                        >
                          <View className="flex-row items-center justify-evenly gap-1">
                            <View className="w-5">
                              <Text className="text-center font-inter-medium text-ctp-text">
                                {cartItem.quantity}
                              </Text>
                            </View>

                            <View className="h-8 w-6 items-center justify-center">
                              <Text className="text-center font-inter-medium text-xl text-ctp-text">
                                −
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                }}
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

          {/* Bottom checkout bar */}
          <View
            className="-mx-5 flex-row items-center rounded-tl-lg rounded-tr-lg border-t border-l border-r border-ctp-surface0 bg-ctp-mantle px-5 py-4"
            style={{
              boxShadow: "0px -4px 10px 1px rgba(0, 0, 0, 0.05)",
              zIndex: 0,
              elevation: 0,
            }}
          >
            <View>
              <Text className="mr-1 font-inter-bold text-lg text-ctp-text">
                Total:
              </Text>

              <Text className="font-inter-semibold text-base text-ctp-subtext1">
                ₱{formatPrice(total)}
              </Text>
            </View>

            <View className="ml-auto flex-row gap-3">
              <Pressable
                onPress={() => router.push("/cart")}
                className="rounded-lg bg-ctp-surface1 px-3 py-2"
                accessibilityRole="button"
              >
                <Text className="font-inter-semibold text-sm text-ctp-text">
                  Cart
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/checkout")}
                className="rounded-lg bg-ctp-blue px-3 py-2"
                accessibilityRole="button"
              >
                <Text
                  className={`font-inter-semibold text-sm ${isDark ? "text-ctp-crust" : "text-white"
                    }`}
                >
                  Checkout
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
