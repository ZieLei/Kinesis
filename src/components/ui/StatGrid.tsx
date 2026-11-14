import { Text, View } from "react-native";

export type StatItem = { label: string; value: string | number };

/** Two-column grid of small stat cards (used by Stock and Transactions). */
export default function StatGrid({ items }: { items: StatItem[] }) {
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
