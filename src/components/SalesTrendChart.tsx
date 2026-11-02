
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { buildSmoothPath, type Point } from "@/lib/smoothPath";
import { usePOSFormatting } from "@/hooks/usePOSFormatting";
import type { SalesReportResponse } from "@/types/sale";

type Props = {
  report: SalesReportResponse;
  isDark: boolean;
};

const PLOT_TOP = 34;
const PLOT_BOTTOM = 158;
const LABEL_H = 26;
const TOTAL_H = PLOT_BOTTOM + LABEL_H;
const Y_GUTTER = 46;
const RIGHT_PAD = 14;
const TOOLTIP_W = 140;
const LABEL_W = 36;

function niceStep(max: number, sections: number) {
  if (max <= 0) return 1;
  const target = max / sections;
  const mag = 10 ** Math.floor(Math.log10(target));
  const n = target / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export default function SalesTrendChart({ report, isDark }: Props) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const { formatCurrency, formatCompactCurrency } = usePOSFormatting();

  const line = isDark ? "#89b4fa" : "#1e66f5";
  const muted = isDark ? "#a6adc8" : "#6c6f85";
  const grid = isDark ? "#45475a" : "#ccd0da";
  const dotFill = isDark ? "#1e1e2e" : "#ffffff";
  const pillBg = isDark ? "#313244" : "#ffffff";
  const pillText = isDark ? "#cdd6f4" : "#4c4f69";

  useEffect(() => setPicked(null), [report]);

  const series = useMemo(
    () =>
      (Array.isArray(report.trailing_series)
        ? report.trailing_series
        : []
      ).map((p) => ({
        label: String(p.label),
        value: Number.isFinite(p.sales) ? Math.max(0, p.sales) : 0,
      })),
    [report],
  );

  const geo = useMemo(() => {
    if (series.length < 2 || width <= 0) return null;

    const max = Math.max(...series.map((s) => s.value));
    const step = niceStep(max, 2);
    const niceMax = max === 0 ? 0 : step * 2;

    const left = Y_GUTTER;
    const right = width - RIGHT_PAD;
    const stepX = (right - left) / (series.length - 1);

    const yFor = (value: number) =>
      niceMax === 0
        ? PLOT_BOTTOM
        : PLOT_BOTTOM -
        (value / niceMax) * (PLOT_BOTTOM - PLOT_TOP);

    const points: Point[] = series.map((s, i) => ({
      x: left + i * stepX,
      y: yFor(s.value),
    }));

    const linePath = buildSmoothPath(points);
    const first = points[0];
    const last = points[points.length - 1];

    const areaPath = `${linePath} L ${last.x} ${PLOT_BOTTOM} L ${first.x} ${PLOT_BOTTOM} Z`;

    const ticks =
      niceMax === 0
        ? []
        : [0, step, step * 2].map((value) => ({
          value,
          y: yFor(value),
        }));

    return { points, linePath, areaPath, ticks, stepX, left, right };
  }, [series, width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  if (series.length < 2) {
    return (
      <View className="items-center py-10">
        <Text className="text-sm text-ctp-subtext0">
          Not enough data to draw a trend yet.
        </Text>
      </View>
    );
  }

  const selected = picked ?? series.length - 1;
  const labelEvery = Math.ceil(series.length / 7);

  return (
    <View onLayout={onLayout} style={{ height: TOTAL_H }}>
      {geo ? (
        <>
          <Svg width={width} height={TOTAL_H}>
            <Defs>
              <LinearGradient
                id="trendFill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop offset="0" stopColor={line} stopOpacity={0.38} />
                <Stop offset="0.6" stopColor={line} stopOpacity={0.1} />
                <Stop offset="1" stopColor={line} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {geo.ticks.map((tick) => (
              <Line
                key={tick.value}
                x1={geo.left}
                x2={geo.right}
                y1={tick.y}
                y2={tick.y}
                stroke={grid}
                strokeWidth={1}
                strokeDasharray="4 5"
                strokeOpacity={tick.value === 0 ? 0.9 : 0.6}
              />
            ))}

            <Path d={geo.areaPath} fill="url(#trendFill)" />

            <Path
              d={geo.linePath}
              stroke={line}
              strokeOpacity={0.18}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            <Path
              d={geo.linePath}
              stroke={line}
              strokeWidth={2.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            <Line
              x1={geo.points[selected].x}
              x2={geo.points[selected].x}
              y1={PLOT_TOP - 6}
              y2={PLOT_BOTTOM}
              stroke={line}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="3 4"
            />

            <Circle
              cx={geo.points[selected].x}
              cy={geo.points[selected].y}
              r={10}
              fill={line}
              fillOpacity={0.2}
            />

            <Circle
              cx={geo.points[selected].x}
              cy={geo.points[selected].y}
              r={5}
              fill={dotFill}
              stroke={line}
              strokeWidth={2.5}
            />
          </Svg>

          {/* Y labels */}
          {geo.ticks.map((tick) => (
            <Text
              key={`y-${tick.value}`}
              allowFontScaling={false}
              style={{
                position: "absolute",
                left: 0,
                width: Y_GUTTER - 8,
                top: tick.y - 7,
                textAlign: "right",
                color: muted,
                fontSize: 10,
                fontFamily: "LINESeed-Regular",
              }}
            >
              {tick.value === 0
                ? formatCompactCurrency(0)
                : formatCompactCurrency(tick.value)}
            </Text>
          ))}

          {/* X labels */}
          {series.map((point, index) =>
            (series.length - 1 - index) % labelEvery === 0 ? (
              <Text
                key={`x-${index}`}
                allowFontScaling={false}
                style={{
                  position: "absolute",
                  top: PLOT_BOTTOM + 8,
                  left: Math.min(
                    Math.max(geo.points[index].x - LABEL_W / 2, 0),
                    width - LABEL_W,
                  ),
                  width: LABEL_W,
                  textAlign: "center",
                  color: index === selected ? line : muted,
                  fontSize: 10,
                  fontFamily: "LINESeed-Regular",
                }}
              >
                {point.label}
              </Text>
            ) : null,
          )}

          {/* Tooltip */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              width: TOOLTIP_W,
              left: Math.min(
                Math.max(
                  geo.points[selected].x - TOOLTIP_W / 2,
                  0,
                ),
                width - TOOLTIP_W,
              ),
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pillBg,
              borderWidth: 1,
              borderColor: grid,
            }}
          >
            <Text
              allowFontScaling={false}
              style={{
                color: pillText,
                fontSize: 11,
                fontFamily: "LINESeed-Regular",
              }}
            >
              {series[selected].label} ·{" "}
              {formatCurrency(series[selected].value)}
            </Text>
          </View>

          {/* Tap targets */}
          {geo.points.map((point, index) => (
            <Pressable
              key={`hit-${index}`}
              onPress={() => setPicked(index)}
              style={{
                position: "absolute",
                top: 0,
                height: TOTAL_H,
                left: point.x - geo.stepX / 2,
                width: geo.stepX,
              }}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}
