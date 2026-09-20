import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppDatePicker } from "./app-date-picker";

describe("AppDatePicker", () => {
  it("falls back safely when URL-backed dates are malformed", () => {
    const invalidValue = renderToStaticMarkup(
      <AppDatePicker label="From" value="invalid" onChange={vi.fn()} />,
    );
    const invalidMinimum = renderToStaticMarkup(
      <AppDatePicker label="From" value="2026-09-20" min="2026-02-30" onChange={vi.fn()} />,
    );

    expect(invalidValue).toContain("dd/mm/yyyy");
    expect(invalidValue).not.toContain(">invalid<");
    expect(invalidMinimum).toContain("20/09/2026");
  });
});
