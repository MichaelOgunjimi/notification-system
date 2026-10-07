"use client";

import { useState } from "react";
import { useTheme } from "@beaco/theme";
import type { EmailColorScheme } from "./beaco-email-preview";

/**
 * Color scheme for an email preview. Follows the app theme until the user picks
 * one with the toggle; after that their choice wins.
 *
 * @returns The active scheme and a setter that pins it.
 */
export function useEmailColorScheme() {
  const { resolvedTheme } = useTheme();
  const [override, setOverride] = useState<EmailColorScheme | null>(null);
  const appScheme: EmailColorScheme = resolvedTheme === "dark" ? "dark" : "light";

  return [override ?? appScheme, setOverride] as const;
}
