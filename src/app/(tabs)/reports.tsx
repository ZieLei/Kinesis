import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import products from "@/data/products.json";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Download from "lucide-react-native/icons/download";
import Funnel from "lucide-react-native/icons/funnel";

export default function Reports() {
  const [selected, setSelected] = useState("sale");
  const [open, setOpen] = useState<string | null>(null);
  const [period, setPeriod] = useState("monthly");
  const [filter, setFilter] = useState("best-selling")

  const options = [
    { label: "Daily", value: "daily" },
    { label: "Weekly", value: "weekly" },
    { label: "Monthly", value: "monthly" },
    { label: "Yearly", value: "yearly" },
  ];
  const filters = [
    { label: "Best Selling", value: "best-selling" }
  ]

  const selectedLabel =
    options.find((option) => option.value === period)?.label;

  const selectedFilter =
    filters.find((filters) => filters.value === filter)?.label;

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5)
      .map((product, index) => ({
        ...product,
        rank: index + 1,
        change: index % 2 === 0 ? "↑0.0" + (index + 1) : "↓0.0" + (index + 1),
      }));
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F5]">
      <View className="flex-1 px-5 pt-7">

        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-5 w-5 items-center justify-center"
          >
            <ChevronLeft size={20} color="#000000" />
          </Pressable>

          <Text className="font-inter-semibold text-lg">
            Reports
          </Text>

          <View className="h-5 w-5 items-center justify-center">
            <Download size={20} color="#000000" />
          </View>
        </View>

        <View className="flex-row justify-center gap-4 rounded-md border-[1px] border-black/5 bg-white p-2">
          <Pressable
            onPress={() => setSelected("sale")}
            className={`flex-1 rounded-md py-4 ${selected === "sale" ? "bg-blue-700" : "bg-white"
              }`}
          >
            <Text
              className={`font-inter-medium text-center text-base ${selected === "sale" ? "text-white" : "text-black"
                }`}
            >
              Sale
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSelected("product")}
            className={`flex-1 items-center justify-center rounded-md ${selected === "product" ? "bg-blue-700" : "bg-white"
              }`}
          >
            <Text
              className={`font-inter-medium text-center text-base ${selected === "product" ? "text-white" : "text-black"
                }`}
            >
              Product
            </Text>
          </Pressable>
        </View>

        <View className="flex-1">
          {selected === "sale" ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="pt-5 pb-5 gap-4"
            >
              <View className="rounded-lg bg-white p-3">

                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg">
                    Sales Report
                  </Text>

                  <View className="relative">
                    <Pressable

                      onPress={() => setOpen(open === "period" ? null : "period")}
                      className="h-11 w-[150px] flex-row items-center justify-between rounded-md border-[1px] border-black/10 bg-white px-3"
                    >
                      <Text className="font-inter-medium text-black">
                        {selectedLabel}
                      </Text>

                      <Text className="text-black">
                        ▼
                      </Text>
                    </Pressable>

                    {open === "period" && (
                      <View className="absolute right-0 top-12 z-50 w-[150px] rounded-xl bg-white p-1">
                        {options.map((option) => (
                          <Pressable
                            key={option.value}
                            onPress={() => {
                              setPeriod(option.value);
                              setOpen(null);
                            }}
                            className="rounded-lg px-3 py-3"
                          >
                            <Text className="font-inter-medium text-black">
                              {option.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                </View>

                <View className="h-52 w-full items-center justify-between bg-gray-200">
                  <Text className="text-center">
                    GRAPH
                  </Text>
                </View>

              </View>

              <View className="flex-col gap-3 rounded-md bg-white p-3">
                <View className="flex-row justify-between">
                  <Text className="font-inter-semibold">
                    Total Sales:
                  </Text>

                  <Text className="font-inter-semibold">
                    ₱34,300
                  </Text>
                </View>

                <View className="flex-col">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-inter-medium">
                      This Month:
                    </Text>
                    <View className="h-3 flex-1 rounded-full bg-black/80" />
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Text className="font-inter-medium">
                      Last Month:
                    </Text>
                    <View className="h-3 flex-1 rounded-full bg-black/20">
                      <View className="h-3 w-[88%] rounded-full bg-black/40" />
                    </View>
                  </View>
                </View>

                <View className="w-36 rounded-2xl border-[1.5px] border-green-500 bg-green-100 py-[1.5px]">
                  <Text className="text-center font-inter-semibold text-sm text-green-700">
                    +12% vs last month
                  </Text>
                </View>
              </View>

              <View className="flex-col gap-3 rounded-md bg-white p-3">
                <View className="flex-row justify-between">
                  <Text className="font-inter-semibold">
                    Total Transactions:
                  </Text>

                  <Text className="font-inter-semibold">
                    1,056
                  </Text>
                </View>

                <View className="flex-col">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-inter-medium">
                      This Month:
                    </Text>
                    <View className="h-3 flex-1 rounded-full bg-black/80" />
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Text className="font-inter-medium">
                      Last Month:
                    </Text>
                    <View className="h-3 flex-1 rounded-full bg-black/20">
                      <View className="h-3 w-[90%] rounded-full bg-black/40" />
                    </View>
                  </View>
                </View>

                <View className="w-36 rounded-2xl border-[1.5px] border-green-500 bg-green-100 py-[1.5px]">
                  <Text className="text-center font-inter-semibold text-sm text-green-700">
                    +10% vs last month
                  </Text>
                </View>
              </View>

              <View className="flex-col gap-3 rounded-md bg-white p-3">
                <View className="flex-row justify-between">
                  <Text className="font-inter-semibold">
                    Total Items Sold:
                  </Text>

                  <Text className="font-inter-semibold">
                    1,975
                  </Text>
                </View>

                <View className="flex-col">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-inter-medium">
                      This Month:
                    </Text>
                    <View className="h-3 flex-1 rounded-full bg-black/80" />
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Text className="font-inter-medium">
                      Last Month:
                    </Text>
                    <View className="h-3 flex-1 rounded-full bg-black/20">
                      <View className="h-3 w-[80%] rounded-full bg-black/40" />
                    </View>
                  </View>
                </View>

                <View className="w-36 rounded-2xl border-[1.5px] border-green-500 bg-green-100 py-[1.5px]">
                  <Text className="text-center font-inter-semibold text-sm text-green-700">
                    +20% vs last month
                  </Text>
                </View>
              </View>

            </ScrollView>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="pt-5 pb-5 gap-4"
            >
              <View className="rounded-lg bg-white p-3">

                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg">
                    Top Categories
                  </Text>

                  <View className="relative">
                    <Pressable
                      onPress={() => setOpen(open === "period" ? null : "period")}
                      className="h-11 w-[150px] flex-row items-center justify-between rounded-md border-[1px] border-black/10 bg-white px-3"
                    >
                      <Text className="font-inter-medium text-black">
                        {selectedLabel}
                      </Text>

                      <Text className="text-black">
                        ▼
                      </Text>
                    </Pressable>

                    {open === "period" && (
                      <View className="absolute right-0 top-12 z-50 w-[150px] rounded-xl bg-white p-1">
                        {options.map((option) => (
                          <Pressable
                            key={option.value}
                            onPress={() => {
                              setPeriod(option.value);
                              setOpen(null);
                            }}
                            className="rounded-lg px-3 py-3"
                          >
                            <Text className="font-inter-medium text-black">
                              {option.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                </View>

                <View className="h-52 w-full items-center justify-between bg-gray-200">
                  <Text className="text-center">
                    GRAPH
                  </Text>
                </View>

              </View>

              <View className="rounded-lg bg-white p-3">
                <View className="flex-row items-center justify-between pb-2">
                  <Text className="font-inter-semibold text-lg">
                    Top Products
                  </Text>

                  <View className="flex-row items-center gap-3">
                    <View className="h-7 w-7 items-center justify-center rounded-md bg-black/10">
                      <Funnel size={14} color="#000000" />
                    </View>

                    <Pressable className="rounded-md bg-black/10 px-2 py-2">
                      <Text
                        className="text-xs font-inter-bold"
                        selectable={false}
                      >
                        View All
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {topProducts.map((product) => (
                  <View
                    key={product.rank}
                    className={`bg-white rounded-lg flex-row m-2 ${product.rank === 1
                      ? "border-yellow-400"
                      : product.rank === 2
                        ? "border-gray-400"
                        : product.rank === 3
                          ? "border-amber-700"
                          : "border-transparent"
                      } ${product.rank <= 3 ? "border-b-4" : ""}`}
                    style={{
                      boxShadow: "0px 0px 8px 2px rgba(0, 0, 0, 0.05)",
                    }}
                  >
                    <View className="bg-black/15 h-20 w-20 m-2 rounded-lg" />

                    <View className="justify-between my-3 mx-1">
                      <Text className="font-inter-semibold text-md">
                        {product.name}
                      </Text>

                      <Text className="font-inter-semibold text-sm text-black/50">
                        ₱{product.price.toLocaleString('en-PH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>

                    <View className="justify-between ml-auto mr-3 my-3 items-end">
                      <Text className="font-inter-semibold">
                        {product.sold} pcs
                      </Text>

                      <Text
                        className={`font-inter-semibold ${product.change.startsWith("↑")
                          ? "text-green-500"
                          : "text-red-500"
                          }`}
                      >
                        {product.change}
                      </Text>
                    </View>
                  </View>
                ))}

              </View>

            </ScrollView>
          )}
        </View>

      </View>
    </SafeAreaView >
  );
}
