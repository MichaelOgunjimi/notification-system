"use client";

import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
  type ThemeProviderProps as NextThemesProviderProps,
} from "next-themes";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./theme.css";

export const BEACO_THEME_STORAGE_KEY = "beaco-theme";

export type BeacoTheme = "light" | "dark" | "system";

export type ThemeProviderProps = {
  children: ReactNode;
} & Omit<
  NextThemesProviderProps,
  "attribute" | "defaultTheme" | "enableColorScheme" | "enableSystem" | "storageKey"
>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableColorScheme
      enableSystem
      storageKey={BEACO_THEME_STORAGE_KEY}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export function useTheme() {
  const theme = useNextTheme();

  return {
    ...theme,
    setTheme: theme.setTheme as (theme: BeacoTheme) => void,
    theme: theme.theme as BeacoTheme | undefined,
  };
}

export type ThemeToggleProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick" | "type"
>;

const THEME_TRANSITION_DURATION_MS = 760;
let transitionCleanupTimer: number | undefined;

function transitionToTheme(
  nextTheme: Exclude<BeacoTheme, "system">,
  setTheme: (theme: BeacoTheme) => void,
) {
  if (
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    setTheme(nextTheme);
    return;
  }

  const root = document.documentElement;
  if (transitionCleanupTimer) window.clearTimeout(transitionCleanupTimer);

  root.classList.remove("theme-transitioning");
  root.dataset.themeTransition = nextTheme;
  // Restart the illumination animation when the control is pressed rapidly.
  void root.offsetWidth;
  root.classList.add("theme-transitioning");
  setTheme(nextTheme);

  transitionCleanupTimer = window.setTimeout(() => {
    root.classList.remove("theme-transitioning");
    delete root.dataset.themeTransition;
    transitionCleanupTimer = undefined;
  }, THEME_TRANSITION_DURATION_MS);
}

export function ThemeToggle({ className = "", ...props }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      aria-label="Toggle color theme"
      onClick={() => transitionToTheme(nextTheme, setTheme)}
      {...props}
    >
      <svg
        className="theme-toggle__icon theme-toggle__icon--sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
      </svg>
      <svg
        className="theme-toggle__icon theme-toggle__icon--moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden="true"
      >
        <path d="M20 15.2A8.2 8.2 0 0 1 8.8 4a8.2 8.2 0 1 0 11.2 11.2Z" />
      </svg>
    </button>
  );
}
