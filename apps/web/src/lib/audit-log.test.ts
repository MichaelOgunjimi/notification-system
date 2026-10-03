import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeTime } from "./audit-log";

describe("relativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("treats API timestamps without an offset as UTC", () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T12:00:30Z"));

    expect(relativeTime("2026-10-03T12:00:00")).toBe("just now");
    expect(relativeTime("2026-10-03T09:00:00")).toBe("3 hours ago");
  });
});
