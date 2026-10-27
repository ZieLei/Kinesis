import { Text, View } from "react-native";

import type { StockStatsSummary } from "@/lib/products";

type StockStatsProps = {
  stats: StockStatsSummary;
};

export default function StockStats({ stats }: StockStatsProps) {
  const items = [
    { label: "Out of stock", value: stats.outOfStock },
    { label: "Low stock", value: stats.lowStock },
    { label: "Total items", value: stats.totalItems },
    { label: "Total products", value: stats.totalProducts },
  ];

  return (
    <View className="flex-row flex-wrap justify-between gap-2 pb-4">
      {items.map((item) => (
        <View
          key={item.label}
          className="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-2"
          style={{ width: "48%" }}
        >
          <Text className="text-center font-inter-medium text-sm text-ctp-subtext0">
            {item.label}
          </Text>
          <Text className="text-center font-inter-bold text-base text-ctp-text">
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
