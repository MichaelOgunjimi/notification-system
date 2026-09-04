"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { AppSelect } from "./app-select";
import "./log-filters.css";

export type DateRangeKey = "all" | "24h" | "7d" | "30d" | "custom";

/** The filter values a log surface reads from the URL. */
export type LogFilterValue = Readonly<{
  project: string;
  range: DateRangeKey;
  from: string;
  to: string;
  action: string;
}>;

type LogFiltersProps = Readonly<{
  value: LogFilterValue;
  onChange: (patch: Partial<LogFilterValue>) => void;
  projects: ReadonlyArray<{ id: string; name: string }>;
  /** Chip group rendered between the project select and the date range. */
  children?: ReactNode;
  actionPlaceholder?: string;
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
 * Shared filter strip for the activity surfaces: a project select, a slot for
 * surface-specific chips, a date range (presets or a custom from → to), and a
 * debounced action search. Fully controlled — the page owns the value (in the
 * URL) and applies each emitted patch.
 *
 * @param props Current value, patch handler, and the project list.
 * @returns The filter bar.
 */
export function LogFilters({
  value,
  onChange,
  projects,
  children,
  actionPlaceholder = "Filter by action, e.g. member",
}: LogFiltersProps) {
  const [draft, setDraft] = useState(value.action);
  const mounted = useRef(false);

  // Debounce the search box; skip the first pass so a URL-seeded action isn't
  // immediately re-committed (which would also reset the page).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const handle = window.setTimeout(() => onChange({ action: draft.trim() }), 350);
    return () => window.clearTimeout(handle);
  }, [draft, onChange]);

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

        <input
          type="search"
          className="log-filters__search"
          placeholder={actionPlaceholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Filter by action"
        />
      </div>
    </div>
  );
}
