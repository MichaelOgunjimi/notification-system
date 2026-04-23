"use client";

import { useState, useEffect } from "react";
import type { DatePreset, DateRange } from "@/components/shared/date-range-filter";

const STORAGE_KEY = "beacon_date_preset";

export function useDateFilter(defaultPreset: DatePreset = "30d") {
  const [preset, setPreset] = useState<DatePreset>(defaultPreset);
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ["today", "7d", "30d"].includes(stored)) {
        setPreset(stored as DatePreset);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const updatePreset = (p: DatePreset) => {
    setPreset(p);
    try {
      if (p !== "custom") {
        localStorage.setItem(STORAGE_KEY, p);
      }
    } catch {}
  };

  return { preset, setPreset: updatePreset, customRange, setCustomRange, hydrated };
}
