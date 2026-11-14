
import { useMemo, useState } from "react";
import { Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { BarChart } from "react-native-gifted-charts";

import { usePOSFormatting } from "@/hooks/usePOSFormatting";
import type { ProductSalesReport } from "@/types/sale";

type Props = {
  report: ProductSalesReport;
  isDark: boolean;
};

const PALETTE = {
  latte: ["#1e66f5", "#8839ef", "#40a02b", "#fe640b", "#179299"],
  mocha: ["#89b4fa", "#cba6f7", "#a6e3a1", "#fab387", "#94e2d5"],
} as const;

const COLORS = {
  latte: { muted: "#6c6f85", axis: "#ccd0da", grid: "#dce0e8" },
  mocha: { muted: "#a6adc8", axis: "#45475a", grid: "#313244" },
} as const;

function getChartStep(maximum: number) {
  if (maximum <= 0) return 1;
  const target = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function getPointLabel(
  period: NonNullable<ProductSalesReport["period"]>,
  label: string,
  index: number,
  length: number,
) {
  if (period === "custom") {
    if (/^\d\d:00$/.test(label)) return index % 4 === 0 ? label.slice(0, 2) : "";

    // A bar slot is only a few pixels wide, so "Nov 21" would be cut off:
    // days show their day number (the range is printed above the chart) and
    // months their initial, like the yearly report.
    if (/^[A-Za-z]{3} \d{1,2}$/.test(label)) {
      const every = Math.max(1, Math.ceil(length / 6));
      return index % every === 0 ? label.split(" ")[1] : "";
    }

    return label.slice(0, 1);
  }
  if (period === "daily") return index % 4 === 0 ? label.slice(0, 2) : "";
  if (period === "monthly") {
    return index % 5 === 0 || index === length - 1 ? label : "";
  }
  // Twelve month names do not fit side by side on a phone: use initials.
  if (period === "yearly") return label.slice(0, 1);
  return label;
}

export default function TopCategoriesChart({ report, isDark }: Props) {
  const { width } = useWindowDimensions();
  const { formatCompactCurrency } = usePOSFormatting();

  const palette = isDark ? PALETTE.mocha : PALETTE.latte;
  const colors = isDark ? COLORS.mocha : COLORS.latte;

  const Y_LABEL_W = 58;
  const EDGE = 10;

  // Measure the real container: window-based guesses were wider than the card
  // on phones, which cut the right-hand bars off.
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next !== containerWidth) setContainerWidth(next);
  };

  const availableWidth = Math.max(
    160,
    (containerWidth > 0 ? containerWidth : width - 72) - Y_LABEL_W - 6,
  );

  const chartData = useMemo(() => {
    if (
      !report.period ||
      report.categories.length === 0 ||
      report.category_series.length === 0
    ) {
      return null;
    }

    const categoryNames = report.categories.map((item) => item.category);

    // Leave out hours, days and months that have not happened yet.
    const manilaNow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) =>
      Number(manilaNow.find((p) => p.type === type)?.value ?? 0);
    const nowDate = `${part("year")}-${String(part("month")).padStart(2, "0")}-${String(part("day")).padStart(2, "0")}`;
    const periodStart = report.period_start ?? "";

    const visibleSeries = report.category_series.filter((_, index) => {
      if (!periodStart) return true;
      if (report.period === "custom") {
        // Day and month points carry their date; hour points do not.
        const point = report.category_series[index];
        if (point.date) return point.date <= nowDate;
        return periodStart.slice(0, 10) !== nowDate || index <= part("hour") % 24;
      }
      if (report.period === "monthly") {
        const day = new Date(`${periodStart}T00:00:00Z`);
        day.setUTCDate(day.getUTCDate() + index);
        return day.toISOString().slice(0, 10) <= nowDate;
      }
      if (report.period === "yearly") {
        const year = Number(periodStart.slice(0, 4));
        return year < part("year") || index + 1 <= part("month");
      }
      if (report.period === "daily") {
        return periodStart.slice(0, 10) !== nowDate || index <= part("hour") % 24;
      }
      return true;
    });
    const seriesToDraw = visibleSeries.length > 0 ? visibleSeries : report.category_series;

    const stacks = seriesToDraw.map((point, index) => ({
      // The label box defaults to the bar's own width, which cuts "21" down
      // to "2." for the thin bars of a long custom range.
      ...(report.period === "custom" ? { labelWidth: 32 } : {}),
      label: getPointLabel(
        report.period!,
        point.label,
        index,
        seriesToDraw.length,
      ),
      stacks: categoryNames.map((category, categoryIndex) => ({
        value: Math.max(
          0,
          Number(point.categories[category]) || 0,
        ),
        color: palette[categoryIndex % palette.length],
      })),
    }));

    const maximum = Math.max(
      0,
      ...stacks.map((bar) =>
        bar.stacks.reduce((total, stack) => total + stack.value, 0),
      ),
    );

    const stepValue = getChartStep(maximum);
    // Fit every bar inside the card: 24 hours or 31 days must not scroll
    // sideways or spill past the edge.
    const slot = (availableWidth - EDGE * 2) / Math.max(1, stacks.length);
    const barWidth = Math.max(4, Math.min(22, Math.floor(slot * 0.62)));
    const spacing = Math.max(1, Math.floor(slot - barWidth));

    const chartWidth = availableWidth;

    return {
      stacks,
      chartWidth,
      stepValue,
      maxValue: stepValue * 4,
      barWidth,
      spacing,
    };
  }, [report, palette, availableWidth]);

  if (!chartData) {
    return (
      <View className="items-center justify-center py-12">
        <Text className="text-center font-inter-medium text-sm text-ctp-subtext0">
          No category sales available for this period.
        </Text>
      </View>
    );
  }

  return (
    <View onLayout={onLayout}>
      <View className="mb-5 flex-row flex-wrap gap-2">
        {report.categories.map((category, index) => (
          <View
            key={category.category}
            className="max-w-[48%] flex-row items-center gap-2 rounded-full bg-ctp-surface0/60 px-2.5 py-1.5"
          >
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: palette[index % palette.length] }}
            />
            <Text
              numberOfLines={1}
              className="shrink font-inter-medium text-xs text-ctp-subtext1"
            >
              {category.category}
            </Text>
          </View>
        ))}
      </View>

      <BarChart
        stackData={chartData.stacks}
        width={chartData.chartWidth}
        height={200}
        barWidth={chartData.barWidth}
        labelWidth={Math.max(chartData.barWidth, 28)}
        spacing={chartData.spacing}
        initialSpacing={EDGE}
        endSpacing={EDGE}
        maxValue={chartData.maxValue}
        noOfSections={4}
        stepValue={chartData.stepValue}
        stackBorderRadius={chartData.barWidth / 2.5}
        hideOrigin
        xAxisLabelTextStyle={{
          color: colors.muted,
          fontSize: 10,
          fontFamily: "LINESeed-Regular",
        }}
        xAxisLabelsHeight={24}
        xAxisColor={colors.axis}
        xAxisThickness={1}
        yAxisThickness={0}
        formatYLabel={(label: string) =>
          formatCompactCurrency(Number(label))
        }
        yAxisLabelWidth={Y_LABEL_W}
        yAxisTextStyle={{
          color: colors.muted,
          fontSize: 10,
          fontFamily: "LINESeed-Regular",
        }}
        rulesColor={colors.grid}
        rulesThickness={1}
        rulesType="dashed"
        dashWidth={4}
        dashGap={5}
        showVerticalLines={false}
        backgroundColor="transparent"
        disableScroll
        isAnimated
        animationDuration={600}
        allowFontScaling={false}
      />
    </View>
  );
}
