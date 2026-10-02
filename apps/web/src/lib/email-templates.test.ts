import { describe, expect, it } from "vitest";
import { assertEmailCatalogue } from "./email-templates";

describe("email template catalogue", () => {
  it("contains unique, reviewable templates", () => {
    expect(() => assertEmailCatalogue()).not.toThrow();
  });
});
