import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import Animated, {
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import Pencil from "lucide-react-native/icons/pencil";
import Trash from "lucide-react-native/icons/trash";

import { styledIcon } from "@/components/StyledIcon";
import { useTerminalSettings } from "@/app/context/TerminalSettingsContext";
import { LOW_STOCK_THRESHOLD, formatPrice, getImageUri } from "@/lib/products";
import type { Product } from "@/types/product";

const StyledPencil = styledIcon(Pencil);
const StyledTrash = styledIcon(Trash);

const ACTION_WIDTH = 120;
const OPEN_THRESHOLD = 60;

function getStockBorderStyle(stock: number, threshold: number) {
  if (stock <= 0) {
    return { borderWidth: 1, borderColor: "#F38BA8" };
  }

  if (stock <= threshold) {
    return { borderWidth: 1, borderColor: "#F9E2AF" };
  }

  return {
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.15)",
  };
}

function getStockTextClass(stock: number, threshold: number) {
  if (stock <= 0) return "text-ctp-red";
  if (stock <= threshold) return "text-ctp-yellow";

  return "text-ctp-text";
}

type StockItemProps = {
  item: Product;
  /** Shared across the list so only one row stays swiped open. */
  openItemId: SharedValue<number | null>;
  onEdit: (item: Product) => void;
  onDelete: (item: Product) => void;
  deleting: boolean;
};

export default function StockItem({
  item,
  openItemId,
  onEdit,
  onDelete,
  deleting,
}: StockItemProps) {
  const { settings } = useTerminalSettings();

  const configuredThreshold = Number(settings?.lowStockThreshold);

  const lowStockThreshold =
    Number.isInteger(configuredThreshold) && configuredThreshold >= 0
      ? configuredThreshold
      : LOW_STOCK_THRESHOLD;

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const imageUri = getImageUri(item);

  useAnimatedReaction(
    () => openItemId.value,
    (currentId) => {
      if (currentId !== item.id) {
        translateX.value = withSpring(0);
      }
    },
  );

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const gesture = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onStart(() => {
      startX.value = translateX.value;
      openItemId.value = item.id;
    })
    .onUpdate((event) => {
      translateX.value = Math.max(
        -ACTION_WIDTH,
        Math.min(0, startX.value + event.translationX),
      );
    })
    .onEnd(() => {
      if (translateX.value < -OPEN_THRESHOLD) {
        translateX.value = withSpring(-ACTION_WIDTH);
      } else {
        translateX.value = withSpring(0);

        if (openItemId.value === item.id) {
          openItemId.value = null;
        }
      }
    });

  return (
    <View className="my-2 overflow-hidden rounded-xl bg-ctp-surface0">
      <View className="absolute right-3 h-full flex-row items-center justify-center gap-6">
        <Pressable
          onPress={() => onEdit(item)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.name}`}
          className="h-[40px] w-[40px] items-center justify-center rounded-lg bg-ctp-mantle"
        >
          <StyledPencil size={20} className="text-ctp-blue" />
        </Pressable>

        <Pressable
          onPress={() => onDelete(item)}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
          className="h-[40px] w-[40px] items-center justify-center rounded-lg bg-ctp-mantle"
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#F38BA8" />
          ) : (
            <StyledTrash size={20} className="text-ctp-red" />
          )}
        </Pressable>
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            swipeStyle,
            getStockBorderStyle(item.stock, lowStockThreshold),
          ]}
          className="flex-row rounded-xl bg-ctp-mantle"
        >
          <View className="flex-1 flex-row px-3 py-[10px]">
            <View className="h-20 w-20 overflow-hidden rounded-lg bg-ctp-surface0">
              {imageUri ? (
                <Image
                  key={imageUri}
                  source={{ uri: imageUri }}
                  resizeMode="cover"
                  className="h-full w-full"
                />
              ) : (
                <View className="flex-1 items-center justify-center px-1">
                  <Text className="text-center font-inter-semibold text-[10px] text-ctp-subtext0">
                    {item.sku || "NO IMAGE"}
                  </Text>
                </View>
              )}
            </View>

            <View className="ml-3 flex-1">
              <Text
                numberOfLines={2}
                className="font-inter-medium text-base text-ctp-text"
              >
                {item.name}
              </Text>

              <Text className="font-inter-regular text-xs text-ctp-subtext0">
                {item.category}
              </Text>

              <Text className="font-inter-semibold text-sm text-ctp-subtext0">
                ₱{formatPrice(item.price)}
              </Text>

              <Text
                className={`mt-auto font-inter-semibold text-sm ${getStockTextClass(
                  item.stock,
                  lowStockThreshold,
                )}`}
              >
                Stock: {item.stock}
              </Text>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
