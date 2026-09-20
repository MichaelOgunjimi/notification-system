import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppDatePicker } from "./app-date-picker";

describe("AppDatePicker", () => {
  it("falls back safely when URL-backed dates are malformed", () => {
    expect(() =>
      renderToStaticMarkup(
        <AppDatePicker label="From" value="invalid" min="2026-02-30" onChange={vi.fn()} />,
      ),
    ).not.toThrow();
  });
});
