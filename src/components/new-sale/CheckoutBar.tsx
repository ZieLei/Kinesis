import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useThemeColors";
import { formatPrice } from "@/lib/products";

type CheckoutBarProps = {
  total: number;
  onOpenCart: () => void;
  onCheckout: () => void;
};

export default function CheckoutBar({
  total,
  onOpenCart,
  onCheckout,
}: CheckoutBarProps) {
  const { isDark } = useThemeColors();

  return (
    <View
      className="-mx-5 flex-row items-center rounded-tl-lg rounded-tr-lg border-t border-l border-r border-ctp-surface0 bg-ctp-mantle px-5 py-4"
      style={{
        boxShadow: "0px -4px 10px 1px rgba(0, 0, 0, 0.05)",
        zIndex: 0,
        elevation: 0,
      }}
    >
      <View>
        <Text className="mr-1 font-inter-bold text-lg text-ctp-text">
          Total:
        </Text>

        <Text className="font-inter-semibold text-base text-ctp-subtext1">
          ₱{formatPrice(total)}
        </Text>
      </View>

      <View className="ml-auto flex-row gap-3">
        <Pressable
          onPress={onOpenCart}
          className="rounded-lg bg-ctp-surface1 px-3 py-2"
          accessibilityRole="button"
        >
          <Text className="font-inter-semibold text-sm text-ctp-text">
            Cart
          </Text>
        </Pressable>

        <Pressable
          onPress={onCheckout}
          className="rounded-lg bg-ctp-blue px-3 py-2"
          accessibilityRole="button"
        >
          <Text
            className={`font-inter-semibold text-sm ${isDark ? "text-ctp-crust" : "text-white"
              }`}
          >
            Checkout
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
