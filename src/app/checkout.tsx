
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Banknote from "lucide-react-native/icons/banknote";
import GCashLogo from "@/assets/images/gcash-seeklogo-2.svg";

import { styledIcon } from "@/components/StyledIcon";
import { useCart } from "@/app/context/CartContext";
import { createSale, fetchSale } from "@/lib/salesApi";
import type {
  CheckoutRequest,
  PaymentMethod,
  SaleRecord,
} from "@/types/sale";

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledBanknote = styledIcon(Banknote);

const money = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function createTransactionCode() {
  const randomPart = Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()
    .padEnd(8, "0");

  return `KNS-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [gcashVerified, setGcashVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [error, setError] = useState("");
  const [transactionCode] = useState(createTransactionCode);

  const parsedReceived =
    amountReceived.trim() === "" ? Number.NaN : Number(amountReceived);

  const validReceived = Number.isFinite(parsedReceived);
  const received = validReceived ? parsedReceived : 0;
  const change = Math.max(0, received - total);
  const hasEnoughCash =
    validReceived &&
    Math.round(received * 100) >= Math.round(total * 100);

  const updatePaymentMethod = (method: PaymentMethod) => {
    if (submitting) return;

    setPaymentMethod(method);
    setError("");
    setRequestFailed(false);
  };

  const finishSale = (sale: SaleRecord) => {
    clearCart();

    router.replace({
      pathname: "/receipt",
      params: {
        transactionCode: sale.transaction_code,
      },
    });
  };

  const handleCompleteSale = async () => {
    setError("");
    setRequestFailed(false);

    if (items.length === 0) {
      setError("Your cart is empty. Add products before checking out.");
      return;
    }

    if (paymentMethod === "cash" && !hasEnoughCash) {
      setError("Amount received must be at least the amount due.");
      return;
    }

    if (
      paymentMethod === "gcash" &&
      referenceNumber.trim().length === 0
    ) {
      setError("Enter the GCash reference number.");
      return;
    }

    if (paymentMethod === "gcash" && !gcashVerified) {
      setError("Verify that the GCash payment was received first.");
      return;
    }

    const checkout: CheckoutRequest = {
      transaction_code: transactionCode,
      payment_method: paymentMethod,
      items: items.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      })),
      ...(paymentMethod === "cash"
        ? { amount_tendered: Number(received.toFixed(2)) }
        : { reference_number: referenceNumber.trim() }),
    };

    setSubmitting(true);

    try {
      const savedSale = await createSale(checkout);
      finishSale(savedSale);
    } catch (requestError) {
      // A connection may fail after the server has committed the sale.
      // Check by transaction code before displaying a failure.
      try {
        const savedSale = await fetchSale(transactionCode);
        finishSale(savedSale);
        return;
      } catch {
        // The sale could not be retrieved. Preserve the error below.
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "The sale could not be completed. Check your connection and retry.",
      );
      setRequestFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="h-8 w-8 items-center justify-center"
          >
            <StyledChevronLeft size={22} className="text-ctp-text" />
          </Pressable>

          <Text className="font-inter-semibold text-lg text-ctp-text">
            New Sale
          </Text>

          <View className="h-8 w-8" />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount due */}
          <View className="mb-8 py-4">
            <Text className="font-inter-semibold text-ctp-subtext0">
              Amount Due
            </Text>

            <Text className="font-inter-bold text-3xl text-ctp-text">
              {money(total)}
            </Text>

            <Text className="mt-1 font-inter-regular text-sm text-ctp-subtext0">
              {items.reduce((sum, item) => sum + item.quantity, 0)} items
            </Text>
          </View>

          {/* Payment method */}
          <Text className="mb-3 font-inter-semibold text-base text-ctp-text">
            Payment Method
          </Text>

          <View className="flex-row justify-evenly gap-4">
            <Pressable
              onPress={() => updatePaymentMethod("cash")}
              disabled={submitting}
              accessibilityRole="radio"
              accessibilityState={{ selected: paymentMethod === "cash" }}
              className={`flex-1 items-center gap-2 rounded-md border bg-ctp-mantle p-5 ${paymentMethod === "cash"
                  ? "border-ctp-blue"
                  : "border-ctp-surface1"
                }`}
            >
              <View className="h-20 w-full items-center justify-center">
                <StyledBanknote size={40} className="text-ctp-text" />
              </View>

              <Text className="text-center font-inter-semibold text-ctp-text">
                CASH
              </Text>
            </Pressable>

            <Pressable
              onPress={() => updatePaymentMethod("gcash")}
              disabled={submitting}
              accessibilityRole="radio"
              accessibilityState={{ selected: paymentMethod === "gcash" }}
              className={`flex-1 items-center gap-2 rounded-md border bg-ctp-mantle p-5 ${paymentMethod === "gcash"
                  ? "border-ctp-blue"
                  : "border-ctp-surface1"
                }`}
            >
              <View className="h-20 w-full items-center justify-center">
                <GCashLogo width={60} height={60} />
              </View>

              <Text className="text-center font-inter-semibold text-ctp-blue">
                GCASH
              </Text>
            </Pressable>
          </View>

          {paymentMethod === "cash" ? (
            <View className="mt-8 gap-5">
              <View className="gap-2">
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Amount Received
                </Text>

                <TextInput
                  value={amountReceived}
                  onChangeText={(value) => {
                    setAmountReceived(value);
                    setError("");
                    setRequestFailed(false);
                  }}
                  editable={!submitting}
                  keyboardType="decimal-pad"
                  placeholder="Enter amount"
                  placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                  selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                  className="rounded-md border border-ctp-surface1 bg-ctp-mantle px-4 py-3 font-inter-medium text-lg text-ctp-text"
                />
              </View>

              <View className="gap-1">
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Change
                </Text>

                <Text className="font-inter-bold text-2xl text-ctp-text">
                  {money(change)}
                </Text>
              </View>
            </View>
          ) : (
            <View className="mt-8 gap-5">
              <View>
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Amount to Pay
                </Text>

                <Text className="font-inter-bold text-2xl text-ctp-text">
                  {money(total)}
                </Text>
              </View>

              <View className="items-center justify-center">
                <View className="h-[200px] w-[200px] items-center justify-center rounded-md bg-ctp-surface0 p-4">
                  <Text className="text-center font-inter-medium text-sm text-ctp-subtext0">
                    GCash payment QR
                  </Text>
                  <Text className="mt-1 text-center text-xs text-ctp-subtext0">
                    Payment QR integration is not configured yet.
                  </Text>
                </View>
              </View>

              <View className="gap-2">
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Reference Number
                </Text>

                <TextInput
                  value={referenceNumber}
                  onChangeText={(value) => {
                    setReferenceNumber(value);
                    setGcashVerified(false);
                    setError("");
                    setRequestFailed(false);
                  }}
                  editable={!submitting}
                  autoCapitalize="characters"
                  placeholder="Enter reference number"
                  placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                  selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                  className="rounded-md border border-ctp-surface1 bg-ctp-mantle px-4 py-3 font-inter-medium text-lg text-ctp-text"
                />
              </View>

              <Pressable
                onPress={() => setGcashVerified((value) => !value)}
                disabled={submitting}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: gcashVerified }}
                className="flex-row items-start gap-3 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-3"
              >
                <View
                  className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${gcashVerified
                      ? "border-ctp-blue bg-ctp-blue"
                      : "border-ctp-overlay1"
                    }`}
                >
                  {gcashVerified ? (
                    <Text className="font-inter-bold text-xs text-ctp-crust">
                      ✓
                    </Text>
                  ) : null}
                </View>

                <Text className="flex-1 font-inter-medium text-sm leading-5 text-ctp-text">
                  I have verified that the GCash payment was received.
                </Text>
              </Pressable>
            </View>
          )}

          {error ? (
            <View className="mt-5 rounded-md border border-ctp-red/40 bg-ctp-red/10 p-3">
              <Text className="font-inter-medium text-sm leading-5 text-ctp-red">
                {error}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleCompleteSale}
            disabled={submitting || items.length === 0}
            className={`mt-8 flex-row items-center justify-center gap-2 rounded-lg py-4 ${submitting || items.length === 0
                ? "bg-ctp-blue/50"
                : "bg-ctp-blue"
              }`}
          >
            {submitting ? (
              <ActivityIndicator
                size="small"
                color={isDark ? "#11111B" : "#FFFFFF"}
              />
            ) : null}

            <Text className="text-center font-inter-semibold text-lg text-ctp-crust">
              {submitting
                ? "Saving Sale..."
                : requestFailed
                  ? "Retry Checkout"
                  : "Complete Sale"}
            </Text>
          </Pressable>

          <Text className="mt-3 text-center text-xs leading-5 text-ctp-subtext0">
            Prices, stock, and the final total are validated by the server.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
