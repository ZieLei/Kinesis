import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import products from '@/data/products.json';
import { useMemo, useState } from 'react';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useCart } from '../context/CartContext';
import { router } from 'expo-router';

import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Search from 'lucide-react-native/icons/search';
import Camera from 'lucide-react-native/icons/focus';

import { styledIcon } from '@/components/StyledIcon';

const ChevronLeftIcon = styledIcon(ChevronLeft);
const SearchIcon = styledIcon(Search);
const CameraIcon = styledIcon(Camera);

export default function NewSale() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const { addToCart, items, decreaseQuantity, total } = useCart();

  const cartItemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  const categories = useMemo(
    () => [
      'All',
      ...new Set(
        products
          .filter((product) => product.stock > 0)
          .map((product) => product.category),
      ),
    ],
    [],
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'All' ||
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

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-8 w-8 items-center justify-center"
            hitSlop={8}
          >
            <ChevronLeftIcon
              size={22}
              className="text-ctp-text"
            />
          </Pressable>

          <Text className="font-inter-semibold text-lg text-ctp-text">
            New Sale
          </Text>

          <Pressable
            className="h-8 w-8 items-center justify-center"
            accessibilityLabel="Scan product"
          >
            <CameraIcon
              size={22}
              className="text-ctp-text"
            />
          </Pressable>
        </View>

        {/* Search */}
        <Animated.View
          style={[searchBarStyle, { overflow: 'hidden' }]}
        >
          <View className="justify-center">
            <View
              pointerEvents="none"
              className="absolute left-3 z-10"
            >
              <SearchIcon
                size={18}
                className="text-ctp-subtext0"
              />
            </View>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search parts..."
              placeholderTextColor="#A6ADC8"
              selectionColor="#89B4FA"
              style={{
                fontFamily: 'Inter',
                fontWeight: '400',
              }}
              className="h-[42px] w-full rounded-md border border-ctp-surface2 bg-ctp-mantle pl-10 pr-3 text-ctp-text"
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
                  className={`self-start rounded-full px-3 py-[8px] ${isSelected
                      ? 'bg-ctp-surface1'
                      : 'bg-transparent'
                    }`}
                >
                  <Text
                    className={`font-inter-semibold text-base ${isSelected
                        ? 'text-ctp-text'
                        : 'text-ctp-subtext0'
                      }`}
                  >
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Products */}
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
                <View className="my-2 flex-row rounded-xl border border-ctp-surface0 bg-ctp-mantle">
                  <Pressable
                    onPress={() => {
                      addToCart({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                      });
                    }}
                    className="flex-1 flex-row px-3 py-[10px]"
                    android_ripple={{
                      color: 'rgba(128, 128, 128, 0.12)',
                    }}
                  >
                    {/* Product image placeholder */}
                    <View className="h-20 w-20 rounded-lg bg-ctp-surface0" />

                    <View className="ml-3 flex-1">
                      <Text className="font-inter-medium text-base text-ctp-text">
                        {item.name}
                      </Text>

                      <Text className="font-inter-semibold text-sm text-ctp-subtext0">
                        ₱
                        {item.price.toLocaleString('en-PH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>

                      <Text className="mt-auto font-inter-medium text-sm text-ctp-subtext1">
                        Stock: {item.stock}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Decrease quantity */}
                  {cartItem && (
                    <Pressable
                      onPress={() => decreaseQuantity(item.id)}
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
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="items-center justify-center py-6">
                <Text className="text-center font-inter-semibold text-base text-ctp-subtext0">
                  {searchQuery.trim()
                    ? `No results matching "${searchQuery}"`
                    : 'No products found'}
                </Text>
              </View>
            }
          />

          {/* Bottom checkout bar */}
          <View
            className="-mx-5 flex-row items-center rounded-tl-lg rounded-tr-lg border-t border-ctp-surface0 bg-ctp-mantle px-5 py-5"
            style={{
              boxShadow: '0px -4px 10px 1px rgba(0, 0, 0, 0.05)',
              zIndex: 0,
              elevation: 0,
            }}
          >
            <View>
              <Text className="mr-1 font-inter-bold text-lg text-ctp-text">
                Total:
              </Text>

              <Text className="font-inter-semibold text-base text-ctp-subtext1">
                ₱
                {total.toLocaleString('en-PH', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            <View className="ml-auto flex-row gap-3">
              <Pressable
                onPress={() => router.push('/cart')}
                className="rounded-lg bg-ctp-surface1 px-3 py-2"
              >
                <Text className="font-inter-semibold text-sm text-ctp-text">
                  Cart
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/checkout')}
                className="rounded-lg bg-ctp-blue px-3 py-2"
              >
                <Text className="font-inter-semibold text-sm text-ctp-crust">
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
