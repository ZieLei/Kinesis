import { useEffect, useState } from "react";
import {
  Platform,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { BottomSheet, Host, RNHostView } from "@expo/ui";
import X from "lucide-react-native/icons/x";
import { useDismissOnBack } from "@/hooks/useDismissOnBack";
import { useThemeColors } from "@/hooks/useThemeColors";

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterSection = {
  key: string;
  title: string;
  type: "single" | "multiple" | "range";
  options?: FilterOption[];
};

export type FilterValues = Record<string, string[]>;

type FilterModalProps = {
  visible: boolean;
  title?: string;
  sections: FilterSection[];
  initialValues?: FilterValues;
  onClose: () => void;
  onApply: (values: FilterValues) => void;
  onReset?: () => void;
};

export default function FilterModal({
  visible,
  title = "Filters",
  sections,
  initialValues = {},
  onClose,
  onApply,
  onReset,
}: FilterModalProps) {
  const [selectedValues, setSelectedValues] =
    useState<FilterValues>(initialValues);

  const { width, height } = useWindowDimensions();
  const { sheetBackground, placeholder, selection } = useThemeColors();

  const bodyMaxHeight = Math.max(140, Math.round(height * 0.85) - 200);

  useEffect(() => {
    if (visible) {
      setSelectedValues(initialValues);
    }
  }, [visible, initialValues]);

  const toggleOption = (section: FilterSection, value: string) => {
    if (section.type === "range") return;

    const currentValues = selectedValues[section.key] ?? [];

    if (section.type === "single") {
      setSelectedValues((previous) => ({
        ...previous,
        [section.key]: currentValues.includes(value) ? [] : [value],
      }));

      return;
    }

    // Inventory options use prefixes so one stock status and
    // one sorting option can be selected independently.
    if (section.key === "inventoryOptions") {
      const group = value.split(":")[0];

      const nextValues = currentValues.filter(
        (item) => item.split(":")[0] !== group
      );

      if (!currentValues.includes(value)) {
        nextValues.push(value);
      }

      setSelectedValues((previous) => ({
        ...previous,
        [section.key]: nextValues,
      }));

      return;
    }

    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    setSelectedValues((previous) => ({
      ...previous,
      [section.key]: nextValues,
    }));
  };

  const updateRange = (
    key: string,
    index: 0 | 1,
    value: string,
  ) => {
    setSelectedValues((previous) => {
      const current = previous[key] ?? ["", ""];

      const range: [string, string] = [
        current[0] ?? "",
        current[1] ?? "",
      ];

      range[index] = value;

      return {
        ...previous,
        [key]: range,
      };
    });
  };

  const resetFilters = () => {
    setSelectedValues({});
    onReset?.();
  };

  const applyFilters = () => {
    onApply(selectedValues);
    onClose();
  };

  const activeCount = Object.entries(selectedValues).reduce(
    (total, [key, values]) => {
      const section = sections.find((item) => item.key === key);

      if (section?.type === "range") {
        return total + values.filter((value) => value.trim() !== "").length;
      }

      return total + values.length;
    },
    0,
  );

  // Android back / browser back closes this first (web; native handles it).
  useDismissOnBack(visible, onClose);

  return (
    <Host
      style={
        Platform.OS === "web"
          ? { position: "absolute", left: 0, top: 0, width: 0, height: 0 }
          : { position: "absolute", width }
      }
    >
      {/* Same sheet as Add Product: themed, opaque, draggable handle. */}
      <BottomSheet
        isPresented={visible}
        onDismiss={onClose}
        containerColor={sheetBackground}
        contentPadding={0}
      >
        <RNHostView
          matchContents
          style={Platform.OS === "web" ? { width: "100%" } : undefined}
        >
        <View
          style={{ width: Platform.OS === "web" ? "100%" : width }}
          className="bg-ctp-base px-5 pb-5 pt-3"
        >
          <View className="mb-5 flex-row items-center justify-between">
            <View>
              <Text className="font-inter-semibold text-xl text-ctp-text">
                {title}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full"
              accessibilityLabel="Close filters"
            >
              <X size={20} color={placeholder} />
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: bodyMaxHeight }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {sections.map((section) => (
              <View key={section.key} className="mb-5">
                <Text className="mb-3 font-inter-semibold text-base text-ctp-text">
                  {section.title}
                </Text>

                {section.type === "range" ? (
                  <View className="flex-row items-center gap-3">
                    <TextInput
                      value={selectedValues[section.key]?.[0] ?? ""}
                      onChangeText={(value) =>
                        updateRange(section.key, 0, value)
                      }
                      placeholder="Min price"
                      placeholderTextColor={placeholder}
                      keyboardType="numeric"
                      inputMode="decimal"
                      selectionColor={selection}
                      className="h-12 min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 font-inter-medium text-ctp-text"
                    />

                    <Text className="font-inter-medium text-ctp-subtext0">
                      –
                    </Text>

                    <TextInput
                      value={selectedValues[section.key]?.[1] ?? ""}
                      onChangeText={(value) =>
                        updateRange(section.key, 1, value)
                      }
                      placeholder="Max price"
                      placeholderTextColor={placeholder}
                      keyboardType="numeric"
                      inputMode="decimal"
                      selectionColor={selection}
                      className="h-12 min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 font-inter-medium text-ctp-text"
                    />
                  </View>
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {(section.options ?? []).map((option) => {
                      const isSelected = (
                        selectedValues[section.key] ?? []
                      ).includes(option.value);

                      return (
                        <Pressable
                          key={option.value}
                          onPress={() =>
                            toggleOption(section, option.value)
                          }
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: isSelected,
                          }}
                          className={`flex-row items-center rounded-lg border px-3 py-2.5 ${isSelected
                              ? "border-ctp-blue bg-ctp-blue"
                              : "border-ctp-surface1 bg-ctp-mantle"
                            }`}
                        >
                          <Text
                            className={`font-inter-medium text-sm ${isSelected
                                ? "text-ctp-crust"
                                : "text-ctp-subtext1"
                              }`}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <View className="flex-row items-center gap-3 border-t border-ctp-surface1 pt-4">
            <Pressable
              onPress={resetFilters}
              className="h-12 flex-1 items-center justify-center rounded-lg border border-ctp-surface2 bg-ctp-mantle"
            >
              <Text className="font-inter-semibold text-base text-ctp-text">
                Reset{activeCount > 0 ? ` (${activeCount})` : ""}
              </Text>
            </Pressable>

            <Pressable
              onPress={applyFilters}
              className="h-12 flex-[1.5] items-center justify-center rounded-lg bg-ctp-blue"
            >
              <Text className="font-inter-semibold text-base text-ctp-crust">
                Apply
              </Text>
            </Pressable>
          </View>
        </View>
        </RNHostView>
      </BottomSheet>
    </Host>
  );
}
