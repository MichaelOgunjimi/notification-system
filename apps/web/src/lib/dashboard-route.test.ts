import { describe, expect, it } from "vitest";

import { dashboardPath, parseDashboardPath, readLastDashboardPath } from "./dashboard-route";

describe("parseDashboardPath", () => {
  it("round-trips a canonical dashboard path", () => {
    expect(parseDashboardPath(dashboardPath("acme-co", "web-app"))).toEqual({
      organizationSlug: "acme-co",
      projectSlug: "web-app",
    });
  });

  it.each(["/workspace", "/app/acme", "/app/acme/web/settings", "/app/Acme/web", "//app/a/b"])(
    "rejects %s",
    (path) => {
      expect(parseDashboardPath(path)).toBeNull();
    },
  );
});

describe("readLastDashboardPath", () => {
  const cookie = (userId: string, path: string) =>
    `beaco_last_dashboard=${encodeURIComponent(JSON.stringify({ userId, path }))}`;

  it("only restores the path for the same user", () => {
    const header = `a=1; ${cookie("user-1", "/app/acme/web")}`;
    expect(readLastDashboardPath("user-1", header)).toBe("/app/acme/web");
    expect(readLastDashboardPath("user-2", header)).toBeNull();
  });
});
