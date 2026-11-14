import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import X from "lucide-react-native/icons/x";

import { styledIcon } from "@/components/StyledIcon";
import { useDismissOnBack } from "@/hooks/useDismissOnBack";
import {
  MAX_RANGE_DAYS,
  MONTH_NAMES,
  formatDayCount,
  formatRangeLabel,
  isIsoDate,
  monthGrid,
  rangePresets,
  shiftMonth,
  validateRange,
  type DateRange,
} from "@/lib/dateRange";

const StyledChevronLeft = styledIcon(ChevronLeft);
const StyledChevronRight = styledIcon(ChevronRight);
const StyledX = styledIcon(X);

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type Props = {
  visible: boolean;
  /** Range currently applied, shown again when the sheet opens. */
  value: DateRange | null;
  /** Today in the report time zone (YYYY-MM-DD). */
  today: string;
  onApply: (range: DateRange) => void;
  onClose: () => void;
};

function monthOf(iso: string) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/**
 * Bottom sheet for choosing a report date range: quick presets, two typed
 * dates and a calendar. Tap a day to start a range and a second day to end
 * it; tapping an earlier day starts over. Both ends are included.
 */
export default function DateRangeSheet({ visible, value, today, onApply, onClose }: Props) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [view, setView] = useState(monthOf(today));

  // Start from the applied range (or the last 30 days) each time it opens.
  useEffect(() => {
    if (!visible) return;
    const initial = value ?? rangePresets(today)[1];
    setStart(initial.start);
    setEnd(initial.end);
    setStartText(initial.start);
    setEndText(initial.end);
    setView(monthOf(initial.end));
  }, [visible, value, today]);

  useDismissOnBack(visible, onClose);

  const presets = useMemo(() => rangePresets(today), [today]);
  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);

  const choose = (nextStart: string, nextEnd: string) => {
    setStart(nextStart);
    setEnd(nextEnd);
    setStartText(nextStart);
    setEndText(nextEnd);
  };

  const pickDay = (iso: string) => {
    if (!start || end || iso < start) {
      // First tap, or starting over.
      choose(iso, "");
    } else {
      choose(start, iso);
    }
  };

  const changeStartText = (text: string) => {
    setStartText(text);
    if (isIsoDate(text)) {
      setStart(text);
      setView(monthOf(text));
    }
  };

  const changeEndText = (text: string) => {
    setEndText(text);
    if (isIsoDate(text)) {
      setEnd(text);
      setView(monthOf(text));
    }
  };

  const complete = isIsoDate(start) && isIsoDate(end);
  const error = complete
    ? validateRange(start, end)
    : start && !end
      ? null
      : "Choose a start and an end date.";
  const canApply = complete && error === null;

  const summary = canApply
    ? `${formatRangeLabel(start, end)} · ${formatDayCount(start, end)}`
    : start && !end
      ? `${formatRangeLabel(start, start)} – pick an end date`
      : "No range selected";

  const inputClass =
    "h-11 min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 font-inter-medium text-sm text-ctp-text";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end">
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/50" accessibilityLabel="Close date range" />

        <View className="max-h-[92%] w-full self-center rounded-t-3xl bg-ctp-base pt-5 sm:max-w-[480px]">
          <View className="mb-3 flex-row items-start justify-between px-5">
            <View className="flex-1 pr-3">
              <Text className="font-inter-bold text-lg text-ctp-text">Date range</Text>
              <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                Both dates are included. Compared with the same number of days before the start.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-9 w-9 items-center justify-center rounded-lg bg-ctp-mantle"
            >
              <StyledX size={18} className="text-ctp-text" />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerClassName="px-5 pb-4"
          >
            <View className="mb-4 flex-row flex-wrap gap-2">
              {presets.map((preset) => {
                const active = preset.start === start && preset.end === end;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      choose(preset.start, preset.end);
                      setView(monthOf(preset.end));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`rounded-full border px-3 py-2 ${active ? "border-ctp-blue bg-ctp-blue/20" : "border-ctp-surface1 bg-ctp-mantle"}`}
                  >
                    <Text className={`font-inter-medium text-xs ${active ? "text-ctp-blue" : "text-ctp-text"}`}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="mb-4 flex-row items-center gap-2">
              <TextInput
                value={startText}
                onChangeText={changeStartText}
                placeholder="Start YYYY-MM-DD"
                accessibilityLabel="Start date"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                keyboardType="numbers-and-punctuation"
                placeholderTextColor="#7f849c"
                className={inputClass}
              />
              <Text className="font-inter-medium text-ctp-subtext0">to</Text>
              <TextInput
                value={endText}
                onChangeText={changeEndText}
                placeholder="End YYYY-MM-DD"
                accessibilityLabel="End date"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                keyboardType="numbers-and-punctuation"
                placeholderTextColor="#7f849c"
                className={inputClass}
              />
            </View>

            <View className="rounded-xl bg-ctp-mantle p-3">
              <View className="mb-2 flex-row items-center justify-between">
                <Pressable
                  onPress={() => setView(shiftMonth(view.year, view.month, -1))}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  className="h-10 w-10 items-center justify-center rounded-lg"
                >
                  <StyledChevronLeft size={20} className="text-ctp-text" />
                </Pressable>

                <Text accessibilityRole="header" className="font-inter-semibold text-base text-ctp-text">
                  {MONTH_NAMES[view.month - 1]} {view.year}
                </Text>

                <Pressable
                  onPress={() => setView(shiftMonth(view.year, view.month, 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  className="h-10 w-10 items-center justify-center rounded-lg"
                >
                  <StyledChevronRight size={20} className="text-ctp-text" />
                </Pressable>
              </View>

              <View className="mb-1 flex-row">
                {WEEKDAYS.map((weekday) => (
                  <Text
                    key={weekday}
                    className="flex-1 text-center font-inter-medium text-xs text-ctp-subtext0"
                  >
                    {weekday}
                  </Text>
                ))}
              </View>

              {grid.map((week) => (
                <View key={week[0].iso} className="flex-row">
                  {week.map((cell) => {
                    const isStart = cell.iso === start;
                    const isEnd = cell.iso === end;
                    const edge = isStart || isEnd;
                    const between = !!start && !!end && cell.iso > start && cell.iso < end;
                    const isToday = cell.iso === today;

                    return (
                      <Pressable
                        key={cell.iso}
                        onPress={() => pickDay(cell.iso)}
                        accessibilityRole="button"
                        accessibilityLabel={formatRangeLabel(cell.iso, cell.iso)}
                        accessibilityState={{ selected: edge || between }}
                        className={`h-10 flex-1 items-center justify-center ${between ? "bg-ctp-blue/20" : ""} ${
                          isStart && end && end !== start ? "rounded-l-full bg-ctp-blue/20" : ""
                        } ${isEnd && start && end !== start ? "rounded-r-full bg-ctp-blue/20" : ""}`}
                      >
                        <View
                          className={`h-9 w-9 items-center justify-center rounded-full ${
                            edge ? "bg-ctp-blue" : isToday ? "border border-ctp-blue" : ""
                          }`}
                        >
                          <Text
                            className={`font-inter-medium text-sm ${
                              edge ? "text-ctp-crust" : cell.inMonth ? "text-ctp-text" : "text-ctp-overlay0"
                            }`}
                          >
                            {cell.day}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            <Text className="mt-3 font-inter-semibold text-sm text-ctp-text" accessibilityLiveRegion="polite">
              {summary}
            </Text>
            {error ? (
              <Text className="mt-1 font-inter-medium text-xs text-ctp-red" accessibilityRole="alert">
                {error}
              </Text>
            ) : (
              <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                Up to {MAX_RANGE_DAYS} days. Days that have not happened yet show no sales.
              </Text>
            )}
          </ScrollView>

          <View className="flex-row gap-3 border-t border-ctp-surface0 px-5 pb-8 pt-4">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="h-12 flex-1 items-center justify-center rounded-xl bg-ctp-surface0"
            >
              <Text className="font-inter-semibold text-sm text-ctp-text">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => canApply && onApply({ start, end })}
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
              className={`h-12 flex-1 items-center justify-center rounded-xl bg-ctp-blue ${canApply ? "" : "opacity-40"}`}
            >
              <Text className="font-inter-semibold text-sm text-ctp-crust">Apply</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
