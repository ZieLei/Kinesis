
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
import { useTerminalSettings } from "@/app/context/TerminalSettingsContext";
import { createSale, fetchSale } from "@/lib/salesApi";
import type {
  CheckoutRequest,
  PaymentMethod,
  SaleRecord,
} from "@/types/sale";

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledBanknote = styledIcon(Banknote);

function createTransactionCode() {
  const randomPart = Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()
    .padEnd(8, "0");

  return `KNS-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

function money(
  amount: number,
  currencySymbol: string,
  currencyPlacement: "before" | "after",
  decimalPrecision: string,
) {
  const precision = Number(decimalPrecision);
  const safePrecision =
    Number.isInteger(precision) && precision >= 0 && precision <= 4
      ? precision
      : 2;

  const formatted = amount.toLocaleString("en-PH", {
    minimumFractionDigits: safePrecision,
    maximumFractionDigits: safePrecision,
  });

  return currencyPlacement === "before"
    ? `${currencySymbol}${formatted}`
    : `${formatted} ${currencySymbol}`;
}

function calculateTaxCents(
  subtotalCents: number,
  taxRate: string,
): number {
  const rateHundredths = Math.round(Number(taxRate) * 100);

  if (!Number.isFinite(rateHundredths) || rateHundredths < 0) {
    return 0;
  }

  return Math.floor(
    (subtotalCents * rateHundredths + 5000) / 10000,
  );
}

function calculateDiscountCents(
  subtotalCents: number,
  discountPercent: number,
): number {
  const percentageHundredths = Math.round(discountPercent * 100);

  if (
    !Number.isFinite(percentageHundredths) ||
    percentageHundredths < 0 ||
    percentageHundredths > 10000
  ) {
    return 0;
  }

  return Math.floor(
    (subtotalCents * percentageHundredths + 5000) / 10000,
  );
}

function roundCashCents(
  amountCents: number,
  rounding: string,
): number {
  const increments: Record<string, number> = {
    "0.01": 1,
    "0.05": 5,
    "0.10": 10,
    "1.00": 100,
  };

  const increment = increments[rounding] ?? 1;

  return (
    Math.floor((amountCents + increment / 2) / increment) *
    increment
  );
}

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { colorScheme } = useColorScheme();

  const {
    settings,
    status: settingsStatus,
    error: settingsError,
    refreshSettings,
  } = useTerminalSettings();

  const isDark = colorScheme === "dark";

  const settingsReady =
    settings !== null && settingsStatus === "synced";

  const currencySymbol = settings?.currencySymbol ?? "₱";
  const currencyPlacement = settings?.currencyPlacement ?? "before";
  const decimalPrecision = settings?.decimalPrecision ?? "2";

  const productItems = items.filter(
    (item) => item.type === "product",
  );

  const serviceItems = items.filter(
    (item) => item.type === "service",
  );

  const itemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash");

  const [amountReceived, setAmountReceived] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [gcashVerified, setGcashVerified] = useState(false);

  const [discountPercent, setDiscountPercent] = useState("0");
  const [supervisorUsername, setSupervisorUsername] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [error, setError] = useState("");
  const [transactionCode] = useState(createTransactionCode);

  const parsedReceived =
    amountReceived.trim() === ""
      ? Number.NaN
      : Number(amountReceived);

  const validReceived =
    Number.isFinite(parsedReceived) && parsedReceived >= 0;

  const receivedCents = validReceived
    ? Math.round(parsedReceived * 100)
    : 0;

  const discountValue =
    discountPercent.trim() === ""
      ? 0
      : Number(discountPercent);

  const discountInputValid =
    Number.isFinite(discountValue) &&
    discountValue >= 0 &&
    discountValue <= 100 &&
    /^\d{1,3}(?:\.\d{1,2})?$/.test(
      discountPercent.trim() || "0",
    );

  const discountLimit = Number(settings?.discountLimit ?? "10");

  const discountOverLimit =
    discountInputValid && discountValue > discountLimit;

  const supervisorRequired =
    discountOverLimit &&
    settings?.supervisorPinForDiscounts === true;

  const supervisorApprovalDisabled =
    discountOverLimit &&
    settings?.supervisorPinForDiscounts === false;

  const supervisorCredentialsValid =
    supervisorUsername.trim().length >= 3 &&
    /^\d{6}$/.test(supervisorPin);

  const grossSubtotalCents = Math.round(total * 100);

  const discountCents = discountInputValid
    ? calculateDiscountCents(
      grossSubtotalCents,
      discountValue,
    )
    : 0;

  const subtotalCents = Math.max(
    0,
    grossSubtotalCents - discountCents,
  );

  const taxCents = settings
    ? calculateTaxCents(subtotalCents, settings.taxRate)
    : 0;

  const unroundedTotalCents = subtotalCents + taxCents;

  const cashTotalCents =
    settings && settingsStatus === "synced"
      ? roundCashCents(
        unroundedTotalCents,
        settings.cashRounding,
      )
      : unroundedTotalCents;

  const estimatedTotalCents = unroundedTotalCents;

  const changeCents = Math.max(
    0,
    receivedCents - cashTotalCents,
  );

  const hasEnoughCash =
    validReceived && receivedCents >= cashTotalCents;

  const amountDueCents =
    paymentMethod === "cash"
      ? cashTotalCents
      : estimatedTotalCents;

  const formatMoney = (cents: number) =>
    money(
      cents / 100,
      currencySymbol,
      currencyPlacement,
      decimalPrecision,
    );

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

    if (!settingsReady) {
      setError(
        "Connect to the Kinesis server and synchronize POS settings before completing a sale.",
      );
      return;
    }

    if (items.length === 0) {
      setError(
        "Your cart is empty. Add products or services before checking out.",
      );
      return;
    }

    if (!discountInputValid) {
      setError("Enter a valid discount percentage between 0 and 100.");
      return;
    }

    if (supervisorApprovalDisabled) {
      setError(
        `The maximum cashier discount is ${discountLimit}%. Supervisor approval is disabled, so this discount cannot be applied.`,
      );
      return;
    }

    if (
      supervisorRequired &&
      !supervisorCredentialsValid
    ) {
      setError(
        "Enter the supervisor's username and six-digit PIN to authorize this discount.",
      );
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
      discount_percent: discountValue,

      items: productItems.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      })),

      services: serviceItems.map((item) => ({
        service_id: item.id,
        quantity: item.quantity,
      })),

      ...(supervisorRequired
        ? {
          supervisor_username: supervisorUsername.trim().toLowerCase(),
          supervisor_pin: supervisorPin,
        }
        : {}),

      ...(paymentMethod === "cash"
        ? {
          amount_tendered: receivedCents / 100,
        }
        : {
          reference_number: referenceNumber.trim(),
        }),
    };

    setSubmitting(true);

    try {
      const savedSale = await createSale(checkout);
      finishSale(savedSale);
    } catch (requestError) {
      // The server may have committed the sale before the response
      // was interrupted. Recover using the same transaction code.
      try {
        const savedSale = await fetchSale(transactionCode);
        finishSale(savedSale);
        return;
      } catch {
        // Preserve the original request error.
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
          {!settingsReady ? (
            <View className="mb-5 rounded-lg border border-ctp-yellow/30 bg-ctp-yellow/10 p-3">
              <Text className="font-inter-semibold text-sm text-ctp-yellow">
                {settingsStatus === "loading"
                  ? "Synchronizing POS settings"
                  : settingsStatus === "offline"
                    ? "Settings are cached but not confirmed"
                    : "POS settings unavailable"}
              </Text>

              <Text className="mt-1 font-inter-regular text-xs leading-5 text-ctp-subtext0">
                {settingsError ??
                  "Connect to the Kinesis server to retrieve the current pricing configuration."}
              </Text>

              <Pressable
                onPress={() => void refreshSettings()}
                disabled={settingsStatus === "loading"}
                className="mt-3 self-start rounded-md border border-ctp-surface1 px-3 py-2"
              >
                <Text className="font-inter-semibold text-xs text-ctp-text">
                  Retry synchronization
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View className="mb-8 py-4">
            <Text className="font-inter-semibold text-ctp-subtext0">
              Amount Due
            </Text>

            <Text className="font-inter-bold text-3xl text-ctp-text">
              {formatMoney(amountDueCents)}
            </Text>

            <Text className="mt-1 font-inter-regular text-sm text-ctp-subtext0">
              {itemCount} items · {productItems.length} product lines ·{" "}
              {serviceItems.length} service lines
            </Text>

            <View className="mt-5 gap-2">
              <View className="flex-row justify-between">
                <Text className="font-inter-regular text-sm text-ctp-subtext0">
                  Original subtotal
                </Text>

                <Text className="font-inter-medium text-sm text-ctp-text">
                  {formatMoney(grossSubtotalCents)}
                </Text>
              </View>

              {discountCents > 0 ? (
                <View className="flex-row justify-between">
                  <Text className="font-inter-regular text-sm text-ctp-green">
                    Discount ({discountValue}%)
                  </Text>

                  <Text className="font-inter-semibold text-sm text-ctp-green">
                    -{formatMoney(discountCents)}
                  </Text>
                </View>
              ) : null}

              <View className="flex-row justify-between">
                <Text className="font-inter-semibold text-sm text-ctp-text">
                  Subtotal after discount
                </Text>

                <Text className="font-inter-semibold text-sm text-ctp-text">
                  {formatMoney(subtotalCents)}
                </Text>
              </View>

              <View className="flex-row justify-between">
                <Text className="font-inter-regular text-sm text-ctp-subtext0">
                  Tax ({settings?.taxRate ?? "0"}%)
                </Text>

                <Text className="font-inter-medium text-sm text-ctp-text">
                  {formatMoney(taxCents)}
                </Text>
              </View>

              {paymentMethod === "cash" &&
                cashTotalCents !== unroundedTotalCents ? (
                <View className="flex-row justify-between">
                  <Text className="font-inter-regular text-sm text-ctp-subtext0">
                    Cash rounding
                  </Text>

                  <Text className="font-inter-medium text-sm text-ctp-text">
                    {formatMoney(
                      cashTotalCents - unroundedTotalCents,
                    )}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text className="mt-3 font-inter-regular text-xs text-ctp-subtext0">
              Final totals and discount authorization are validated by the server.
            </Text>
          </View>

          {/* Discount */}
          <View className="mb-7 rounded-xl border border-ctp-surface0 bg-ctp-mantle p-4">
            <Text className="font-inter-semibold text-base text-ctp-text">
              Sale Discount
            </Text>

            <Text className="mt-1 font-inter-regular text-xs leading-5 text-ctp-subtext0">
              Apply a percentage discount to the sale subtotal before tax.
              Cashier limit: {settings?.discountLimit ?? "10"}%.
            </Text>

            <View className="mt-3 flex-row items-center gap-3">
              <View className="flex-1">
                <TextInput
                  value={discountPercent}
                  onChangeText={(value) => {
                    setDiscountPercent(
                      value.replace(/[^0-9.]/g, "").slice(0, 6),
                    );
                    setError("");
                    setRequestFailed(false);
                  }}
                  editable={!submitting}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  placeholder="0"
                  placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                  selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                  className="rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3 font-inter-semibold text-lg text-ctp-text"
                />
              </View>

              <Text className="font-inter-semibold text-base text-ctp-subtext0">
                %
              </Text>

              <View className="min-w-24 items-end">
                <Text className="font-inter-regular text-[10px] text-ctp-subtext0">
                  Discount amount
                </Text>
                <Text className="font-inter-semibold text-sm text-ctp-green">
                  {formatMoney(discountCents)}
                </Text>
              </View>
            </View>

            {!discountInputValid ? (
              <Text className="mt-2 font-inter-medium text-xs text-ctp-red">
                Enter a valid percentage between 0 and 100, with up to two decimal places.
              </Text>
            ) : null}

            {supervisorRequired ? (
              <View className="mt-4 gap-3 rounded-lg border border-ctp-yellow/30 bg-ctp-yellow/5 p-3">
                <View>
                  <Text className="font-inter-semibold text-sm text-ctp-yellow">
                    Supervisor authorization required
                  </Text>
                  <Text className="mt-1 font-inter-regular text-xs leading-5 text-ctp-subtext0">
                    This discount is above the cashier limit. A designated supervisor must authorize it.
                  </Text>
                </View>

                <View className="gap-1.5">
                  <Text className="font-inter-medium text-xs text-ctp-subtext1">
                    Supervisor username
                  </Text>
                  <TextInput
                    value={supervisorUsername}
                    onChangeText={(value) => {
                      setSupervisorUsername(value);
                      setError("");
                      setRequestFailed(false);
                    }}
                    editable={!submitting}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Supervisor username"
                    placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                    selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                    className="rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-3 font-inter-medium text-sm text-ctp-text"
                  />
                </View>

                <View className="gap-1.5">
                  <Text className="font-inter-medium text-xs text-ctp-subtext1">
                    Supervisor six-digit PIN
                  </Text>
                  <TextInput
                    value={supervisorPin}
                    onChangeText={(value) => {
                      setSupervisorPin(
                        value.replace(/\D/g, "").slice(0, 6),
                      );
                      setError("");
                      setRequestFailed(false);
                    }}
                    editable={!submitting}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={6}
                    placeholder="••••••"
                    placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                    selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                    className="rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-3 text-center font-inter-medium text-lg tracking-[8px] text-ctp-text"
                  />
                </View>
              </View>
            ) : supervisorApprovalDisabled ? (
              <Text className="mt-3 font-inter-medium text-xs leading-5 text-ctp-red">
                Discounts above the configured cashier limit are blocked because supervisor authorization is disabled.
              </Text>
            ) : discountOverLimit ? (
              <Text className="mt-3 font-inter-medium text-xs text-ctp-yellow">
                This discount exceeds the cashier limit.
              </Text>
            ) : discountCents > 0 ? (
              <Text className="mt-3 font-inter-medium text-xs text-ctp-green">
                This discount is within the cashier limit.
              </Text>
            ) : null}
          </View>

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
                  {formatMoney(changeCents)}
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
                  {formatMoney(estimatedTotalCents)}
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
            disabled={
              submitting ||
              items.length === 0 ||
              !settingsReady ||
              !discountInputValid ||
              supervisorApprovalDisabled ||
              (supervisorRequired && !supervisorCredentialsValid)
            }
            className={`mt-8 flex-row items-center justify-center gap-2 rounded-lg py-4 ${submitting ||
                items.length === 0 ||
                !settingsReady ||
                !discountInputValid ||
                supervisorApprovalDisabled ||
                (supervisorRequired && !supervisorCredentialsValid)
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
                  : !settingsReady
                    ? "Waiting for Settings"
                    : supervisorRequired
                      ? "Authorize & Complete Sale"
                      : "Complete Sale"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
