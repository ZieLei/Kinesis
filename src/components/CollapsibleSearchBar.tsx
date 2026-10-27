import { Pressable, Text, TextInput, View } from "react-native";
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";

import Funnel from "lucide-react-native/icons/funnel";
import Search from "lucide-react-native/icons/search";

import { styledIcon } from "@/components/StyledIcon";
import { useThemeColors } from "@/hooks/useThemeColors";

const StyledFunnel = styledIcon(Funnel);
const StyledSearch = styledIcon(Search);

type CollapsibleSearchBarProps = {
  /** Scroll offset of the list; the bar collapses as it grows. */
  scrollY: SharedValue<number>;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Bottom margin while fully expanded; it collapses to 0 on scroll. */
  expandedMargin?: number;
  /** When provided, a filter button is shown inside the input. */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
};

export default function CollapsibleSearchBar({
  scrollY,
  value,
  onChangeText,
  placeholder = "Search parts or SKU...",
  expandedMargin = 8,
  onOpenFilters,
  activeFilterCount = 0,
}: CollapsibleSearchBarProps) {
  const { placeholder: placeholderColor, selection } = useThemeColors();

  const searchBarStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [0, 100], [50, 0], Extrapolation.CLAMP),
    marginBottom: interpolate(
      scrollY.value,
      [0, 100],
      [expandedMargin, 0],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(scrollY.value, [0, 60], [1, 0], Extrapolation.CLAMP),
    overflow: "hidden" as const,
  }));

  return (
    <Animated.View style={searchBarStyle}>
      <View className="flex-row items-center gap-2">
        <View className="flex-1 justify-center">
          <View pointerEvents="none" className="absolute left-3 z-10">
            <StyledSearch size={18} className="text-ctp-subtext0" />
          </View>

          <TextInput
            placeholder={placeholder}
            placeholderTextColor={placeholderColor}
            selectionColor={selection}
            value={value}
            onChangeText={onChangeText}
            accessibilityLabel="Search products"
            returnKeyType="search"
            className={`h-[42px] w-full rounded-md border-[1.5px] border-ctp-surface2 bg-ctp-mantle pl-10 font-inter-regular text-ctp-text ${onOpenFilters ? "pr-12" : "pr-3"
              }`}
          />

          {onOpenFilters ? (
            <Pressable
              onPress={onOpenFilters}
              accessibilityRole="button"
              accessibilityLabel="Filter products"
              className="absolute right-2 z-10 h-9 min-w-9 flex-row items-center justify-center rounded-md px-1"
            >
              <StyledFunnel
                size={18}
                className={
                  activeFilterCount > 0 ? "text-ctp-text" : "text-ctp-subtext0"
                }
              />

              {activeFilterCount > 0 && (
                <View className="ml-1 h-5 min-w-5 items-center justify-center rounded-full bg-ctp-blue px-1">
                  <Text className="font-inter-semibold text-xs text-ctp-crust">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
