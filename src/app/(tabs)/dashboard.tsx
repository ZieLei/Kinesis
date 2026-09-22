import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import orders from '../../data/orders.json';

export default function Dashboard() {
  const statusStyles = {
    Confirmed: "bg-green-100 text-green-600",
    Pending: "bg-yellow-100 text-yellow-600",
    Cancelled: "bg-red-100 text-red-600",
  };

  return (
    <SafeAreaView className="bg-[#F5F5F5] flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 py-7"
      >
        <View className="flex-row items-center justify-between">
          <Text
            className="text-black text-2xl"
            style={{
              fontFamily: "FredokaOne",
            }}
          >
            Kinesis
          </Text>

          <View className="bg-black/10 h-10 w-10 rounded-full" />
        </View>

        <Text className="py-6 text-lg font-inter-medium">
          Welcome, User!
        </Text>

        <LinearGradient
          colors={['#575757', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 10,
            height: 200,
            paddingHorizontal: 20,
            paddingVertical: 15,
          }}
        >
          <Text className="text-white/90 text-md font-inter">
            Today's Sales
          </Text>

          <Text className="text-white text-2xl tracking-[1px] my-3 font-inter-semibold">
            ₱2,450.00
          </Text>

          <View className="flex-row items-center">
            <Text className="bg-white text-green-600 text-xs rounded-full items-center py-1 px-2 font-inter-extrabold">
              +15%
            </Text>

            <Text className="text-white/80 ml-2 font-inter">
              From previous week.
            </Text>
          </View>
        </LinearGradient>

        <View className="flex-row py-[20px] justify-between">
          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />

              <Text className="text-md font-inter-semibold">
                Products
              </Text>
            </View>

            <View className="flex-row justify-between py-5">
              <Text className="text-xl font-inter-bold">
                350
              </Text>

              <Text className="bg-green-200/50 text-green-600 text-xs py-1 px-2 rounded-full font-inter-black">
                +15%
              </Text>
            </View>

            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 text-xs mt-auto font-inter-medium">
              Update: 20 Aug 2026
            </Text>
          </View>

          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />

              <Text className="text-md font-inter-semibold">
                Categories
              </Text>
            </View>

            <View className="flex-row justify-between py-5">
              <Text className="text-xl font-inter-bold">
                5
              </Text>

              <Text className="bg-green-200/50 text-green-600 text-xs py-1 px-2 rounded-full font-inter-bold">
                +25%
              </Text>
            </View>

            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 text-xs mt-auto font-inter-medium">
              Update: 20 Aug 2026
            </Text>
          </View>
        </View>

        <View className="flex-row justify-between">
          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />

              <Text className="text-md font-inter-semibold">
                Items sold
              </Text>
            </View>

            <View className="flex-row justify-between py-5">
              <Text className="text-xl font-inter-bold">
                12
              </Text>

              <Text className="bg-green-200/50 text-green-600 text-xs py-1 px-2 rounded-full font-inter-bold">
                +12%
              </Text>
            </View>

            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 text-xs mt-auto font-inter-medium">
              Update: 20 Aug 2026
            </Text>
          </View>

          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />

              <Text className="text-md font-inter-semibold">
                Monthly sales
              </Text>
            </View>

            <View className="flex-row justify-between py-5">
              <Text className="text-xl font-inter-bold">
                ₱12.25K
              </Text>

              <Text className="bg-green-200/50 text-green-600 text-xs py-1 px-2 rounded-full font-inter-bold">
                +10%
              </Text>
            </View>

            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 text-xs mt-auto font-inter-medium">
              Update: 20 Aug 2026
            </Text>
          </View>
        </View>

        <View className="bg-white rounded-[10px] h-[500px] w-full mt-[20px] px-5 py-4 flex-col">
          <View className="flex-row items-center mb-3">
            <Text className="text-black text-lg font-inter-medium">
              Recent Transactions
            </Text>

            <Pressable className="ml-auto bg-black/10 py-2 px-2 rounded-md">
              <Text
                className="text-xs font-inter-bold"
                selectable={false}
              >
                View All
              </Text>
            </Pressable>
          </View>

          {orders.map((order) => (
            <View
              key={order.id}
              className="flex-row w-full h-[70px] my-2"
            >
              <View className="bg-black/20 aspect-square rounded-lg" />

              <View className="flex-col gap-2 ml-2">
                <Text className="text-black text-base font-inter-bold">
                  Order #{order.id}
                </Text>

                <Text className="text-black/30 text-xs font-inter-semibold">
                  {order.time}{"\n"}
                  {order.date}
                </Text>
              </View>

              <View className="ml-auto items-end">
                <Text className="mb-2 text-base mr-1 font-inter-bold">
                  ₱ {(order.amount).toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>

                <Text
                  className={`rounded-full text-sm w-[80px] text-center py-1 ${statusStyles[
                    order.status as keyof typeof statusStyles
                  ]
                    } font-inter-semibold`}
                >
                  {order.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
