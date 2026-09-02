import type { ComponentPropsWithoutRef } from "react";
import { CaretDown } from "@phosphor-icons/react";
import "./app-select.css";

/** Props accepted by the reusable native select control. */
export type AppSelectProps = ComponentPropsWithoutRef<"select"> &
  Readonly<{
    /** Optional class applied to the outer visual control. */
    containerClassName?: string;
  }>;

/**
 * Renders an accessible native select with a consistent application shell.
 *
 * The native element preserves keyboard, screen-reader, and mobile picker
 * behavior while the wrapper owns the inset chevron and visual focus state.
 *
 * @param props Native select attributes plus an optional wrapper class.
 * @returns Styled select control that forwards native change and disabled behavior.
 */
export function AppSelect({ containerClassName, className, children, ...props }: AppSelectProps) {
  const containerClasses = ["app-select", containerClassName].filter(Boolean).join(" ");
  const selectClasses = ["app-select__control", className].filter(Boolean).join(" ");

  return (
    <span className={containerClasses} data-disabled={props.disabled || undefined}>
      <select className={selectClasses} {...props}>
        {children}
      </select>
      <span className="app-select__chevron" aria-hidden="true">
        <CaretDown size={13} weight="bold" />
      </span>
    </span>
  );
}
