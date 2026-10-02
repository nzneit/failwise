import assert from "node:assert/strict";
import { test } from "node:test";
import { isCalendarDate, isRfc3339DateTime, nowIso } from "./lib/dates.ts";

test("isCalendarDate accepts real YYYY-MM-DD dates", () => {
  assert.equal(isCalendarDate("2026-09-07"), true);
  assert.equal(isCalendarDate("2024-02-29"), true);
  assert.equal(isCalendarDate("2000-02-29"), true);
  assert.equal(isCalendarDate("2026-12-31"), true);
});

test("isCalendarDate rejects impossible dates and wrong shapes", () => {
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("1900-02-29"), false);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("2026-00-10"), false);
  assert.equal(isCalendarDate("2026-09-00"), false);
  assert.equal(isCalendarDate("2026-9-7"), false);
  assert.equal(isCalendarDate(""), false);
  assert.equal(isCalendarDate("2026-09-07T00:00:00Z"), false);
});

test("isRfc3339DateTime accepts Z and numeric offsets, with or without a fraction", () => {
  assert.equal(isRfc3339DateTime("2026-09-07T10:00:00Z"), true);
  assert.equal(isRfc3339DateTime("2026-09-07T10:00:00.123+02:00"), true);
  assert.equal(isRfc3339DateTime("2026-09-07T23:59:60Z"), true);
  assert.equal(isRfc3339DateTime("2026-09-07T00:00:00-05:30"), true);
});

test("isRfc3339DateTime rejects a bad hour, a bad offset, a space separator, and a missing seconds field", () => {
  assert.equal(isRfc3339DateTime("2026-09-07T24:00:00Z"), false);
  assert.equal(isRfc3339DateTime("2026-09-07T10:60:00Z"), false);
  assert.equal(isRfc3339DateTime("2026-09-07 10:00:00Z"), false);
  assert.equal(isRfc3339DateTime("2026-09-07T10:00Z"), false);
  assert.equal(isRfc3339DateTime("2026-02-30T10:00:00Z"), false);
  assert.equal(isRfc3339DateTime("2026-09-07T10:00:00"), false);
  assert.equal(isRfc3339DateTime("2026-09-07"), false);
  assert.equal(isRfc3339DateTime("2026-09-07T10:00:00+24:00"), false);
  assert.equal(isRfc3339DateTime("2026-09-07T10:00:00-05:60"), false);
  assert.equal(isRfc3339DateTime("2026-09-07T10:00:00+99:99"), false);
  assert.equal(isRfc3339DateTime("2026-09-07T10:00:00+23:59"), true);
});

test("nowIso produces a value the date-time check accepts", () => {
  assert.equal(isRfc3339DateTime(nowIso()), true);
});
