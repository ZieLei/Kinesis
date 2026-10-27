import { Pressable, ScrollView, Text } from "react-native";

type CategoryTabsProps = {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
};

export default function CategoryTabs({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
      className="mb-3 mt-2 h-[40px] shrink-0"
    >
      {categories.map((category) => {
        const isSelected = selectedCategory === category;

        return (
          <Pressable
            key={category}
            onPress={() => onSelectCategory(category)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={`self-start rounded-full px-3 py-[8px] ${isSelected ? "bg-ctp-surface1" : "bg-transparent"
              }`}
          >
            <Text
              className={`font-inter-semibold text-base ${isSelected ? "text-ctp-text" : "text-ctp-subtext0"
                }`}
            >
              {category}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
