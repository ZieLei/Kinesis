// Tests for the report date-range helpers.
//   node --import ./tests/web/register.mjs --test tests/web/
import { test } from "node:test";
import assert from "node:assert/strict";

import * as range from "../../src/lib/dateRange.ts";

test("isIsoDate rejects impossible dates", () => {
  assert.equal(range.isIsoDate("2026-11-21"), true);
  assert.equal(range.isIsoDate("2028-02-29"), true);
  assert.equal(range.isIsoDate("2026-02-29"), false);
  assert.equal(range.isIsoDate("2026-2-9"), false);
  assert.equal(range.isIsoDate("tomorrow"), false);
});

test("day arithmetic crosses months and years", () => {
  assert.equal(range.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(range.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(range.inclusiveDays("2026-11-21", "2026-12-20"), 30);
  assert.equal(range.inclusiveDays("2026-11-21", "2026-11-21"), 1);
});

test("today follows the shop time zone, not the device's", () => {
  // 18:00 UTC on Nov 14 is already Nov 15 in Manila (UTC+8).
  assert.equal(range.todayInReportZone(new Date("2026-11-14T18:00:00Z")), "2026-11-15");
  assert.equal(range.todayInReportZone(new Date("2026-11-14T15:59:00Z")), "2026-11-14");
});

test("validateRange", () => {
  assert.equal(range.validateRange("2026-11-21", "2026-12-20"), null);
  assert.match(range.validateRange("2026-12-20", "2026-11-21"), /before the start/);
  assert.match(range.validateRange("2026-11-21", "nope"), /YYYY-MM-DD/);
  assert.equal(range.validateRange("2025-01-01", "2026-12-31"), null); // 730 days
  assert.match(range.validateRange("2024-01-01", "2026-12-31"), /at most 731/);
});

test("range labels", () => {
  assert.equal(range.formatRangeLabel("2026-11-21", "2026-12-20"), "Nov 21 – Dec 20, 2026");
  assert.equal(range.formatRangeLabel("2025-12-28", "2026-01-03"), "Dec 28, 2025 – Jan 3, 2026");
  assert.equal(range.formatRangeLabel("2026-11-21", "2026-11-21"), "Nov 21, 2026");
  assert.equal(range.formatDayCount("2026-11-21", "2026-12-20"), "30 days");
  assert.equal(range.formatDayCount("2026-11-21", "2026-11-21"), "1 day");
});

test("presets are valid and end on or before today", () => {
  const presets = range.rangePresets("2026-01-10");
  for (const preset of presets) {
    assert.equal(range.validateRange(preset.start, preset.end), null, preset.id);
    assert.ok(preset.end <= "2026-01-10", preset.id);
  }
  const byId = Object.fromEntries(presets.map((p) => [p.id, p]));
  assert.deepEqual(byId.last7, { id: "last7", label: "Last 7 days", start: "2026-01-04", end: "2026-01-10" });
  assert.equal(byId.lastMonth.start, "2025-12-01");
  assert.equal(byId.lastMonth.end, "2025-12-31");
  assert.equal(byId.yearToDate.start, "2026-01-01");
});

test("monthGrid starts on Monday and covers the month", () => {
  const grid = range.monthGrid(2026, 11); // Nov 1 2026 is a Sunday
  assert.equal(grid.length, 6);
  assert.equal(grid[0][0].iso, "2026-10-26");
  assert.equal(grid[0][6].iso, "2026-11-01");
  assert.equal(grid[0][6].inMonth, true);
  assert.equal(grid[0][0].inMonth, false);
  const days = grid.flat().filter((d) => d.inMonth).map((d) => d.day);
  assert.equal(days.length, 30);
});

test("shiftMonth wraps years", () => {
  assert.deepEqual(range.shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(range.shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(range.shiftMonth(2026, 6, -18), { year: 2024, month: 12 });
});
