import { useState } from "react";
import { Image, Text, View } from "react-native";

import { getImageUri } from "@/lib/products";
import type { TopProductSales } from "@/types/sale";

/** Product photo for the report lists; shows a label when there is none. */
export default function ProductThumbnail({
  product,
  fallback,
}: {
  product: Pick<TopProductSales, "product_id" | "image_url" | "image_path">;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  const uri = getImageUri({
    id: product.product_id,
    image_url: product.image_url,
    image_path: product.image_path,
  });

  return (
    <View className="m-2 h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-ctp-surface0">
      {uri && !failed ? (
        <Image
          key={uri}
          source={{ uri }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
          className="h-full w-full"
        />
      ) : (
        <Text className="px-1 text-center font-inter-medium text-xs text-ctp-subtext0">
          {fallback}
        </Text>
      )}
    </View>
  );
}
