"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import "./app-date-picker.css";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
});
const DAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "UTC",
});
const MONTH_NAMES = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, month, 1)),
  ),
);
type CalendarView = "days" | "months" | "years";

/** Props for the shared app-styled date picker. */
export type AppDatePickerProps = Readonly<{
  /** Accessible name announced for the trigger and calendar. */
  label: string;
  /** Selected calendar date as `YYYY-MM-DD`, or an empty string. */
  value: string;
  /** Earliest selectable `YYYY-MM-DD` date. */
  min?: string;
  /** Latest selectable `YYYY-MM-DD` date. */
  max?: string;
  /** Receives the selected `YYYY-MM-DD` date, or an empty string when cleared. */
  onChange: (value: string) => void;
}>;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string): Date {
  const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftMonth(month: Date, amount: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}

function monthIndex(value: Date | string): number {
  const date = typeof value === "string" ? monthStart(value) : value;
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function calendarDays(month: Date): Date[] {
  const mondayOffset = (month.getUTCDay() + 6) % 7;
  const first = new Date(month);
  first.setUTCDate(1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(first.getUTCDate() + index);
    return day;
  });
}

function displayDate(value: string): string {
  if (!value) return "dd/mm/yyyy";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Renders the product's controlled calendar picker without invoking the browser-native date UI.
 *
 * Dates remain plain calendar values until the caller chooses the time boundary. The popover closes
 * on selection, outside pointer interaction, or Escape, and restores focus to its trigger.
 *
 * @param props Controlled value, bounds, label, and change callback.
 * @returns An app-styled date trigger and calendar popover.
 */
export function AppDatePicker({ label, value, min, max, onChange }: AppDatePickerProps) {
  const calendarId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(value));
  const [view, setView] = useState<CalendarView>("days");
  const today = dateKey(new Date());

  useEffect(() => {
    if (!open) return;

    function closeOnPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const days = calendarDays(month);
  const currentMonth = month.getUTCMonth();
  const currentYear = month.getUTCFullYear();
  const yearBlockStart = Math.floor(currentYear / 12) * 12;
  const years = Array.from({ length: 12 }, (_, index) => yearBlockStart + index);
  const minimumMonth = min ? monthIndex(min) : undefined;
  const maximumMonth = max ? monthIndex(max) : undefined;
  const minimumYear = min ? monthStart(min).getUTCFullYear() : undefined;
  const maximumYear = max ? monthStart(max).getUTCFullYear() : undefined;
  const previousDisabled =
    view === "days"
      ? minimumMonth !== undefined && monthIndex(shiftMonth(month, -1)) < minimumMonth
      : view === "months"
        ? minimumMonth !== undefined && (currentYear - 1) * 12 + 11 < minimumMonth
        : minimumYear !== undefined && yearBlockStart - 1 < minimumYear;
  const nextDisabled =
    view === "days"
      ? maximumMonth !== undefined && monthIndex(shiftMonth(month, 1)) > maximumMonth
      : view === "months"
        ? maximumMonth !== undefined && (currentYear + 1) * 12 > maximumMonth
        : maximumYear !== undefined && yearBlockStart + 12 > maximumYear;
  const todayDisabled = Boolean((min && today < min) || (max && today > max));

  function navigate(amount: number) {
    setMonth((current) => {
      if (view === "days") return shiftMonth(current, amount);
      const yearsToMove = view === "months" ? amount : amount * 12;
      return new Date(Date.UTC(current.getUTCFullYear() + yearsToMove, current.getUTCMonth(), 1));
    });
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="app-date-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="app-date-picker__trigger"
        aria-label={`${label}: ${value ? displayDate(value) : "not set"}`}
        aria-expanded={open}
        aria-controls={calendarId}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open && value) setMonth(monthStart(value));
          if (!open) setView("days");
          setOpen((current) => !current);
        }}
      >
        <span data-empty={!value || undefined}>{displayDate(value)}</span>
        <CalendarBlank size={14} />
      </button>

      {open ? (
        <div className="app-date-picker__popover" id={calendarId} role="dialog" aria-label={label}>
          <header>
            <div className="app-date-picker__view-controls">
              {view === "days" ? (
                <button type="button" aria-label="Choose month" onClick={() => setView("months")}>
                  {MONTH_FORMATTER.format(month)}
                </button>
              ) : null}
              {view === "years" ? (
                <span>
                  {yearBlockStart}–{yearBlockStart + 11}
                </span>
              ) : (
                <button type="button" aria-label="Choose year" onClick={() => setView("years")}>
                  {currentYear}
                </button>
              )}
            </div>
            <span className="app-date-picker__nav">
              <button
                type="button"
                aria-label={`Previous ${view === "days" ? "month" : view === "months" ? "year" : "years"}`}
                disabled={previousDisabled}
                onClick={() => navigate(-1)}
              >
                <CaretLeft size={15} />
              </button>
              <button
                type="button"
                aria-label={`Next ${view === "days" ? "month" : view === "months" ? "year" : "years"}`}
                disabled={nextDisabled}
                onClick={() => navigate(1)}
              >
                <CaretRight size={15} />
              </button>
            </span>
          </header>

          {view === "days" ? (
            <>
              <div className="app-date-picker__weekdays" aria-hidden>
                {WEEKDAYS.map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>

              <div className="app-date-picker__days" role="grid">
                {days.map((day) => {
                  const key = dateKey(day);
                  const disabled = Boolean((min && key < min) || (max && key > max));
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      aria-label={DAY_FORMATTER.format(day)}
                      aria-selected={key === value}
                      aria-current={key === today ? "date" : undefined}
                      data-outside={day.getUTCMonth() !== currentMonth || undefined}
                      disabled={disabled}
                      onClick={() => choose(key)}
                    >
                      {day.getUTCDate()}
                    </button>
                  );
                })}
              </div>
            </>
          ) : view === "months" ? (
            <div className="app-date-picker__choices" role="grid" aria-label="Choose month">
              {MONTH_NAMES.map((name, index) => {
                const indexValue = currentYear * 12 + index;
                return (
                  <button
                    key={name}
                    type="button"
                    role="gridcell"
                    aria-label={`${name} ${currentYear}`}
                    aria-selected={index === currentMonth}
                    disabled={
                      (minimumMonth !== undefined && indexValue < minimumMonth) ||
                      (maximumMonth !== undefined && indexValue > maximumMonth)
                    }
                    onClick={() => {
                      setMonth(new Date(Date.UTC(currentYear, index, 1)));
                      setView("days");
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="app-date-picker__choices" role="grid" aria-label="Choose year">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  role="gridcell"
                  aria-selected={year === currentYear}
                  disabled={
                    (minimumYear !== undefined && year < minimumYear) ||
                    (maximumYear !== undefined && year > maximumYear)
                  }
                  onClick={() => {
                    setMonth(new Date(Date.UTC(year, currentMonth, 1)));
                    setView("months");
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          <footer>
            <button type="button" disabled={!value} onClick={() => choose("")}>
              Clear
            </button>
            <button type="button" disabled={todayDisabled} onClick={() => choose(today)}>
              Today
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
