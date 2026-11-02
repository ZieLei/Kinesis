import { useMemo, useState } from "react";
import { View, Text, type LayoutChangeEvent } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import type { SalesReportResponse } from "@/types/sale";

type Props = {
  report: SalesReportResponse | null;
  loading: boolean;
  isDark: boolean;
};

type Point = { x: number; y: number };

/* ------------------------------------------------------------------ */
/* Layout constants                                                    */
/* ------------------------------------------------------------------ */

const CARD_PADDING_X = 20; // matches px-5 on the card's parent ScrollView content
const CARD_PADDING_BOTTOM = 15; // matches py-[15px] on the card content
const PLOT_HEIGHT = 96; // height of the line area
const TOP_INSET = 16; // room for the marker halo
const BASELINE_INSET = 10; // lifts zero-days off the baseline so the stroke isn't clipped
const LABEL_HEIGHT = 22;
const RIGHT_INSET = 14; // keeps the last-point marker from being cut off by the card edge
const LABEL_WIDTH = 34;

/* ------------------------------------------------------------------ */
/* Monotone cubic interpolation (never overshoots between points)      */
/* ------------------------------------------------------------------ */

function buildSmoothPath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;

  const dx: number[] = [];
  const m: number[] = []; // secant slopes

  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    m[i] = (points[i + 1].y - points[i].y) / dx[i];
  }

  // Tangents
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];

  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }

  // Fritsch–Carlson clamp to guarantee monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }

    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;

    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const seg = dx[i] / 3;

    d += ` C ${p0.x + seg} ${p0.y + t[i] * seg}, ${p1.x - seg} ${p1.y - t[i + 1] * seg
      }, ${p1.x} ${p1.y}`;
  }

  return d;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function WeeklyRevenueChart({ report, isDark }: Props) {
  const [width, setWidth] = useState(0);

  const lineColor = isDark ? "#1e66f5" : "#89b4fa";
  const labelColor = isDark ? "#6c6f85" : "#a6adc8";
  const markerFill = isDark ? "#dce0e8" : "#181825";

  const series = useMemo(() => {
    if (
      !report ||
      report.period !== "weekly" ||
      !Array.isArray(report.trailing_series) ||
      report.trailing_series.length !== 7
    ) {
      return null;
    }

    return report.trailing_series.map((point) => ({
      label: point.label,
      value: Number.isFinite(point.sales) ? Math.max(0, point.sales) : 0,
    }));
  }, [report]);

  // Total drawing height: plot + label row + the card's bottom padding
  // so the glow bleeds all the way to the bottom edge of the card.
  const totalHeight = PLOT_HEIGHT + LABEL_HEIGHT + CARD_PADDING_BOTTOM;
  const baselineY = PLOT_HEIGHT - BASELINE_INSET;

  const geometry = useMemo(() => {
    if (!series || width <= 0) return null;

    const maximum = Math.max(...series.map((s) => s.value));
    const usableWidth = width - RIGHT_INSET;
    const stepX = usableWidth / (series.length - 1);
    const plotRange = baselineY - TOP_INSET;

    const points: Point[] = series.map((s, i) => ({
      x: i * stepX,
      // All-zero week => flat line resting on the baseline
      y: maximum === 0 ? baselineY : baselineY - (s.value / maximum) * plotRange,
    }));

    const linePath = buildSmoothPath(points);
    const last = points[points.length - 1];
    const first = points[0];

    const areaPath = `${linePath} L ${last.x} ${totalHeight} L ${first.x} ${totalHeight} Z`;

    return { points, linePath, areaPath, last };
  }, [series, width, baselineY, totalHeight]);

  if (!series) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <View
      onLayout={onLayout}
      style={{
        // Break out of the card's horizontal + bottom padding
        marginHorizontal: -CARD_PADDING_X,
        marginBottom: -CARD_PADDING_BOTTOM,
        marginTop: 8,
        height: totalHeight,
      }}
    >
      {geometry ? (
        <>
          <Svg width={width} height={totalHeight}>
            <Defs>
              <LinearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.42} />
                <Stop offset="0.55" stopColor={lineColor} stopOpacity={0.12} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Gradient glow under the line */}
            <Path d={geometry.areaPath} fill="url(#revenueFill)" />

            {/* Soft outer glow stroke */}
            <Path
              d={geometry.linePath}
              stroke={lineColor}
              strokeOpacity={0.18}
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Main line */}
            <Path
              d={geometry.linePath}
              stroke={lineColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Last-point marker with halo */}
            <Circle
              cx={geometry.last.x}
              cy={geometry.last.y}
              r={11}
              fill={lineColor}
              fillOpacity={0.2}
            />
            <Circle
              cx={geometry.last.x}
              cy={geometry.last.y}
              r={5.5}
              fill={markerFill}
              stroke={lineColor}
              strokeWidth={2.5}
            />
          </Svg>

          {/* X-axis labels (overlaid so the glow runs behind them) */}
          {series.map((point, i) => {
            const x = geometry.points[i].x;
            const left = Math.min(
              Math.max(x - LABEL_WIDTH / 2, 4),
              width - LABEL_WIDTH - 4,
            );

            return (
              <Text
                key={`${point.label}-${i}`}
                allowFontScaling={false}
                style={{
                  position: "absolute",
                  top: PLOT_HEIGHT + 2,
                  left,
                  width: LABEL_WIDTH,
                  textAlign: "center",
                  color: labelColor,
                  fontSize: 10,
                  fontFamily: "LINESeed-Regular",
                }}
              >
                {point.label}
              </Text>
            );
          })}
        </>
      ) : null}
    </View>
  );
}
