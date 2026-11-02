
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { useColorScheme } from "nativewind";

import {
  fetchBusinessAnalytics,
  fetchInventoryValuation,
} from "@/lib/analyticsApi";

import { usePOSFormatting } from "@/hooks/usePOSFormatting";

import type {
  BusinessAnalyticsReport,
  InventoryValuationResponse,
} from "@/types/analytics";
import type { ReportPeriod } from "@/types/sale";

type Props = {
  period: ReportPeriod;
  refreshToken: number;
};

const count = (value: number) => value.toLocaleString("en-PH");

function niceStep(max: number, sections = 4) {
  if (max <= 0) return 1;
  const target = max / sections;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;

  return (
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10
  ) * magnitude;
}

const compactAxis = (label: string) => {
  const value = Number(label);
  if (!Number.isFinite(value)) return label;

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }

  return Math.round(value).toString();
};

const chartTheme = (isDark: boolean) => ({
  muted: isDark ? "#a6adc8" : "#6c6f85",
  axis: isDark ? "#45475a" : "#ccd0da",
  grid: isDark ? "#313244" : "#dce0e8",
  blue: isDark ? "#89b4fa" : "#1e66f5",
  blueSoft: isDark
    ? "rgba(137,180,250,0.25)"
    : "rgba(30,102,245,0.25)",
  green: isDark ? "#a6e3a1" : "#40a02b",
  greenSoft: isDark
    ? "rgba(166,227,161,0.25)"
    : "rgba(64,160,43,0.25)",
  red: isDark ? "#f38ba8" : "#d20f39",
  redSoft: isDark
    ? "rgba(243,139,168,0.25)"
    : "rgba(210,15,57,0.25)",
  mauve: isDark ? "#cba6f7" : "#8839ef",
});

type ChartTheme = ReturnType<typeof chartTheme>;

const Y_W = 58;

function useInnerWidth(yGutter = Y_W) {
  const { width } = useWindowDimensions();
  return Math.max(200, width - 72 - yGutter);
}

const sharedAxisProps = (
  theme: ChartTheme,
  formatAxisCurrency?: (value: number) => string,
) => ({
  hideOrigin: true,
  yAxisThickness: 0,
  xAxisThickness: 1,
  xAxisColor: theme.axis,
  yAxisLabelWidth: Y_W,
  formatYLabel: (label: string) =>
    formatAxisCurrency
      ? formatAxisCurrency(Number(label))
      : compactAxis(label),
  yAxisTextStyle: {
    color: theme.muted,
    fontSize: 10,
    fontFamily: "LINESeed-Regular",
  },
  xAxisLabelTextStyle: {
    color: theme.muted,
    fontSize: 10,
    fontFamily: "LINESeed-Regular",
  },
  rulesColor: theme.grid,
  rulesThickness: 1,
  rulesType: "dashed" as const,
  dashWidth: 4,
  dashGap: 5,
  backgroundColor: "transparent",
  nestedScrollEnabled: true,
  isAnimated: true,
  animationDuration: 600,
  allowFontScaling: false,
});

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3 rounded-lg bg-ctp-mantle p-4">
      <View>
        <Text className="font-inter-semibold text-base text-ctp-text">
          {title}
        </Text>

        {subtitle ? (
          <Text className="mt-1 text-xs leading-5 text-ctp-subtext0">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {children}
    </View>
  );
}

function Legend({
  entries,
}: {
  entries: { label: string; color: string }[];
}) {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      {entries.map((entry) => (
        <View key={entry.label} className="flex-row items-center gap-2">
          <View
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <Text className="text-xs text-ctp-subtext0">{entry.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Payment method breakdown                                            */
/* ------------------------------------------------------------------ */

function PaymentBreakdown({
  report,
}: {
  report: BusinessAnalyticsReport;
}) {
  const { formatCurrency } = usePOSFormatting();

  const cash = report.payment_methods.find(
    (item) => item.method === "cash",
  );

  const gcash = report.payment_methods.find(
    (item) => item.method === "gcash",
  );

  const methods = [
    { label: "Cash", color: "#40A02B", data: cash },
    { label: "GCash", color: "#1E66F5", data: gcash },
  ];

  return (
    <Card
      title="Payment Method Breakdown"
      subtitle="Completed transactions, based on the amount collected."
    >
      <View className="flex-row gap-1 overflow-hidden rounded-full bg-ctp-surface0">
        {methods.map((method) => (
          <View
            key={method.label}
            style={{
              width: `${method.data?.percentage ?? 0}%`,
              height: 13,
              backgroundColor: method.color,
            }}
          />
        ))}
      </View>

      {methods.map((method) => (
        <View
          key={method.label}
          className="flex-row items-center justify-between gap-3"
        >
          <View className="flex-1 flex-row items-center gap-2">
            <View
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: method.color }}
            />

            <Text className="font-inter-medium text-sm text-ctp-text">
              {method.label}
            </Text>
          </View>

          <View className="items-end">
            <Text className="font-inter-semibold text-sm text-ctp-text">
              {formatCurrency(method.data?.revenue ?? 0)}
            </Text>

            <Text className="text-xs text-ctp-subtext0">
              {count(method.data?.transactions ?? 0)} transactions ·{" "}
              {method.data?.percentage ?? 0}%
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Revenue vs Gross Profit                                             */
/* ------------------------------------------------------------------ */

function RevenueProfitChart({
  report,
  isDark,
}: {
  report: BusinessAnalyticsReport;
  isDark: boolean;
}) {
  const { formatCurrency, formatCompactCurrency } =
    usePOSFormatting();

  const theme = useMemo(() => chartTheme(isDark), [isDark]);
  const innerWidth = useInnerWidth();
  const points = report.revenue_profit_series;

  const BAR_W = 10;
  const INNER_GAP = 3;
  const GROUP_GAP = 18;
  const LABEL_W = 36;

  const { data, maxValue, stepValue, chartWidth } = useMemo(() => {
    const max = Math.max(
      0,
      ...points.flatMap((point) => [
        point.revenue,
        Math.abs(point.gross_profit ?? 0),
      ]),
    );

    const step = niceStep(max);

    const items = points.flatMap((point) => {
      const profit = point.gross_profit;
      const negative = profit !== null && profit < 0;

      return [
        {
          value: point.revenue,
          frontColor: theme.blue,
          gradientColor: theme.blueSoft,
          spacing: INNER_GAP,
          labelComponent: () => (
            <Text
              allowFontScaling={false}
              style={{
                width: LABEL_W,
                marginLeft:
                  -(LABEL_W - (BAR_W * 2 + INNER_GAP)) / 2,
                textAlign: "center",
                color: theme.muted,
                fontSize: 10,
                fontFamily: "LINESeed-Regular",
              }}
            >
              {point.label}
            </Text>
          ),
        },
        {
          value: profit === null ? 0 : Math.abs(profit),
          frontColor: negative ? theme.red : theme.green,
          gradientColor: negative
            ? theme.redSoft
            : theme.greenSoft,
          spacing: GROUP_GAP,
        },
      ];
    });

    return {
      data: items,
      maxValue: step * 4,
      stepValue: step,
      chartWidth: Math.max(
        innerWidth,
        points.length *
        (BAR_W * 2 + INNER_GAP + GROUP_GAP) +
        24,
      ),
    };
  }, [points, theme, innerWidth]);

  return (
    <Card
      title="Revenue vs Gross Profit"
      subtitle="Revenue excludes tax and cash rounding. Profit covers only items with recorded acquisition costs."
    >
      <Legend
        entries={[
          { label: "Revenue", color: theme.blue },
          { label: "Known gross profit", color: theme.green },
          { label: "Negative profit", color: theme.red },
        ]}
      />

      <BarChart
        data={data}
        width={chartWidth}
        height={150}
        barWidth={BAR_W}
        initialSpacing={12}
        endSpacing={8}
        maxValue={maxValue}
        stepValue={stepValue}
        noOfSections={4}
        barBorderTopLeftRadius={5}
        barBorderTopRightRadius={5}
        showGradient
        xAxisLabelsHeight={24}
        disableScroll={chartWidth <= innerWidth}
        {...sharedAxisProps(theme, formatCompactCurrency)}
      />

      <View className="gap-1 border-t border-ctp-surface0 pt-3">
        <View className="flex-row justify-between">
          <Text className="text-xs text-ctp-subtext0">Revenue</Text>
          <Text className="text-xs font-inter-semibold text-ctp-text">
            {formatCurrency(report.revenue_profit.revenue)}
          </Text>
        </View>

        <View className="flex-row justify-between">
          <Text className="text-xs text-ctp-subtext0">
            Known gross profit
          </Text>
          <Text className="text-xs font-inter-semibold text-ctp-text">
            {report.revenue_profit.known_gross_profit === null
              ? "Unavailable"
              : formatCurrency(
                report.revenue_profit.known_gross_profit,
              )}
          </Text>
        </View>

        <View className="flex-row justify-between">
          <Text className="text-xs text-ctp-subtext0">
            Cost coverage
          </Text>
          <Text className="text-xs font-inter-semibold text-ctp-text">
            {report.revenue_profit.cost_coverage}%
          </Text>
        </View>
      </View>

      <Text className="text-xs leading-5 text-ctp-subtext0">
        {report.revenue_profit.uncosted_line_count} of{" "}
        {report.revenue_profit.total_line_count} sale lines have unknown
        costs. Profit is therefore a partial figure until cost data is
        available.
      </Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Parts vs Service revenue                                            */
/* ------------------------------------------------------------------ */

function RevenueBreakdownChart({
  report,
  isDark,
}: {
  report: BusinessAnalyticsReport;
  isDark: boolean;
}) {
  const { formatCurrency, formatCompactCurrency } =
    usePOSFormatting();

  const theme = useMemo(() => chartTheme(isDark), [isDark]);
  const innerWidth = useInnerWidth();
  const points = report.revenue_breakdown_series;

  const BAR_W = 20;
  const GAP = 18;

  const partsTotal =
    report.revenue_breakdown.find(
      (item) => item.type === "parts",
    )?.revenue ?? 0;

  const servicesTotal =
    report.revenue_breakdown.find(
      (item) => item.type === "services",
    )?.revenue ?? 0;

  const { stacks, maxValue, stepValue, chartWidth } = useMemo(() => {
    const max = Math.max(
      0,
      ...points.map((point) => point.parts + point.services),
    );

    const step = niceStep(max);

    return {
      stacks: points.map((point) => ({
        label: point.label,
        stacks: [
          { value: point.parts, color: theme.blue },
          { value: point.services, color: theme.mauve },
        ],
      })),
      maxValue: step * 4,
      stepValue: step,
      chartWidth: Math.max(
        innerWidth,
        points.length * (BAR_W + GAP) + 24,
      ),
    };
  }, [points, theme, innerWidth]);

  return (
    <Card
      title="Parts vs Service Revenue"
      subtitle="Revenue contribution before tax, grouped by the selected reporting period."
    >
      <Legend
        entries={[
          { label: "Parts", color: theme.blue },
          { label: "Services", color: theme.mauve },
        ]}
      />

      <BarChart
        stackData={stacks}
        width={chartWidth}
        height={150}
        barWidth={BAR_W}
        spacing={GAP}
        initialSpacing={12}
        endSpacing={8}
        maxValue={maxValue}
        stepValue={stepValue}
        noOfSections={4}
        stackBorderRadius={6}
        xAxisLabelsHeight={24}
        disableScroll={chartWidth <= innerWidth}
        {...sharedAxisProps(theme, formatCompactCurrency)}
      />

      <View className="gap-2 border-t border-ctp-surface0 pt-3">
        <View className="flex-row justify-between">
          <Text className="text-xs text-ctp-subtext0">
            Parts revenue
          </Text>
          <Text className="text-xs font-inter-semibold text-ctp-text">
            {formatCurrency(partsTotal)}
          </Text>
        </View>

        <View className="flex-row justify-between">
          <Text className="text-xs text-ctp-subtext0">
            Service revenue
          </Text>
          <Text className="text-xs font-inter-semibold text-ctp-text">
            {formatCurrency(servicesTotal)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Peak sales hours                                                    */
/* ------------------------------------------------------------------ */

function PeakHoursChart({
  report,
  isDark,
}: {
  report: BusinessAnalyticsReport;
  isDark: boolean;
}) {
  const theme = useMemo(() => chartTheme(isDark), [isDark]);

  const PEAK_Y_W = 28;
  const innerWidth = useInnerWidth(PEAK_Y_W);

  const BAR_W = 9;
  const GAP = 8;

  const peakHours = useMemo(
    () =>
      new Set(
        report.peak_hours
          .filter((item) => item.transactions > 0)
          .slice(0, 3)
          .map((item) => item.hour),
      ),
    [report.peak_hours],
  );

  const { data, maxValue, stepValue, chartWidth } = useMemo(() => {
    const max = Math.max(
      1,
      ...report.hourly_sales.map((item) => item.transactions),
    );

    const step = Math.max(1, Math.ceil(max / 4));

    return {
      data: report.hourly_sales.map((item) => ({
        value: item.transactions,
        label:
          item.hour % 3 === 0
            ? String(item.hour).padStart(2, "0")
            : "",
        frontColor: peakHours.has(item.hour)
          ? theme.blue
          : theme.blueSoft,
        gradientColor: peakHours.has(item.hour)
          ? theme.blueSoft
          : "transparent",
      })),
      maxValue: step * 4,
      stepValue: step,
      chartWidth: Math.max(
        innerWidth,
        report.hourly_sales.length * (BAR_W + GAP) + 14,
      ),
    };
  }, [report.hourly_sales, peakHours, theme, innerWidth]);

  return (
    <Card
      title="Peak Sales Hours"
      subtitle="Completed transaction volume by local time in Asia/Manila."
    >
      <View className="flex-row flex-wrap gap-2">
        {report.peak_hours
          .filter((item) => item.transactions > 0)
          .slice(0, 5)
          .map((item, index) => (
            <View
              key={item.hour}
              className="rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2"
            >
              <Text className="text-[10px] font-inter-medium text-ctp-subtext0">
                #{index + 1}
              </Text>
              <Text className="font-inter-semibold text-sm text-ctp-text">
                {String(item.hour).padStart(2, "0")}:00
              </Text>
              <Text className="text-xs text-ctp-subtext0">
                {count(item.transactions)} sales
              </Text>
            </View>
          ))}
      </View>

      <BarChart
        data={data}
        width={chartWidth}
        height={130}
        barWidth={BAR_W}
        spacing={GAP}
        initialSpacing={10}
        endSpacing={4}
        maxValue={maxValue}
        stepValue={stepValue}
        noOfSections={4}
        barBorderTopLeftRadius={4}
        barBorderTopRightRadius={4}
        showGradient
        xAxisLabelsHeight={22}
        disableScroll={chartWidth <= innerWidth}
        {...sharedAxisProps(theme)}
        yAxisLabelWidth={PEAK_Y_W}
        formatYLabel={(label: string) =>
          String(Math.round(Number(label)))
        }
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Busy time heatmap                                                   */
/* ------------------------------------------------------------------ */

function SalesHeatmap({
  report,
  isDark,
}: {
  report: BusinessAnalyticsReport;
  isDark: boolean;
}) {
  const max = Math.max(1, report.heatmap_max);

  const emptyColor = isDark ? "#313244" : "#E6E9EF";
  const tint = isDark ? "137,180,250" : "30,102,245";

  return (
    <Card
      title="Busy Time Heatmap"
      subtitle="Transaction counts by weekday and hour. Darker cells indicate busier periods."
    >
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View className="mb-2 ml-[72px] flex-row">
            {Array.from({ length: 24 }, (_, hour) => (
              <View key={hour} className="w-[22px] items-center">
                <Text className="text-[9px] text-ctp-subtext0">
                  {hour % 3 === 0
                    ? String(hour).padStart(2, "0")
                    : ""}
                </Text>
              </View>
            ))}
          </View>

          {report.heatmap.map((row) => (
            <View
              key={row.weekday}
              className="mb-1 flex-row items-center"
            >
              <Text className="w-[68px] text-xs text-ctp-subtext0">
                {row.weekday.slice(0, 3)}
              </Text>

              {row.hours.map((value, hour) => {
                const intensity = value / max;

                return (
                  <View
                    key={`${row.weekday}-${hour}`}
                    className="mx-[1px] h-[18px] w-[20px] rounded-[3px]"
                    style={{
                      backgroundColor:
                        value === 0
                          ? emptyColor
                          : `rgba(${tint},${0.18 + intensity * 0.82})`,
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] text-ctp-subtext0">
          Fewer transactions
        </Text>

        <View className="flex-row gap-1">
          {[0.18, 0.35, 0.55, 0.8, 1].map((opacity) => (
            <View
              key={opacity}
              className="h-3 w-3 rounded-sm"
              style={{
                backgroundColor: `rgba(${tint},${opacity})`,
              }}
            />
          ))}
        </View>

        <Text className="text-[10px] text-ctp-subtext0">
          More transactions
        </Text>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Inventory analytics                                                 */
/* ------------------------------------------------------------------ */

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View className="min-w-0 flex-1 rounded-lg bg-ctp-base p-3">
      <Text className="text-xs text-ctp-subtext0">{label}</Text>

      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        className="mt-1 font-inter-bold text-lg text-ctp-text"
      >
        {value}
      </Text>

      {detail ? (
        <Text className="mt-1 text-[10px] text-ctp-subtext0">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function InventoryAnalytics({
  valuation,
}: {
  valuation: InventoryValuationResponse;
}) {
  const { formatCurrency } = usePOSFormatting();

  const summary = valuation.summary;
  const opportunity = valuation.stockout_opportunity;

  return (
    <>
      <Card
        title="Inventory Valuation"
        subtitle="Current stock snapshot, independent of the selected sales period."
      >
        <View className="flex-row gap-2">
          <Metric
            label="Capital tied up"
            value={formatCurrency(summary.inventory_cost_value)}
            detail={`${count(summary.valued_units)} costed units`}
          />

          <Metric
            label="Retail value"
            value={formatCurrency(summary.estimated_retail_value)}
            detail={`${count(summary.total_units)} units on hand`}
          />
        </View>

        <View className="flex-row gap-2">
          <Metric
            label="Uncosted inventory"
            value={formatCurrency(summary.uncosted_retail_value)}
            detail={`${count(summary.uncosted_units)} units`}
          />

          <Metric
            label="Known margin at retail"
            value={formatCurrency(
              summary.known_inventory_gross_margin,
            )}
            detail="Costed units only"
          />
        </View>

        <Text className="text-xs leading-5 text-ctp-subtext0">
          Capital tied up uses recorded weighted-average acquisition costs.
          Uncosted inventory is excluded from that figure and shown
          separately.
        </Text>
      </Card>

      <Card
        title="Stockout Opportunity"
        subtitle="Demand estimate based on the 30 days before each recorded stockout."
      >
        <View className="rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-3">
          <Text className="text-xs font-inter-medium text-ctp-red">
            Potential missed revenue
          </Text>

          <Text className="mt-1 font-inter-bold text-2xl text-ctp-text">
            {formatCurrency(opportunity.estimated_lost_revenue)}
          </Text>

          <Text className="mt-1 text-xs text-ctp-subtext0">
            {count(opportunity.estimated_lost_units)} estimated units of
            demand
          </Text>
        </View>

        <View className="flex-row justify-between">
          <Text className="text-xs text-ctp-subtext0">
            Estimated gross profit opportunity
          </Text>

          <Text className="text-sm font-inter-semibold text-ctp-text">
            {formatCurrency(
              opportunity.estimated_lost_gross_profit,
            )}
          </Text>
        </View>

        <Text className="text-xs text-ctp-subtext0">
          Gross-profit cost coverage:{" "}
          {opportunity.gross_profit_cost_coverage}%
        </Text>

        {opportunity.items.length > 0 ? (
          <View className="gap-3 border-t border-ctp-surface0 pt-3">
            <Text className="font-inter-semibold text-sm text-ctp-text">
              Highest estimated exposure
            </Text>

            {opportunity.items.slice(0, 5).map((item) => (
              <View
                key={`${item.product_id}-${item.started_at}`}
                className="flex-row items-center justify-between gap-3"
              >
                <View className="flex-1">
                  <Text
                    numberOfLines={1}
                    className="font-inter-medium text-sm text-ctp-text"
                  >
                    {item.name}
                  </Text>

                  <Text className="text-xs text-ctp-subtext0">
                    {item.duration_days} days unavailable ·{" "}
                    {item.estimated_lost_units} estimated units
                  </Text>
                </View>

                <Text className="font-inter-semibold text-sm text-ctp-text">
                  {formatCurrency(item.estimated_lost_revenue)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-ctp-subtext0">
            No stockout demand estimates are available yet.
          </Text>
        )}

        <Text className="text-xs leading-5 text-ctp-subtext0">
          These figures estimate potential demand, not confirmed lost orders.
          Products without recorded costs are excluded from the gross-profit
          estimate.
        </Text>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

function getError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Analytics could not be loaded.";
}

export default function BusinessAnalyticsSection({
  period,
  refreshToken,
}: Props) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [report, setReport] =
    useState<BusinessAnalyticsReport | null>(null);

  const [valuation, setValuation] =
    useState<InventoryValuationResponse | null>(null);

  const [reportError, setReportError] = useState("");
  const [valuationError, setValuationError] = useState("");

  const [reportLoading, setReportLoading] = useState(true);
  const [valuationLoading, setValuationLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    setReportLoading(true);
    setReportError("");

    void fetchBusinessAnalytics(period, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setReport(result);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setReportError(getError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setReportLoading(false);
        }
      });

    return () => controller.abort();
  }, [period, refreshToken]);

  useEffect(() => {
    const controller = new AbortController();

    setValuationLoading(true);
    setValuationError("");

    void fetchInventoryValuation(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setValuation(result);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setValuationError(getError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setValuationLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshToken]);

  const transactionCount = useMemo(
    () => report?.transaction_count ?? 0,
    [report],
  );

  return (
    <View className="gap-4">
      {reportLoading ? (
        <View className="items-center justify-center rounded-lg bg-ctp-mantle py-12">
          <ActivityIndicator color={isDark ? "#89B4FA" : "#1E66F5"} />
          <Text className="mt-3 text-sm text-ctp-subtext0">
            Loading business analytics...
          </Text>
        </View>
      ) : reportError ? (
        <View className="rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-4">
          <Text className="font-inter-semibold text-sm text-ctp-red">
            Business analytics unavailable
          </Text>
          <Text className="mt-1 text-xs leading-5 text-ctp-subtext0">
            {reportError}
          </Text>
        </View>
      ) : report ? (
        <>
          <View className="flex-row items-center justify-between px-1">
            <Text className="font-inter-semibold text-sm text-ctp-text">
              Business Analytics
            </Text>

            <Text className="text-xs text-ctp-subtext0">
              {count(transactionCount)} transactions
            </Text>
          </View>

          <PaymentBreakdown report={report} />

          <RevenueProfitChart report={report} isDark={isDark} />

          <RevenueBreakdownChart report={report} isDark={isDark} />

          <PeakHoursChart report={report} isDark={isDark} />

          <SalesHeatmap report={report} isDark={isDark} />
        </>
      ) : null}

      {valuationLoading ? (
        <View className="items-center justify-center rounded-lg bg-ctp-mantle py-10">
          <ActivityIndicator color={isDark ? "#89B4FA" : "#1E66F5"} />
          <Text className="mt-3 text-sm text-ctp-subtext0">
            Loading inventory valuation...
          </Text>
        </View>
      ) : valuationError ? (
        <View className="rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-4">
          <Text className="font-inter-semibold text-sm text-ctp-red">
            Inventory valuation unavailable
          </Text>
          <Text className="mt-1 text-xs leading-5 text-ctp-subtext0">
            {valuationError}
          </Text>
        </View>
      ) : valuation ? (
        <InventoryAnalytics valuation={valuation} />
      ) : null}
    </View>
  );
}
