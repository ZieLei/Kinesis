import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router"

export default function Receipt() {
  console.log("Receipt");
  return (
    <SafeAreaView className="bg-[#F5F5F5] flex-1">
      <View className="flex-1 pt-7 px-5">
        <View className="bg-white my-10 mx-5 rounded-lg px-5">
          <Text className="text-black font-fredoka text-center p-6 text-2xl">
            Kinesis
          </Text>

          <View className="border-t-[1.5px] border-dashed" />

          <View className="flex-col gap-1 py-3">
            <Text className="font-inter-regular">Sale: #000001 </Text>
            <Text className="font-inter-regular">Date: September 27, 2026</Text>
            <Text className="font-inter-regular">Time: 2:22PM</Text>
            <Text className="font-inter-regular">Cashier: Juan</Text>
          </View>

          <View className="border-t-[1.5px] border-dashed" />

          <View className="py-3">
            <View className="flex-row">
              <Text className="font-inter-semibold flex-1">ITEM</Text>
              <Text className="font-inter-semibold w-16 text-center">QTY</Text>
              <Text className="font-inter-semibold w-28 text-right">PRICE</Text>
            </View>

            <View className="py-1">
              <View className="flex-row">
                <Text className="font-inter-regular flex-1">Brake Pads</Text>
                <Text className="font-inter-regular w-16 text-center">1</Text>
                <Text className="font-inter-regular w-28 text-right">₱450.00</Text>
              </View>

              <View className="flex-row">
                <Text className="font-inter-regular flex-1">Spark Plug</Text>
                <Text className="font-inter-regular w-16 text-center">1</Text>
                <Text className="font-inter-regular w-28 text-right">₱180.00</Text>
              </View>

              <View className="flex-row">
                <Text className="font-inter-regular flex-1">Chain Set</Text>
                <Text className="font-inter-regular w-16 text-center">1</Text>
                <Text className="font-inter-regular w-28 text-right">₱1,250.00</Text>
              </View>
            </View>
          </View>

          <View className="border-t-[1.5px] border-dashed" />

          <View className="py-3">
            <View className="flex-row">
              <Text className="font-inter-semibold flex-1">Subtotal:</Text>
              <Text className="font-inter-regular text-right">₱1,880.00</Text>
            </View>

            <View className="flex-row">
              <Text className="font-inter-semibold flex-1">Discount:</Text>
              <Text className="font-inter-regular text-right">-</Text>
            </View>
          </View>

          <View className="border-t-[1.5px] border-dashed" />

          <View className="py-3 flex-col gap-1">
            <View className="flex-row">
              <Text className="font-inter-semibold flex-1">TOTAL:</Text>
              <Text className="font-inter-regular text-right">₱1,880.00</Text>
            </View>

            <View className="flex-row">
              <Text className="font-inter-semibold flex-1">Payment:</Text>
              <Text className="font-inter-regular text-right">CASH</Text>
            </View>

            <View className="flex-row">
              <Text className="font-inter-semibold flex-1">Amount Received:</Text>
              <Text className="font-inter-regular text-right">₱2,000.00</Text>
            </View>

            <View className="flex-row">
              <Text className="font-inter-semibold flex-1">Change:</Text>
              <Text className="font-inter-regular text-right">₱120.00</Text>
            </View>
          </View>

          <View className="border-t-[1.5px] border-dashed" />

          <Text className="text-center font-inter-semibold py-3">Thank you for your purchase!</Text>

          <View className="flex-col items-center gap-2 pb-10">
            <Pressable className="border-[1.5px] px-4 py-2 rounded-lg w-56 bg-black border-black">
              <Text className="text-center font-inter-semibold text-white">New Sale</Text>
            </Pressable>

            <Pressable
              onPress={() => { router.push('/(tabs)/dashboard') }}
              className="border-[1.5px] px-4 py-2 rounded-lg w-56 border-black">
              <Text className="text-center font-inter-semibold">Back to Home</Text>
            </Pressable>

            <Pressable className="border-[1.5px] px-4 py-2 rounded-lg w-56 border-black">
              <Text className="text-center font-inter-semibold">Export Receipt</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}
