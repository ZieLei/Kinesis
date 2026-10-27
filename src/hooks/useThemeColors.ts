import { useColorScheme } from "nativewind";

/**
 * Raw color values for props that can't take a className
 * (placeholderTextColor, selectionColor, ActivityIndicator color, ...).
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return {
    isDark,
    placeholder: isDark ? "#A6ADC8" : "#6C6F85",
    selection: isDark ? "#89B4FA" : "#1E66F5",
    refreshSpinner: isDark ? "#CDD6F4" : "#4C4F69",
    onAccentSpinner: isDark ? "#11111B" : "#FFFFFF",
    sheetBackground: isDark ? "#1E1E2E" : "#EFF1F5",
  };
}
