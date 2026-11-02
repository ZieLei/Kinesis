import { useMemo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { BarChart } from "react-native-gifted-charts";

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

function formatAxisValue(label: string) {
  const value = Number(label);
  if (!Number.isFinite(value)) return label;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return Math.round(value).toString();
}

function getPointLabel(
  period: NonNullable<ProductSalesReport["period"]>,
  label: string,
  index: number,
  length: number,
) {
  if (period === "daily") return index % 4 === 0 ? label.slice(0, 2) : "";
  if (period === "monthly")
    return index % 5 === 0 || index === length - 1 ? label : "";
  return label;
}

export default function TopCategoriesChart({ report, isDark }: Props) {
  const { width } = useWindowDimensions();

  const palette = isDark ? PALETTE.mocha : PALETTE.latte;
  const colors = isDark ? COLORS.mocha : COLORS.latte;

  // screen - px-5 (40) - card p-3 (24) - y axis gutter
  const Y_LABEL_W = 44;
  const availableWidth = Math.max(200, width - 64 - Y_LABEL_W);

  const chartData = useMemo(() => {
    if (
      !report.period ||
      report.categories.length === 0 ||
      report.category_series.length === 0
    ) {
      return null;
    }

    const categoryNames = report.categories.map((c) => c.category);

    const stacks = report.category_series.map((point, index) => ({
      label: getPointLabel(
        report.period!,
        point.label,
        index,
        report.category_series.length,
      ),
      stacks: categoryNames.map((category, ci) => ({
        value: Math.max(0, Number(point.categories[category]) || 0),
        color: palette[ci % palette.length],
      })),
    }));

    const maximum = Math.max(
      0,
      ...stacks.map((b) => b.stacks.reduce((t, s) => t + s.value, 0)),
    );

    const stepValue = getChartStep(maximum);
    const dense = report.period === "daily" || report.period === "monthly";

    const barWidth = dense ? 12 : 22;
    const spacing = dense ? 14 : 20;

    const chartWidth = Math.max(
      availableWidth,
      stacks.length * (barWidth + spacing) + 32,
    );

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
    <View>
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
        spacing={chartData.spacing}
        initialSpacing={14}
        endSpacing={14}
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
        yAxisLabelPrefix="₱"
        formatYLabel={formatAxisValue}
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
        scrollToEnd
        disableScroll={chartData.chartWidth <= availableWidth}
        nestedScrollEnabled
        isAnimated
        animationDuration={600}
        allowFontScaling={false}
      />
    </View>
  );
}
