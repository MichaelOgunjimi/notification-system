"use client";

import { CalendarDays, X } from "lucide-react";

export type DatePreset = "today" | "7d" | "30d" | "custom";

export interface DateRange {
  from: string; // ISO date string
  to: string;
}

interface Props {
  preset: DatePreset;
  customRange: DateRange | null;
  onPreset: (preset: DatePreset) => void;
  onCustomRange: (range: DateRange | null) => void;
}

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "Custom", value: "custom" },
];

export function presetToDateRange(preset: DatePreset, customRange: DateRange | null): DateRange {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString();

  if (preset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: toISO(start), to: toISO(now) };
  }
  if (preset === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { from: toISO(start), to: toISO(now) };
  }
  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { from: toISO(start), to: toISO(now) };
  }
  // custom
  if (customRange) return customRange;
  const fallbackStart = new Date(now);
  fallbackStart.setHours(0, 0, 0, 0);
  return { from: toISO(fallbackStart), to: toISO(now) };
}

export function DateRangeFilter({ preset, customRange, onPreset, onCustomRange }: Props) {
  const handlePresetClick = (p: DatePreset) => {
    onPreset(p);
    if (p !== "custom") onCustomRange(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex items-center gap-1">
        {PRESETS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => handlePresetClick(value)}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              preset === value
                ? "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]"
                : "border-[var(--gray-3)] bg-transparent text-[var(--gray-6)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom date inputs — shown when "custom" is selected */}
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-2.5 py-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-[var(--gray-6)]" />
            <input
              type="date"
              value={customRange?.from?.slice(0, 10) ?? ""}
              onChange={(e) =>
                onCustomRange({
                  from: e.target.value ? new Date(e.target.value + "T00:00:00").toISOString() : "",
                  to: customRange?.to ?? new Date().toISOString(),
                })
              }
              className="bg-transparent text-[13px] text-[var(--gray-9)] outline-none [color-scheme:dark]"
            />
          </div>
          <span className="text-[12px] text-[var(--gray-5)]">→</span>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-2.5 py-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-[var(--gray-6)]" />
            <input
              type="date"
              value={customRange?.to?.slice(0, 10) ?? ""}
              onChange={(e) =>
                onCustomRange({
                  from: customRange?.from ?? new Date().toISOString(),
                  to: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : "",
                })
              }
              className="bg-transparent text-[13px] text-[var(--gray-9)] outline-none [color-scheme:dark]"
            />
          </div>
          {customRange && (
            <button
              type="button"
              onClick={() => { onCustomRange(null); onPreset("today"); }}
              className="rounded-md p-1 text-[var(--gray-5)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
