/**
 * Calendar-date helpers for the report date filter.
 *
 * Every date here is a plain "YYYY-MM-DD" string in the shop's report time
 * zone, never a Date in the device's zone, so a range such as Nov 21 - Dec 20
 * means the same days on every phone and browser. Arithmetic goes through UTC
 * midnights, which have no daylight-saving gaps.
 *
 * Pure functions only (no React, no I/O).
 */

export const REPORT_TIME_ZONE = "Asia/Manila";

/** Longest range the server accepts (keep in sync with MAX_CUSTOM_RANGE_DAYS). */
export const MAX_RANGE_DAYS = 731;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type DateRange = { start: string; end: string };

export type RangePreset = DateRange & { id: string; label: string };

function toMs(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(value: string): boolean {
  const ms = toMs(value);
  return Number.isFinite(ms) && fromMs(ms) === value;
}

export function addDays(iso: string, days: number): string {
  return fromMs(toMs(iso) + days * DAY_MS);
}

/** Number of days from start to end, both included. */
export function inclusiveDays(start: string, end: string): number {
  return Math.round((toMs(end) - toMs(start)) / DAY_MS) + 1;
}

/** Today's date in the report time zone. */
export function todayInReportZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Why a range cannot be used, or null when it is fine. */
export function validateRange(start: string, end: string): string | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return "Enter both dates as YYYY-MM-DD.";
  if (end < start) return "The end date cannot be before the start date.";
  if (inclusiveDays(start, end) > MAX_RANGE_DAYS) {
    return `Choose a range of at most ${MAX_RANGE_DAYS} days (two years).`;
  }
  return null;
}

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function formatDay(iso: string, withYear: boolean): string {
  const { year, month, day } = parts(iso);
  return `${MONTHS[month - 1]} ${day}${withYear ? `, ${year}` : ""}`;
}

/** "Nov 21 – Dec 20, 2026"; the year is repeated only when the range spans two. */
export function formatRangeLabel(start: string, end: string): string {
  if (start === end) return formatDay(start, true);
  if (parts(start).year === parts(end).year) {
    return `${formatDay(start, false)} – ${formatDay(end, true)}`;
  }
  return `${formatDay(start, true)} – ${formatDay(end, true)}`;
}

export function formatDayCount(start: string, end: string): string {
  const days = inclusiveDays(start, end);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Quick ranges offered inside the picker, all ending today or earlier. */
export function rangePresets(today: string): RangePreset[] {
  const { year, month } = parts(today);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;

  return [
    { id: "last7", label: "Last 7 days", start: addDays(today, -6), end: today },
    { id: "last30", label: "Last 30 days", start: addDays(today, -29), end: today },
    { id: "last90", label: "Last 90 days", start: addDays(today, -89), end: today },
    { id: "thisMonth", label: "This month", start: monthStart, end: today },
    { id: "lastMonth", label: "Last month", start: lastMonthStart, end: lastMonthEnd },
    { id: "yearToDate", label: "Year to date", start: `${year}-01-01`, end: today },
  ];
}

export type CalendarDay = { iso: string; day: number; inMonth: boolean };

/** Six weeks (Monday first, like the weekly reports) covering a month. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const mondayOffset = (new Date(toMs(first)).getUTCDay() + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const iso = addDays(gridStart, week * 7 + weekday);
      const day = parts(iso);
      return { iso, day: day.day, inMonth: day.year === year && day.month === month };
    }),
  );
}

export function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
