"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import "./app-select.css";

/** A single choice rendered inside {@link AppSelect}. */
export type AppSelectOption<T extends string> = Readonly<{
  /** Value committed when the option is chosen. */
  value: T;
  /** Visible content for the option and closed control. */
  label: ReactNode;
  /** Prevents selection and skips the option during keyboard navigation. */
  disabled?: boolean;
}>;

/** Props accepted by the custom listbox select control. */
export type AppSelectProps<T extends string> = Readonly<{
  /** Currently selected value. */
  value: T;
  /** Invoked with the next value when the selection changes. */
  onValueChange: (value: T) => void;
  /** Ordered options to present. */
  options: readonly AppSelectOption<T>[];
  /** Id applied to the trigger for external label association. */
  id?: string;
  /** Disables the whole control and shows a wait cursor. */
  disabled?: boolean;
  /** Text shown when {@link value} matches no option. */
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Class applied to the outer `.app-select` wrapper. */
  containerClassName?: string;
  /** Class applied to the trigger button. */
  className?: string;
}>;

const TYPEAHEAD_RESET_MS = 500;

function isPrintableKey(event: ReactKeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Renders an accessible single-select as a WAI-ARIA select-only combobox.
 *
 * DOM focus stays on the trigger button; the active option is tracked with
 * `aria-activedescendant`. The panel is themed with the dashboard tokens and
 * behaves consistently across desktop and touch (no native picker fallback).
 *
 * @param props Controlled value, change handler, options, and presentation.
 * @returns A styled listbox select that mirrors native keyboard behavior.
 */
export function AppSelect<T extends string>({
  value,
  onValueChange,
  options,
  id,
  disabled = false,
  placeholder,
  containerClassName,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: AppSelectProps<T>) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const typeahead = useRef({ buffer: "", timer: 0 });

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");

  const expanded = open && !disabled;

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const firstEnabled = useCallback(
    () => options.findIndex((option) => !option.disabled),
    [options],
  );
  const lastEnabled = useCallback(() => {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index].disabled) return index;
    }
    return -1;
  }, [options]);
  const stepEnabled = useCallback(
    (from: number, direction: 1 | -1) => {
      for (let index = from + direction; index >= 0 && index < options.length; index += direction) {
        if (!options[index].disabled) return index;
      }
      return -1;
    },
    [options],
  );

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const selectValue = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      if (option.value !== value) onValueChange(option.value);
    },
    [options, value, onValueChange],
  );

  const commit = useCallback(
    (index: number) => {
      selectValue(index);
      close();
    },
    [selectValue, close],
  );

  const openPanel = useCallback(
    (direction: "up" | "down") => {
      const anchor = containerRef.current;
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const panelHeight = Math.min(280, window.innerHeight * 0.4, options.length * 34 + 10);
        const spaceBelow = window.innerHeight - rect.bottom;
        setPlacement(spaceBelow < panelHeight + 12 && rect.top > spaceBelow ? "top" : "bottom");
      }
      const start =
        selectedIndex >= 0 && !options[selectedIndex].disabled
          ? selectedIndex
          : direction === "up"
            ? lastEnabled()
            : firstEnabled();
      setActiveIndex(start);
      setOpen(true);
    },
    [selectedIndex, options, lastEnabled, firstEnabled],
  );

  const runTypeahead = useCallback(
    (character: string) => {
      const state = typeahead.current;
      window.clearTimeout(state.timer);
      state.buffer += character.toLowerCase();
      state.timer = window.setTimeout(() => {
        state.buffer = "";
      }, TYPEAHEAD_RESET_MS);

      const total = options.length;
      if (total === 0) return;
      const origin = expanded ? activeIndex : selectedIndex;
      for (let step = 1; step <= total; step += 1) {
        const index = (origin + step + total) % total;
        const option = options[index];
        if (option.disabled) continue;
        const text = (
          typeof option.label === "string" ? option.label : String(option.value)
        ).toLowerCase();
        if (text.startsWith(state.buffer)) {
          if (expanded) setActiveIndex(index);
          else selectValue(index);
          return;
        }
      }
    },
    [expanded, activeIndex, selectedIndex, options, selectValue],
  );

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        openPanel("down");
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        openPanel("up");
        return;
      }
      if (isPrintableKey(event)) runTypeahead(event.key);
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = stepEnabled(activeIndex, 1);
        if (next >= 0) setActiveIndex(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const next = stepEnabled(activeIndex, -1);
        if (next >= 0) setActiveIndex(next);
        break;
      }
      case "Home":
        event.preventDefault();
        setActiveIndex(firstEnabled());
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(lastEnabled());
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (isPrintableKey(event)) runTypeahead(event.key);
    }
  }

  useEffect(() => {
    if (!expanded || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex]);

  useEffect(() => {
    if (!expanded) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  const containerClasses = ["app-select", containerClassName].filter(Boolean).join(" ");
  const triggerClasses = ["app-select__control", className].filter(Boolean).join(" ");
  const activeDescendant =
    expanded && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      data-open={expanded || undefined}
      data-disabled={disabled || undefined}
      data-placement={placement}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={triggerClasses}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else openPanel("down");
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="app-select__value" data-placeholder={selectedOption ? undefined : true}>
          {selectedOption ? selectedOption.label : (placeholder ?? "")}
        </span>
        <span className="app-select__chevron" aria-hidden="true">
          <CaretDown size={13} weight="bold" />
        </span>
      </button>

      {expanded ? (
        <ul className="app-select__panel" id={listId} role="listbox">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                id={`${listId}-option-${index}`}
                className="app-select__option"
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-active={index === activeIndex || undefined}
                data-selected={isSelected || undefined}
                onPointerEnter={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (option.disabled) return;
                  commit(index);
                }}
              >
                <span className="app-select__check" aria-hidden="true">
                  {isSelected ? <Check size={12} weight="bold" /> : null}
                </span>
                <span className="app-select__option-label">{option.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
