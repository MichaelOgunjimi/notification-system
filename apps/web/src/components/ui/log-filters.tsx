"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { AppSelect } from "./app-select";
import "./log-filters.css";

/** Identifier for a selectable date range: a preset window or a custom span. */
export type DateRangeKey = "all" | "24h" | "7d" | "30d" | "custom";

/** The filter values a log surface holds in the URL and passes to {@link LogFilters}. */
export type LogFilterValue = Readonly<{
  /** Project id to scope to, or `""` for all projects. */
  project: string;
  /** Selected date range. */
  range: DateRangeKey;
  /** Custom lower bound (ISO), meaningful only when `range` is `custom`. */
  from: string;
  /** Custom upper bound (ISO), meaningful only when `range` is `custom`. */
  to: string;
  /** Free-text action filter (a substring match on the server). */
  action: string;
}>;

/** Props for {@link LogFilters}. */
type LogFiltersProps = Readonly<{
  /** Current filter values, owned by the caller. */
  value: LogFilterValue;
  /** Receives a partial update whenever a control changes. */
  onChange: (patch: Partial<LogFilterValue>) => void;
  /** Projects offered by the project select; the select is hidden below two. */
  projects: ReadonlyArray<{ id: string; name: string }>;
  /** Surface-specific chip group rendered beside the project select. */
  children?: ReactNode;
  /** Placeholder for the action search box. */
  actionPlaceholder?: string;
  /** Hide the free-text search on a surface that filters by chips instead. */
  hideSearch?: boolean;
}>;

const RANGE_PRESETS: ReadonlyArray<{
  key: Exclude<DateRangeKey, "custom">;
  label: string;
  ms: number;
}> = [
  { key: "all", label: "All time", ms: 0 },
  { key: "24h", label: "24h", ms: 86_400_000 },
  { key: "7d", label: "7d", ms: 604_800_000 },
  { key: "30d", label: "30d", ms: 2_592_000_000 },
];

/**
 * Shared, fully-controlled filter strip for the log surfaces: a project select,
 * a slot for surface-specific chips, a date range (presets or a custom
 * from → to span), and a debounced action search.
 *
 * The search box holds a local draft and commits it 350 ms after typing stops;
 * the first render never commits, and a re-run whose draft already equals the
 * committed value is a no-op, so an unrelated `onChange` identity change (for
 * example a page change reshaping the URL) never re-commits the search term.
 *
 * @param props See {@link LogFiltersProps}.
 * @returns The filter bar.
 */
export function LogFilters({
  value,
  onChange,
  projects,
  children,
  actionPlaceholder = "Filter by action, e.g. member",
  hideSearch = false,
}: LogFiltersProps) {
  const [draft, setDraft] = useState(value.action);
  const mounted = useRef(false);

  useEffect(() => {
    if (hideSearch) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (draft.trim() === value.action) return;
    const handle = window.setTimeout(() => onChange({ action: draft.trim() }), 350);
    return () => window.clearTimeout(handle);
  }, [draft, hideSearch, onChange, value.action]);

  function pickPreset(key: Exclude<DateRangeKey, "custom">, ms: number) {
    onChange({
      range: key,
      from: ms === 0 ? "" : new Date(Date.now() - ms).toISOString(),
      to: "",
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="log-filters">
      <div className="log-filters__row">
        {projects.length > 1 ? (
          <AppSelect
            aria-label="Project"
            containerClassName="log-filters__project"
            value={value.project}
            onValueChange={(project) => onChange({ project })}
            options={[
              { value: "", label: "All projects" },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
        ) : null}

        {children}
      </div>

      <div className="log-filters__row">
        <div className="log-filters__chips" role="group" aria-label="Time range">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              data-active={value.range === preset.key || undefined}
              onClick={() => pickPreset(preset.key, preset.ms)}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            data-active={value.range === "custom" || undefined}
            onClick={() => onChange({ range: "custom" })}
          >
            Custom
          </button>
        </div>

        {value.range === "custom" ? (
          <div className="log-filters__range">
            <input
              type="date"
              aria-label="From date"
              max={value.to ? value.to.slice(0, 10) : today}
              value={value.from ? value.from.slice(0, 10) : ""}
              onChange={(event) =>
                onChange({
                  from: event.target.value
                    ? new Date(`${event.target.value}T00:00:00`).toISOString()
                    : "",
                })
              }
            />
            <span aria-hidden>→</span>
            <input
              type="date"
              aria-label="To date"
              min={value.from ? value.from.slice(0, 10) : undefined}
              max={today}
              value={value.to ? value.to.slice(0, 10) : ""}
              onChange={(event) =>
                onChange({
                  to: event.target.value
                    ? new Date(`${event.target.value}T23:59:59`).toISOString()
                    : "",
                })
              }
            />
          </div>
        ) : null}

        {hideSearch ? null : (
          <input
            type="search"
            className="log-filters__search"
            placeholder={actionPlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Filter by action"
          />
        )}
      </div>
    </div>
  );
}
