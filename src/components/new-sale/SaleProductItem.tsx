import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import ImageOff from "lucide-react-native/icons/image-off";

import { styledIcon } from "@/components/StyledIcon";
import { formatPrice, getImageUri } from "@/lib/products";
import type { Product } from "@/types/product";

const ImageOffIcon = styledIcon(ImageOff);

type SaleProductItemProps = {
  item: Product;
  /** Quantity of this product already in the cart, if any. */
  cartQuantity?: number;
  onAdd: (item: Product) => void;
  onDecrease: (id: number) => void;
};

export default function SaleProductItem({
  item,
  cartQuantity,
  onAdd,
  onDecrease,
}: SaleProductItemProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const imageUri = getImageUri(item);
  const imageFailed = imageUri !== null && failedUri === imageUri;
  const atStockLimit =
    cartQuantity !== undefined && cartQuantity >= item.stock;
  const unavailable = item.stock <= 0 || atStockLimit;

  return (
    <View className="my-2 flex-row rounded-xl border border-ctp-surface0 bg-ctp-mantle">
      <Pressable
        onPress={() => onAdd(item)}
        disabled={unavailable}
        accessibilityRole="button"
        accessibilityLabel={`Add ${item.name} to cart`}
        accessibilityState={{ disabled: unavailable }}
        className={`flex-1 flex-row px-3 py-[10px] ${unavailable ? "opacity-60" : ""
          }`}
        android_ripple={{ color: "rgba(128, 128, 128, 0.12)" }}
      >
        <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-ctp-surface0">
          {imageUri && !imageFailed ? (
            <Image
              source={{ uri: imageUri }}
              resizeMode="cover"
              className="h-full w-full"
              onError={() => setFailedUri(imageUri)}
            />
          ) : (
            <ImageOffIcon size={22} className="text-ctp-subtext0" />
          )}
        </View>

        <View className="ml-3 flex-1">
          <Text
            numberOfLines={2}
            className="font-inter-medium text-base text-ctp-text"
          >
            {item.name}
          </Text>

          {item.sku ? (
            <Text
              numberOfLines={1}
              className="mt-0.5 font-inter-regular text-xs text-ctp-subtext0"
            >
              SKU: {item.sku}
            </Text>
          ) : null}

          <Text className="font-inter-semibold text-sm text-ctp-subtext0">
            ₱{formatPrice(item.price)}
          </Text>

          <Text
            className={`mt-auto font-inter-medium text-sm ${item.stock <= 0 ? "text-ctp-red" : "text-ctp-subtext1"
              }`}
          >
            {item.stock <= 0 ? "Out of stock" : `Stock: ${item.stock}`}
          </Text>
        </View>
      </Pressable>

      {cartQuantity !== undefined ? (
        <Pressable
          onPress={() => onDecrease(item.id)}
          disabled={cartQuantity <= 0}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${item.name} quantity`}
          className="mr-2 mt-2 h-8 w-[60px] flex-row items-center justify-center rounded-lg border border-ctp-surface2 bg-ctp-base"
        >
          <View className="flex-row items-center justify-evenly gap-1">
            <View className="w-5">
              <Text className="text-center font-inter-medium text-ctp-text">
                {cartQuantity}
              </Text>
            </View>

            <View className="h-8 w-6 items-center justify-center">
              <Text className="text-center font-inter-medium text-xl text-ctp-text">
                −
              </Text>
            </View>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
