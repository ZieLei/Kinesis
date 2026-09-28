import {
  Text,
  TextInput,
  View,
  ScrollView,
  Pressable,
  Modal,
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
import { Host, BottomSheet, RNHostView } from "@expo/ui"

import products from "@/data/products.json";
import { useCart } from "@/app/context/CartContext";

export default function Stock() {
  const openItemId = useSharedValue<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItem, setEditingItem] =
    useState<(typeof products)[number] | null>(null);
  const { width } = useWindowDimensions();

  const { addToCart, items, decreaseQuantity, total } = useCart();

  const cartItemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  const categories = useMemo(
    () => [
      "All",
      ...new Set(
        products
          .filter((product) => product.stock > 0)
          .map((product) => product.category)
      ),
    ],
    []
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

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
      Extrapolation.CLAMP
    ),
    marginBottom: interpolate(
      scrollY.value,
      [0, 100],
      [20, 0],
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

  const translateX = useSharedValue(0);

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value }
    ],
  }));

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd(() => {

    })

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F5]">
      <View className="flex-1 px-5 pt-7">

        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <View className="h-5 w-5 bg-black/20" />

          <Text className="font-inter-semibold text-lg">
            Inventory
          </Text>

          <View className="h-5 w-5 bg-black/20" />
        </View>

        <Animated.View style={searchBarStyle}>
          <TextInput
            placeholder="Search parts..."
            placeholderTextColor="#666666"
            selectionColor="#000000"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="h-[42px] w-full rounded-md border-[1.5px] border-black/10 bg-white px-3 font-inter-regular"
          />
        </Animated.View>

        <View className="flex-row justify-between py-4">
          <View className="rounded-lg border-[1px] border-black/5 bg-white p-2">
            <Text className="text-center font-inter-medium text-sm">
              Out of stock
            </Text>
            <Text className="text-center font-inter-semibold text-sm">
              0
            </Text>
          </View>

          <View className="rounded-lg border-[1px] border-black/5 bg-white p-2">
            <Text className="text-center font-inter-medium text-sm">
              Low stock
            </Text>
            <Text className="text-center font-inter-semibold text-sm">
              5
            </Text>
          </View>

          <View className="rounded-lg border-[1px] border-black/5 bg-white p-2">
            <Text className="text-center font-inter-medium text-sm">
              Total items
            </Text>
            <Text className="text-center font-inter-semibold text-sm">
              350
            </Text>
          </View>
        </View>

        <View className="flex-1">

          <Text className="font-inter-semibold text-base text-black/80">
            Categories
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            className="mt-2 mb-3 h-[40px] shrink-0"
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
            contentContainerStyle={{
              paddingBottom: 24,
            }}
            renderItem={({ item }) => {
              const cartItem = cartItemsById.get(item.id);

              return (
                <StockItem
                  item={item}
                  openItemId={openItemId}
                  onEdit={(item) => setEditingItem(item)}
                />

              );
            }}
            ListEmptyComponent={
              <View className="items-center justify-center py-3">
                <Text className="text-center font-inter-semibold text-base">
                  {searchQuery.trim()
                    ? `No results matching "${searchQuery}"`
                    : "No products found"}
                </Text>
              </View>
            }
          />
        </View>
        <Host style={{ position: "absolute", width }}>
          <BottomSheet
            isPresented={editingItem !== null}
            onDismiss={() => setEditingItem(null)}
            containerColor="#F5F5F5"
          >
            <RNHostView matchContents>
              <View style={{ width }} className="px-4 py-5">
                <Text className="font-inter-medium text-center text-lg">
                  Edit Product
                </Text>

                <View className="py-5">
                  <View>
                    <Pressable className="bg-white rounded-2xl p-2 flex-row">
                      <View className="bg-black/5 w-20 h-20 rounded-2xl mr-3" />
                      <View className="justify-center">
                        <Text className="font-inter-semibold">
                          Add product image
                        </Text>
                      </View>
                    </Pressable>
                  </View>

                  <Text className="font-inter-medium text-base mt-4">
                    Product Name
                  </Text>

                  <TextInput
                    className="bg-black/5 w-full rounded-2xl px-2"
                    placeholder="Name"
                    placeholderTextColor="#000000"
                  />
                </View>

                <View className="flex-row justify-between">
                  <Pressable
                    onPress={() => setEditingItem(null)}
                    className="bg-black/5 rounded-lg p-4"
                  >
                    <Text className="font-inter-semibold">
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable className="bg-white rounded-lg p-4">
                    <Text className="font-inter-semibold">
                      Done
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
  item: (typeof products)[number];
  openItemId: SharedValue<number | null>;
  onEdit: (item: (typeof products)[number]) => void;
};

function StockItem({ item, openItemId, onEdit }: StockItemProps) {
  const ACTION_WIDTH = 120;
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const pointerCount = useSharedValue(0);
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
    transform: [
      {
        translateX: translateX.value
      },
    ],
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
      <View className="absolute right-3 h-full justify-center items-center gap-6 flex-row">

        <Pressable
          onPress={() => onEdit(item)}
          className="h-[40px] rounded-lg w-[40px] items-center justify-center bg-white/80">
          <Text className="font-inter-semibold text-blue-800">
            E
          </Text>
        </Pressable>

        <Pressable className="h-[40px] rounded-lg w-[40px] items-center justify-center bg-white/80">
          <Text className="font-inter-semibold text-red-800">
            D
          </Text>
        </Pressable>

      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={swipeStyle}
          className="flex-row rounded-xl bg-white">
          <View
            className="flex-1 flex-row px-3 py-[10px]"
          >
            <View className="h-20 w-20 rounded-lg bg-black/10" />

            <View className="ml-3 flex-1">
              <Text className="font-inter-medium text-base">
                {item.name}
              </Text>

              <Text className="font-inter-semibold text-sm text-black/60">
                ₱
                {item.price.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>

              <Text className="mt-auto font-inter-medium text-sm">
                Stock: {item.stock}
              </Text>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );

}
