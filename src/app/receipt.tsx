import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function Receipt() {
  console.log("Receipt");

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <View className="my-6 w-full max-w-sm self-center rounded-lg border border-ctp-surface0 bg-ctp-mantle p-5">
          {/* Receipt Header */}
          <Text className="whitespace-pre-wrap text-center font-fredoka text-2xl font-bold text-ctp-text">
            Kinesis
          </Text>

          <View className="my-3 border-t border-dashed border-ctp-surface1" />

          {/* Sale Information */}
          <View className="gap-1">
            <View className="flex-row justify-between gap-3">
              <Text className="text-xs font-inter-regular text-ctp-subtext0">
                Sale
              </Text>
              <Text className="text-right text-xs font-inter-semibold text-ctp-text">
                #000001
              </Text>
            </View>

            <View className="flex-row justify-between gap-3">
              <Text className="text-xs font-inter-regular text-ctp-subtext0">
                Date
              </Text>
              <Text className="text-right text-xs font-inter-regular text-ctp-text">
                September 27, 2026
              </Text>
            </View>

            <View className="flex-row justify-between gap-3">
              <Text className="text-xs font-inter-regular text-ctp-subtext0">
                Time
              </Text>
              <Text className="text-right text-xs font-inter-regular text-ctp-text">
                2:22 PM
              </Text>
            </View>

            <View className="flex-row justify-between gap-3">
              <Text className="text-xs font-inter-regular text-ctp-subtext0">
                Cashier
              </Text>
              <Text className="text-right text-xs font-inter-regular text-ctp-text">
                Juan
              </Text>
            </View>
          </View>

          <View className="my-3 border-t border-dashed border-ctp-surface1" />

          {/* Items */}
          <View className="gap-3">
            <View className="flex-row items-center">
              <Text className="flex-1 text-[11px] font-inter-bold text-ctp-text">
                ITEM
              </Text>
              <Text className="w-10 text-center text-[11px] font-inter-bold text-ctp-text">
                QTY
              </Text>
              <Text className="w-24 text-right text-[11px] font-inter-bold text-ctp-text">
                PRICE
              </Text>
            </View>

            <View className="gap-2">
              <View className="flex-row items-start">
                <Text className="flex-1 text-[11px] font-inter-regular text-ctp-subtext0">
                  Brake Pads
                </Text>
                <Text className="w-10 text-center text-[11px] font-inter-regular text-ctp-subtext0">
                  1
                </Text>
                <Text className="w-24 text-right text-[11px] font-inter-regular text-ctp-subtext0">
                  ₱450.00
                </Text>
              </View>

              <View className="flex-row items-start">
                <Text className="flex-1 text-[11px] font-inter-regular text-ctp-subtext0">
                  Spark Plug
                </Text>
                <Text className="w-10 text-center text-[11px] font-inter-regular text-ctp-subtext0">
                  1
                </Text>
                <Text className="w-24 text-right text-[11px] font-inter-regular text-ctp-subtext0">
                  ₱180.00
                </Text>
              </View>

              <View className="flex-row items-start">
                <Text className="flex-1 text-[11px] font-inter-regular text-ctp-subtext0">
                  Chain Set
                </Text>
                <Text className="w-10 text-center text-[11px] font-inter-regular text-ctp-subtext0">
                  1
                </Text>
                <Text className="w-24 text-right text-[11px] font-inter-regular text-ctp-subtext0">
                  ₱1,250.00
                </Text>
              </View>
            </View>
          </View>

          <View className="my-3 border-t border-dashed border-ctp-surface1" />

          {/* Subtotal and Discount */}
          <View className="gap-2">
            <View className="flex-row justify-between gap-3">
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                Subtotal
              </Text>
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                ₱1,880.00
              </Text>
            </View>

            <View className="flex-row justify-between gap-3">
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                Discount
              </Text>
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                -
              </Text>
            </View>
          </View>

          <View className="my-3 border-t border-dashed border-ctp-surface1" />

          {/* Payment Summary */}
          <View className="gap-2">
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 text-xs font-inter-bold text-ctp-text">
                TOTAL
              </Text>
              <Text className="text-xs font-inter-bold text-ctp-text">
                ₱1,880.00
              </Text>
            </View>

            <View className="flex-row justify-between gap-3">
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                Payment
              </Text>
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                CASH
              </Text>
            </View>

            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 text-[11px] font-inter-regular text-ctp-subtext0">
                Amount Received
              </Text>
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                ₱2,000.00
              </Text>
            </View>

            <View className="flex-row justify-between gap-3">
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                Change
              </Text>
              <Text className="text-[11px] font-inter-regular text-ctp-subtext0">
                ₱120.00
              </Text>
            </View>
          </View>

          <View className="my-3 border-t border-dashed border-ctp-surface1" />

          {/* Receipt Footer */}
          <Text className="whitespace-pre-wrap text-center text-[11px] font-inter-semibold text-ctp-text">
            Thank you for your purchase!
          </Text>

          {/* Actions */}
          <View className="mt-5 items-center gap-2 pb-2">
            <Pressable className="w-full rounded-lg border border-ctp-blue bg-ctp-blue px-4 py-2.5">
              <Text className="text-center text-sm font-inter-semibold text-ctp-crust">
                New Sale
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                router.push("/(tabs)/dashboard");
              }}
              className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-2.5"
            >
              <Text className="text-center text-sm font-inter-semibold text-ctp-text">
                Back to Home
              </Text>
            </Pressable>

            <Pressable className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-2.5">
              <Text className="text-center text-sm font-inter-semibold text-ctp-text">
                Export Receipt
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
