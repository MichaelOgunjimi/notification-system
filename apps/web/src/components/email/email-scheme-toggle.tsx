"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import type { EmailColorScheme } from "./beaco-email-preview";
import "./email-scheme-toggle.css";

type EmailSchemeToggleProps = Readonly<{
  value: EmailColorScheme;
  onChange: (scheme: EmailColorScheme) => void;
}>;

/** Light/dark switch for an email preview, independent of the app theme. */
export function EmailSchemeToggle({ value, onChange }: EmailSchemeToggleProps) {
  return (
    <div className="email-scheme-toggle" role="group" aria-label="Preview color scheme">
      <button
        type="button"
        aria-label="Light preview"
        aria-pressed={value === "light"}
        onClick={() => onChange("light")}
      >
        <Sun size={13} />
      </button>
      <button
        type="button"
        aria-label="Dark preview"
        aria-pressed={value === "dark"}
        onClick={() => onChange("dark")}
      >
        <Moon size={13} />
      </button>
    </div>
  );
}
