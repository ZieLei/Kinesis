import { View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCart } from "./context/CartContext";
import { useState } from "react";
import { router } from "expo-router";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Funnel from "lucide-react-native/icons/funnel";
import Banknote from "lucide-react-native/icons/banknote";
import Smartphone from "lucide-react-native/icons/smartphone";
import GCashLogo from "@/assets/images/gcash-seeklogo-2.svg";
import { styledIcon } from "@/components/StyledIcon";
import { useColorScheme } from "nativewind";

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledFunnel = styledIcon(Funnel);
const StyledBanknote = styledIcon(Banknote);
const StyledSmartphone = styledIcon(Smartphone);

export default function Checkout() {
  const { total } = useCart();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [amountReceived, setAmountReceived] = useState("");

  const received = Number(amountReceived) || 0;
  const change = Math.max(0, received - total);

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-5 w-5 items-center justify-center"
          >
            <StyledChevronLeft size={20} className="text-ctp-text" />
          </Pressable>

          <Text className="font-inter-semibold text-lg text-ctp-text">
            New Sale
          </Text>

          <View className="h-5 w-5" />
        </View>

        <View className="mb-10 flex-col py-5">
          <Text className="font-inter-semibold text-ctp-subtext0">
            Amount Due
          </Text>
          <Text className="font-inter-bold text-3xl text-ctp-text">
            ₱ {total.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>

        <View className="flex-row justify-evenly">
          <Pressable
            onPress={() => setPaymentMethod("cash")}
            className={`flex-col gap-2 rounded-md border-[1px] bg-ctp-mantle p-7 ${paymentMethod === "cash"
                ? "border-ctp-blue"
                : "border-ctp-surface1"
              }`}
          >
            <View className="h-20 w-20 items-center justify-center">
              <StyledBanknote size={40} className="text-ctp-text" />
            </View>

            <Text className="text-center font-inter-semibold text-ctp-text">
              CASH
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setPaymentMethod("gcash")}
            className={`flex-col gap-2 rounded-md border-[1px] bg-ctp-mantle p-7 ${paymentMethod === "gcash"
                ? "border-ctp-blue"
                : "border-ctp-surface1"
              }`}
          >
            <View className="h-20 w-20 items-center justify-center">
              <GCashLogo width={60} height={60} />
            </View>

            <Text className="text-center font-inter-semibold text-ctp-blue">
              GCASH
            </Text>
          </Pressable>
        </View>

        <View className="mt-10 pb-5">
          {paymentMethod === "cash" ? (
            <View className="gap-5">
              <View>
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Amount Received
                </Text>

                <TextInput
                  value={amountReceived}
                  onChangeText={setAmountReceived}
                  className="border-[1px] border-ctp-surface1 bg-ctp-mantle px-4 py-3 font-inter-medium text-lg text-ctp-text"
                  placeholder="Amount"
                  placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                  keyboardType="decimal-pad"
                />
              </View>

              <View>
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Change
                </Text>

                <Text className="font-inter text-2xl font-[700] text-ctp-text">
                  ₱ {change.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>

              <Pressable
                className="mt-auto rounded-lg bg-ctp-blue py-4"
                onPress={() => {
                  console.log("COMPLETE SALE PRESSED");
                  router.push("/receipt");
                }}
              >
                <Text className="text-center font-inter-semibold text-lg text-ctp-crust">
                  Complete Sale
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-1">
              <View className="flex-1 gap-5">
                <View>
                  <Text className="font-inter-semibold text-lg text-ctp-text">
                    Amount to Pay
                  </Text>

                  <Text className="font-inter text-2xl font-[700] text-ctp-text">
                    ₱ {total.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>

                <View className="items-center">
                  <View className="h-[200px] w-[200px] bg-ctp-surface0" />
                </View>

                <View>
                  <Text className="font-inter-semibold text-lg text-ctp-text">
                    Reference Number
                  </Text>

                  <TextInput
                    className="border-[1px] border-ctp-surface1 bg-ctp-mantle px-4 py-3 font-inter-medium text-lg text-ctp-text"
                    placeholder="Enter reference number"
                    placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                    keyboardType="number-pad"
                  />
                </View>

                <Pressable
                  className="mt-auto rounded-lg bg-ctp-blue py-4"
                  onPress={() => {
                    console.log("COMPLETE SALE PRESSED");
                    router.push("/receipt");
                  }}
                >
                  <Text className="text-center font-inter-semibold text-lg text-ctp-crust">
                    Complete Sale
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
