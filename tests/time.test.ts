import { describe, expect, it } from "vitest";
import { endOfDay, startOfDay, startOfToday } from "@/application/time";

describe("Today calendar boundaries", () => {
  it.each([
    ["2026-09-05T02:30:00.000Z", "Asia/Shanghai", "2026-09-04T16:00:00.000Z"],
    ["2026-09-04T15:59:59.999Z", "Asia/Shanghai", "2026-09-03T16:00:00.000Z"],
    ["2026-09-04T16:00:00.000Z", "Asia/Shanghai", "2026-09-04T16:00:00.000Z"],
    ["2026-09-05T02:30:00.000Z", "UTC", "2026-09-05T00:00:00.000Z"],
    ["2026-09-05T02:30:00.000Z", "Asia/Kolkata", "2026-09-04T18:30:00.000Z"],
    ["2026-09-05T02:30:00.000Z", "America/New_York", "2026-09-04T04:00:00.000Z"],
    ["2026-03-08T18:00:00.000Z", "America/New_York", "2026-03-08T05:00:00.000Z"],
    ["2026-11-01T18:00:00.000Z", "America/New_York", "2026-11-01T04:00:00.000Z"],
    ["2026-01-01T00:30:00.000Z", "America/Los_Angeles", "2025-12-31T08:00:00.000Z"],
  ])("maps %s in %s to the correct UTC midnight", (now, zone, expected) => {
    expect(startOfToday(new Date(now), zone)).toBe(expected);
  });
  it("reports an invalid timezone rather than silently using another calendar", () => {
    expect(() => startOfToday(new Date("2026-09-05T00:00:00Z"), "Invalid/Zone")).toThrow();
  });

  it.each([
    ["2026-09-05", "Asia/Shanghai", "2026-09-04T16:00:00.000Z", "2026-09-05T15:59:59.999Z", 24],
    ["2026-03-08", "America/New_York", "2026-03-08T05:00:00.000Z", "2026-03-09T03:59:59.999Z", 23],
    ["2026-11-01", "America/New_York", "2026-11-01T04:00:00.000Z", "2026-11-02T04:59:59.999Z", 25],
    ["2026-12-31", "UTC", "2026-12-31T00:00:00.000Z", "2026-12-31T23:59:59.999Z", 24],
    ["2028-02-29", "Asia/Kolkata", "2028-02-28T18:30:00.000Z", "2028-02-29T18:29:59.999Z", 24],
  ])("uses the whole local date %s in %s, including DST and calendar rollover", (date, zone, start, end, hours) => {
    expect(startOfDay(date, zone)).toBe(start);
    expect(endOfDay(date, zone)).toBe(end);
    expect(Date.parse(endOfDay(date, zone)) - Date.parse(startOfDay(date, zone)) + 1).toBe(Number(hours) * 60 * 60 * 1000);
  });
});
