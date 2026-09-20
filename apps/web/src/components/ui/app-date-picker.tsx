"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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

function parseDateKey(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || dateKey(date) !== value ? undefined : date;
}

function monthStart(value: string): Date {
  const date = parseDateKey(value) ?? new Date();
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
  if (!parseDateKey(value)) return "dd/mm/yyyy";
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
  const [focusedDay, setFocusedDay] = useState(() => dateKey(parseDateKey(value) ?? new Date()));
  const [focusedMonth, setFocusedMonth] = useState(() => monthStart(value).getUTCMonth());
  const [focusedYear, setFocusedYear] = useState(() => monthStart(value).getUTCFullYear());
  const today = dateKey(new Date());
  const minKey = parseDateKey(min) ? min : undefined;
  const maxKey = parseDateKey(max) ? max : undefined;

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
  const minimumMonth = minKey ? monthIndex(minKey) : undefined;
  const maximumMonth = maxKey ? monthIndex(maxKey) : undefined;
  const minimumYear = minKey ? monthStart(minKey).getUTCFullYear() : undefined;
  const maximumYear = maxKey ? monthStart(maxKey).getUTCFullYear() : undefined;
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
  const todayDisabled = Boolean((minKey && today < minKey) || (maxKey && today > maxKey));
  const enabledDays = days.filter((day) => {
    const key = dateKey(day);
    return (!minKey || key >= minKey) && (!maxKey || key <= maxKey);
  });
  const selectedKey = parseDateKey(value) ? value : undefined;
  const fallbackDay =
    enabledDays.find((day) => day.getUTCMonth() === currentMonth) ?? enabledDays[0];
  const activeDay = enabledDays.some((day) => dateKey(day) === focusedDay)
    ? focusedDay
    : enabledDays.some((day) => dateKey(day) === selectedKey)
      ? selectedKey
      : fallbackDay
        ? dateKey(fallbackDay)
        : "";
  const monthDisabled = (index: number) => {
    const indexValue = currentYear * 12 + index;
    return (
      (minimumMonth !== undefined && indexValue < minimumMonth) ||
      (maximumMonth !== undefined && indexValue > maximumMonth)
    );
  };
  const activeMonth = !monthDisabled(focusedMonth)
    ? focusedMonth
    : MONTH_NAMES.findIndex((_, index) => !monthDisabled(index));
  const yearDisabled = (year: number) =>
    (minimumYear !== undefined && year < minimumYear) ||
    (maximumYear !== undefined && year > maximumYear);
  const activeYear =
    years.includes(focusedYear) && !yearDisabled(focusedYear)
      ? focusedYear
      : (years.find((year) => !yearDisabled(year)) ?? -1);

  useEffect(() => {
    if (!open) return;
    const focusKey = view === "days" ? activeDay : view === "months" ? activeMonth : activeYear;
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-focus-key="${focusKey}"]`)?.focus();
  }, [activeDay, activeMonth, activeYear, month, open, view]);

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

  function moveDay(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = parseDateKey(activeDay);
    if (!current) return;
    const weekday = (current.getUTCDay() + 6) % 7;
    const offsets: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    };
    let next: Date | undefined;
    if (offsets[event.key] !== undefined) {
      next = new Date(current);
      next.setUTCDate(current.getUTCDate() + offsets[event.key]);
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      const targetMonth = shiftMonth(current, event.key === "PageUp" ? -1 : 1);
      const lastDay = new Date(
        Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next = new Date(
        Date.UTC(
          targetMonth.getUTCFullYear(),
          targetMonth.getUTCMonth(),
          Math.min(current.getUTCDate(), lastDay),
        ),
      );
    }
    if (!next) return;
    event.preventDefault();
    let key = dateKey(next);
    if (minKey && key < minKey) key = minKey;
    if (maxKey && key > maxKey) key = maxKey;
    setFocusedDay(key);
    setMonth(monthStart(key));
  }

  function moveChoice(
    event: ReactKeyboardEvent<HTMLDivElement>,
    current: number,
    minimum: number,
    maximum: number,
    onMove: (next: number) => void,
    onPage: (amount: number) => void,
  ) {
    const offsets: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -3,
      ArrowDown: 3,
      Home: -(current % 3),
      End: 2 - (current % 3),
    };
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      onPage(event.key === "PageUp" ? -1 : 1);
      return;
    }
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    onMove(Math.max(minimum, Math.min(maximum, current + offset)));
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
          if (!open) {
            const next = dateKey(parseDateKey(value) ?? new Date());
            setMonth(monthStart(next));
            setFocusedDay(next);
            setView("days");
          }
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

              <div className="app-date-picker__days" role="grid" onKeyDown={moveDay}>
                {days.map((day) => {
                  const key = dateKey(day);
                  const disabled = Boolean((minKey && key < minKey) || (maxKey && key > maxKey));
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      data-focus-key={key}
                      tabIndex={key === activeDay ? 0 : -1}
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
            <div
              className="app-date-picker__choices"
              role="grid"
              aria-label="Choose month"
              onKeyDown={(event) =>
                moveChoice(event, activeMonth, 0, 11, setFocusedMonth, (amount) => {
                  navigate(amount);
                  setFocusedYear(currentYear + amount);
                })
              }
            >
              {MONTH_NAMES.map((name, index) => {
                return (
                  <button
                    key={name}
                    type="button"
                    role="gridcell"
                    data-focus-key={index}
                    tabIndex={index === activeMonth ? 0 : -1}
                    aria-label={`${name} ${currentYear}`}
                    aria-selected={index === currentMonth}
                    disabled={monthDisabled(index)}
                    onClick={() => {
                      setMonth(new Date(Date.UTC(currentYear, index, 1)));
                      setFocusedMonth(index);
                      setView("days");
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="app-date-picker__choices"
              role="grid"
              aria-label="Choose year"
              onKeyDown={(event) =>
                moveChoice(
                  event,
                  activeYear,
                  years[0],
                  years[years.length - 1],
                  setFocusedYear,
                  (amount) => {
                    navigate(amount);
                    setFocusedYear((year) => year + amount * 12);
                  },
                )
              }
            >
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  role="gridcell"
                  data-focus-key={year}
                  tabIndex={year === activeYear ? 0 : -1}
                  aria-selected={year === currentYear}
                  disabled={yearDisabled(year)}
                  onClick={() => {
                    setMonth(new Date(Date.UTC(year, currentMonth, 1)));
                    setFocusedYear(year);
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
