import { View, Text, Pressable, TextInput } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useCart } from "./context/CartContext"
import { useState } from "react";
import { router } from 'expo-router'

export default function Checkout() {
  const { total } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash'>('cash');
  const [amountReceived, setAmountReceived] = useState('');

  const received = Number(amountReceived) || 0;
  const change = Math.max(0, received - total);
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

        <View className="py-5 flex-col mb-10">
          <Text className="font-inter-semibold text-black/70">
            Amount Due
          </Text>
          <Text className="font-inter-bold text-3xl">
            ₱ {total.toLocaleString('en-PH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>

        <View className="flex-row justify-evenly">
          <Pressable
            onPress={() => setPaymentMethod('cash')}
            className={`flex-col gap-2 rounded-md border-[1px] bg-white p-7 ${paymentMethod === 'cash'
              ? 'border-black'
              : 'border-black/20'
              }`}
          >
            <View className="h-20 w-20 bg-black/10" />

            <Text className="text-center font-inter-semibold text-black/80">
              CASH
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setPaymentMethod('gcash')}
            className={`flex-col gap-2 rounded-md border-[1px] bg-white p-7 ${paymentMethod === 'gcash'
              ? 'border-[#05008E]'
              : 'border-black/20'
              }`}
          >
            <View className="h-20 w-20 bg-black/10" />

            <Text className="text-center font-inter-semibold text-[#05008E]">
              GCASH
            </Text>
          </Pressable>
        </View>

        <View className="mt-10 pb-5">
          {paymentMethod === 'cash' ? (
            <View className="gap-5 ">
              <View className="">
                <Text className="font-inter-semibold text-lg text-black/80">
                  Amount Received
                </Text>

                <TextInput
                  value={amountReceived}
                  onChangeText={setAmountReceived}
                  className="border-[1px] border-black/10 bg-white px-4 py-3 font-inter-medium text-black text-lg "
                  placeholder="Amount"
                  placeholderTextColor="rgba(0, 0, 0, 0.4)"
                  keyboardType="decimal-pad"
                />
              </View>

              <View>
                <Text className="font-inter-semibold text-lg text-black/80">
                  Change
                </Text>

                <Text className="font-inter font-[700] text-2xl">
                  ₱ {change.toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>

              <Pressable className="mt-auto rounded-lg bg-black/80 py-4"
                onPress={() => {
                  console.log('COMPLETE SALE PRESSED');
                  router.push('/receipt');
                }}
              >
                <Text className="text-center font-inter-semibold text-lg text-white">
                  Complete Sale
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-1">
              <View className="gap-5 flex-1">
                <View>
                  <Text className="font-inter-semibold text-lg text-black/80">
                    Amount to Pay
                  </Text>

                  <Text className="font-inter font-[700] text-2xl">
                    ₱ {total.toLocaleString('en-PH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>

                <View className="items-center">
                  <View className="h-[200px] w-[200px] bg-black/20" />
                </View>

                <View>
                  <Text className="font-inter-semibold text-lg text-black/80">
                    Reference Number
                  </Text>

                  <TextInput
                    className="border-[1px] border-black/10 bg-white px-4 py-3 font-inter-medium text-lg text-black"
                    placeholder="Enter reference number"
                    placeholderTextColor="rgba(0, 0, 0, 0.4)"
                    keyboardType="number-pad"
                  />
                </View>

                <Pressable className="mt-auto rounded-lg bg-[#05008E] py-4"
                  onPress={() => {
                    console.log('COMPLETE SALE PRESSED');
                    router.push('/receipt');
                  }}
                >
                  <Text className="text-center font-inter-semibold text-lg text-white">
                    Complete Sale
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}
