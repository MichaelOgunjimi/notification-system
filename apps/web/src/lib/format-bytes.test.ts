import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1536, "1.5 KB"],
    [48_213, "47 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
    [3 * 1024 ** 3, "3.0 GB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
