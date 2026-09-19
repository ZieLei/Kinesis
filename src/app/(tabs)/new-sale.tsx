import { View, Text, Pressable, ScrollView, FlatList, TextInput } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaView } from 'react-native-safe-area-context';
import products from '@/data/products.json'
import { useState } from 'react';

export default function NewSale() {
  const categories = [
    "All",
    ...new Set(
      products
        .filter((products) => products.stock > 0)
        .map((products) => products.category)
    ),
  ];

  const [selectedCategory, setSelectedCategory] = useState('All');

  return (
    <SafeAreaView className="flex-1">
      <View className="flex-1 pt-7 px-5 bg-[#F5F5F5]">
        <View className="flex-row justify-between items-center mb-5">
          <View className="h-5 w-5 bg-black/20" />
          <Text className="text-lg font-inter font-[600]"
          // style={{
          //   fontFamily: "Inter",
          //   fontWeight: 600,
          // }}
          >New Sale
          </Text>
          <View className="h-5 w-5 bg-black/20" />
        </View>

        <View className="mb-5">
          <TextInput className="flex-1 w-full rounded-md font-inter py-[10px] px-3 border-[1.5px] border-black/10 bg-white"
            placeholder="Search parts.."
          />
        </View>

        <View className="flex-col flex-1">
          <Text className="text-black/80 text-base font-inter font-[600]">
            Categories
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            className="mt-2 flex-grow-0"
          >
            {categories.map((category) => (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                className={`rounded-full px-3 py-[8px] ${selectedCategory === category
                  ? 'bg-black/5'
                  : 'bg-transparent'
                  }`}
              >
                <Text className={`font-inter font-[600] text-base ${selectedCategory === category
                  ? 'text-black'
                  : 'text-black/70'
                  }`}>
                  {category}
                </Text>
              </Pressable>
            ))}

          </ScrollView>
          <FlatList
            className="flex-1"
            data={
              selectedCategory === 'All'
                ? products
                : products.filter((product) => product.category === selectedCategory)
            }
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View className="flex-row my-2 bg-white py-[10px] px-3 rounded-[12px]"
                style={{
                  boxShadow: '0px 0px 15px 1px rgba(0, 0, 0, 0.05)',
                }}
              >
                <View className="bg-black/10 h-20 w-20 rounded-lg" />
                <View className="pl-3">
                  <Text className="text-md"
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 500,
                    }}>
                    {item.name}
                  </Text>
                  <Text className="text-sm text-black/60"
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 600,
                    }}
                  >
                    ₱ {(item.price).toLocaleString('en-PH', {
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2
                    })}
                  </Text>

                  <Text className="mt-auto font-inter font-[500] text-md">
                    Stock: {item.stock}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      </View>
    </SafeAreaView>
  )

}
