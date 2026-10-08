import { describe, expect, it } from "vitest";
import {
  canCancelScheduledEvent,
  channelList,
  parseScheduledStatusFilter,
  recipientSummary,
  scheduledDisplayStatus,
  scheduledStatusTone,
} from "./scheduled-events";

describe("scheduledDisplayStatus", () => {
  it.each([
    ["pending", null, "pending"],
    ["processing", null, "pending"],
    ["dispatched", null, "dispatched"],
    ["dispatched", "accepted", "dispatched"],
    ["dispatched", "processing", "dispatched"],
    ["dispatched", "completed", "completed"],
    ["dispatched", "partially_failed", "partially_failed"],
    ["dispatched", "failed", "delivery_failed"],
    ["failed", null, "failed"],
    ["expired", null, "expired"],
    ["cancelled", null, "cancelled"],
  ] as const)("shows %s with event status %s as %s", (status, eventStatus, expected) => {
    expect(scheduledDisplayStatus({ status, eventStatus })).toBe(expected);
  });
});

describe("scheduledStatusTone", () => {
  it("colours outcomes by how good the news is", () => {
    expect(scheduledStatusTone("completed")).toBe("success");
    expect(scheduledStatusTone("pending")).toBe("warning");
    expect(scheduledStatusTone("failed")).toBe("danger");
    expect(scheduledStatusTone("expired")).toBe("danger");
    expect(scheduledStatusTone("cancelled")).toBe("muted");
  });
});

describe("parseScheduledStatusFilter", () => {
  it("accepts known statuses and falls back to all", () => {
    expect(parseScheduledStatusFilter("failed")).toBe("failed");
    expect(parseScheduledStatusFilter("scheduled")).toBe("");
    expect(parseScheduledStatusFilter(null)).toBe("");
  });
});

describe("canCancelScheduledEvent", () => {
  it("only allows cancelling pending events", () => {
    expect(canCancelScheduledEvent({ status: "pending" })).toBe(true);
    for (const status of ["dispatched", "failed", "expired", "cancelled"] as const) {
      expect(canCancelScheduledEvent({ status })).toBe(false);
    }
  });
});

describe("recipientSummary", () => {
  it("names the first recipient and counts the rest", () => {
    expect(recipientSummary({ firstRecipient: "a@example.com", recipientCount: 1 })).toBe(
      "a@example.com",
    );
    expect(recipientSummary({ firstRecipient: "a@example.com", recipientCount: 3 })).toBe(
      "a@example.com +2 more",
    );
  });

  it("copes with missing addresses and empty events", () => {
    expect(recipientSummary({ firstRecipient: null, recipientCount: 2 })).toBe("2 recipients");
    expect(recipientSummary({ firstRecipient: null, recipientCount: 0 })).toBe("No recipients");
  });
});

describe("channelList", () => {
  it("joins channels", () => {
    expect(channelList(["email", "sms"])).toBe("email · sms");
    expect(channelList([])).toBe("—");
  });
});
