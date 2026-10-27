import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import X from "lucide-react-native/icons/x";

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

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      setSelectedValues(initialValues);

      overlayOpacity.setValue(0);
      panelTranslateY.setValue(500);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(panelTranslateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, initialValues, overlayOpacity, panelTranslateY]);

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Animated.View
          pointerEvents="none"
          className="absolute inset-0 bg-black"
          style={{
            opacity: overlayOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.4],
            }),
          }}
        />

        <Pressable
          className="absolute inset-0"
          onPress={onClose}
        />

        <Animated.View
          className="max-h-[85%] rounded-t-3xl bg-ctp-base px-5 pt-5"
          style={{
            paddingBottom: 20,
            transform: [{ translateY: panelTranslateY }],
          }}
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
              <X size={20} color="#A6ADC8" />
            </Pressable>
          </View>

          <ScrollView
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
                      placeholderTextColor="#A6ADC8"
                      keyboardType="numeric"
                      inputMode="decimal"
                      selectionColor="#89B4FA"
                      className="h-12 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 font-inter-medium text-ctp-text"
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
                      placeholderTextColor="#A6ADC8"
                      keyboardType="numeric"
                      inputMode="decimal"
                      selectionColor="#89B4FA"
                      className="h-12 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 font-inter-medium text-ctp-text"
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
        </Animated.View>
      </View>
    </Modal>
  );
}
