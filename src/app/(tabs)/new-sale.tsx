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
import { router } from 'expo-router'

export default function NewSale() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const { addToCart, items, decreaseQuantity, total } = useCart();

  const categories = useMemo(() => [
    'All',
    ...new Set(
      products
        .filter((product) => product.stock > 0)
        .map((product) => product.category)
    ),
  ], []);

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
  }));

  return (
    <SafeAreaView className="bg-[#F5F5F5] flex-1">
      <View className="flex-1 px-5 pt-7">

        <View className="mb-5 flex-row items-center justify-between">
          <View className="h-5 w-5 bg-black/20" />

          <Text className="font-inter-semibold text-lg">
            New Sale
          </Text>

          <View className="h-5 w-5 bg-black/20" />
        </View>

        <Animated.View
          style={[searchBarStyle, { overflow: 'hidden' }]}
        >
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search parts..."
            placeholderTextColor="#666666"
            selectionColor="#000000"
            style={{
              fontFamily: 'Inter',
              fontWeight: '400',
            }}
            className="h-[42px] w-full rounded-md border-[1.5px] border-black/10 bg-white px-3 font-inter-regular"
          />
        </Animated.View>

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
                  ? 'bg-black/5'
                  : 'bg-transparent'
                  }`}
              >
                <Text
                  className={`font-inter-semibold text-base ${selectedCategory === category
                    ? 'text-black'
                    : 'text-black/70'
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
              const cartItem = items.find(
                (cartItem) => cartItem.id === item.id
              );

              return (
                <View className="my-2 flex-row rounded-xl bg-white">
                  <Pressable
                    onPress={() =>
                      addToCart({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                      })
                    }
                    className="flex-1 flex-row px-3 py-[10px]"
                    android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
                  >
                    <View className="h-20 w-20 rounded-lg bg-black/10" />

                    <View className="ml-3 flex-1">
                      <Text className="font-inter-medium text-base">
                        {item.name}
                      </Text>

                      <Text className="font-inter-semibold text-sm text-black/60">
                        ₱{item.price.toLocaleString('en-PH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>

                      <Text className="mt-auto font-inter-medium text-sm">
                        Stock: {item.stock}
                      </Text>
                    </View>
                  </Pressable>

                  {cartItem && (
                    <Pressable
                      onPress={() => decreaseQuantity(item.id)}
                      className="w-14 "
                    >
                      <View className="flex-row items-center gap-3 ">
                        <Text className="font-inter-medium">{cartItem?.quantity}</Text>
                        <View className="h-8 w-8 items-center justify-center rounded-lg bg-white border-[1px] border-black/10">
                          <Text className="font-inter-medium text-xl">−</Text>
                        </View>
                      </View>
                    </Pressable>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="items-center justify-center py-3">
                <Text className="font-inter-semibold text-base text-center">
                  {searchQuery.trim()
                    ? `No results matching "${searchQuery}"`
                    : "No products found"
                  }
                </Text>
              </View>
            }
          />

          <View className="flex-row bg-white items-center -mx-5 py-5 px-5 rounded-tl-lg rounded-tr-lg"
            style={{
              boxShadow: '0px -4px 10px 1px rgba(0, 0, 0, 0.05)',
              zIndex: 0,
              elevation: 0,
            }}
          >
            <Text className="mr-1 text-lg text-black/90 font-inter-bold">
              Total:
            </Text>

            <Text className="text-base font-inter-semibold"
            >
              ₱ {total.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>

            <View className="ml-auto flex-row gap-3">
              <Pressable className="ml-auto bg-black rounded-lg py-2 px-2">
                <Text className="text-white text-sm font-inter-semibold"
                >
                  Cart</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/checkout')}
                className="ml-auto bg-black rounded-lg py-2 px-2">
                <Text className="text-white text-sm font-inter-semibold"
                >
                  Checkout</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
