import { Pressable, Text, TextInput, View } from "react-native";

import { useThemeColors } from "@/hooks/useThemeColors";
import { formatPrice } from "@/lib/products";

const QUICK_ADJUSTMENTS = [
  { label: "-10%", value: -10 },
  { label: "-5%", value: -5 },
  { label: "+5%", value: 5 },
  { label: "+10%", value: 10 },
];

type PricingSectionProps = {
  price: string;
  customPercent: string;
  onChangePrice: (value: string) => void;
  onChangeCustomPercent: (value: string) => void;
  onApplyPercentage: (percentage: number) => void;
  onApplyCustomPercentage: () => void;
};

export default function PricingSection({
  price,
  customPercent,
  onChangePrice,
  onChangeCustomPercent,
  onApplyPercentage,
  onApplyCustomPercentage,
}: PricingSectionProps) {
  const { isDark, placeholder, selection } = useThemeColors();

  const hasValidPrice =
    price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) > 0;

  return (
    <View className="mb-4 rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4">
      <Text className="font-inter-semibold text-lg text-ctp-text">
        Product pricing
      </Text>
      <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
        Update the selling price or apply a percentage adjustment.
      </Text>

      <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
        Selling Price
      </Text>

      <View className="flex-row items-center rounded-lg border border-ctp-surface2 bg-ctp-base px-3">
        <Text className="mr-2 font-inter-semibold text-ctp-subtext0">₱</Text>
        <TextInput
          value={price}
          onChangeText={onChangePrice}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0.00"
          placeholderTextColor={placeholder}
          selectionColor={selection}
          className="flex-1 py-3 font-inter-medium text-ctp-text"
        />
      </View>

      <Text className="mb-2 mt-5 font-inter-semibold text-sm text-ctp-text">
        Quick price adjustment
      </Text>
      <View className="flex-row gap-2">
        {QUICK_ADJUSTMENTS.map((adjustment) => (
          <Pressable
            key={adjustment.label}
            onPress={() => onApplyPercentage(adjustment.value)}
            className="flex-1 items-center rounded-lg border border-ctp-surface2 bg-ctp-base py-3"
          >
            <Text
              className={`font-inter-semibold text-xs ${adjustment.value < 0 ? "text-ctp-red" : "text-ctp-green"
                }`}
            >
              {adjustment.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mb-2 mt-4 font-inter-semibold text-sm text-ctp-text">
        Custom adjustment (%)
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={customPercent}
          onChangeText={onChangeCustomPercent}
          keyboardType="numbers-and-punctuation"
          placeholder="e.g. 12 or -5"
          placeholderTextColor={placeholder}
          selectionColor={selection}
          className="flex-1 rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text"
        />
        <Pressable
          onPress={onApplyCustomPercentage}
          className="rounded-lg bg-ctp-blue px-4 py-3"
        >
          <Text
            className={`font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
              }`}
          >
            Apply
          </Text>
        </Pressable>
      </View>

      {hasValidPrice && (
        <Text className="mt-3 font-inter-regular text-xs text-ctp-subtext0">
          New selling price: ₱{formatPrice(Number(price))}
        </Text>
      )}
    </View>
  );
}
