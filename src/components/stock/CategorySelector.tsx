import { Pressable, Text, TextInput, View } from "react-native";

import Plus from "lucide-react-native/icons/plus";
import X from "lucide-react-native/icons/x";

import { styledIcon } from "@/components/StyledIcon";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ALL_CATEGORY } from "@/lib/products";

const StyledPlus = styledIcon(Plus);
const StyledX = styledIcon(X);

type CategorySelectorProps = {
  categories: string[];
  selectedCategory: string;
  showNewCategory: boolean;
  newCategory: string;
  onSelectCategory: (category: string) => void;
  onToggleNewCategory: () => void;
  onChangeNewCategory: (value: string) => void;
  onAddCategory: () => void;
};

export default function CategorySelector({
  categories,
  selectedCategory,
  showNewCategory,
  newCategory,
  onSelectCategory,
  onToggleNewCategory,
  onChangeNewCategory,
  onAddCategory,
}: CategorySelectorProps) {
  const { isDark, placeholder, selection } = useThemeColors();

  return (
    <>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-inter-semibold text-sm text-ctp-text">
          Category
        </Text>

        <Pressable
          onPress={onToggleNewCategory}
          className="flex-row items-center gap-1 rounded-lg px-2 py-1"
        >
          {showNewCategory ? (
            <StyledX size={15} className="text-ctp-subtext0" />
          ) : (
            <StyledPlus size={15} className="text-ctp-blue" />
          )}
          <Text className="font-inter-semibold text-xs text-ctp-blue">
            {showNewCategory ? "Cancel" : "New category"}
          </Text>
        </Pressable>
      </View>

      {showNewCategory ? (
        <View className="mb-3 flex-row items-center gap-2">
          <TextInput
            value={newCategory}
            onChangeText={onChangeNewCategory}
            placeholder="New category name"
            placeholderTextColor={placeholder}
            selectionColor={selection}
            maxLength={100}
            className="flex-1 rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-regular text-ctp-text"
          />
          <Pressable
            onPress={onAddCategory}
            className="items-center justify-center rounded-lg bg-ctp-blue px-4 py-3"
          >
            <Text
              className={`font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
                }`}
            >
              Add
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="mb-3 flex-row flex-wrap gap-2">
          {categories
            .filter((category) => category !== ALL_CATEGORY)
            .map((category) => (
              <Pressable
                key={category}
                onPress={() => onSelectCategory(category)}
                className={`rounded-full border px-3 py-2 ${selectedCategory === category
                    ? "border-ctp-blue bg-ctp-blue/15"
                    : "border-ctp-surface2 bg-ctp-base"
                  }`}
              >
                <Text
                  className={`font-inter-medium text-xs ${selectedCategory === category
                      ? "text-ctp-blue"
                      : "text-ctp-subtext0"
                    }`}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
        </View>
      )}

      <Text className="mb-1 font-inter-semibold text-sm text-ctp-text">
        Selected category
      </Text>
      <Text className="font-inter-medium text-sm text-ctp-subtext0">
        {selectedCategory || "No category selected"}
      </Text>
    </>
  );
}
