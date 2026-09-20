import { describe, expect, it } from "vitest";
import { getLogTableState } from "./log-table-state";

describe("getLogTableState", () => {
  it("uses a skeleton only for an initial load without rows", () => {
    expect(getLogTableState(null, true, 0)).toBe("pending");
  });

  it("keeps usable rows visible during a background refetch", () => {
    expect(getLogTableState(null, false, 3)).toBe("rows");
    expect(getLogTableState("Refresh failed", false, 3)).toBe("rows");
  });
});
