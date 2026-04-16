"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { getAnalytics, getUsage } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, type DatePreset, type DateRange, presetToDateRange } from "@/components/shared/date-range-filter";

export default function UsagePage() {
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  const dateRange = presetToDateRange(preset, customRange);

  const { data, isLoading, error } = useQuery({
    queryKey: ["usage", preset, customRange],
    queryFn: () => getUsage({ per_page: 200, from: dateRange.from, to: dateRange.to }),
  });
  const { data: analytics } = useQuery({
    queryKey: ["analytics", preset, customRange],
    queryFn: () => getAnalytics({ date_from: dateRange.from, date_to: dateRange.to }),
  });

  const totals = useMemo(() => {
    const items = data?.items ?? [];
    const totalCalls = items.reduce((sum, item) => sum + item.request_count, 0);
    const keyMap = new Map<string, number>();
    const hourMap = new Map<string, number>(
      Array.from({ length: 24 }).map((_, hour) => [hour.toString().padStart(2, "0"), 0]),
    );

    items.forEach((item) => {
      keyMap.set(item.api_key_id, (keyMap.get(item.api_key_id) ?? 0) + item.request_count);
      const hour = new Date(item.hour_bucket + "Z").getUTCHours().toString().padStart(2, "0");
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + item.request_count);
    });

    const hourRows = Array.from(hourMap.entries()).sort(([a], [b]) => Number(a) - Number(b));
    const chartRows = hourRows.map(([hour, count]) => ({ hour, label: `${hour}:00`, calls: count }));

    return {
      totalCalls,
      keyRows: Array.from(keyMap.entries()),
      hourRows,
      chartRows,
    };
  }, [data?.items]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <div className="flex items-center justify-between gap-3">
        <DateRangeFilter
          preset={preset}
          customRange={customRange}
          onPreset={setPreset}
          onCustomRange={setCustomRange}
        />
        <span className="shrink-0 text-[11px] text-[var(--gray-5)]">
          {preset === "today" ? "Today" : preset === "7d" ? "Last 7 days" : preset === "30d" ? "Last 30 days" : "Custom range"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Total Calls" value={totals.totalCalls.toLocaleString()} />
        <StatCard label="API Keys" value={totals.keyRows.length} />
        <StatCard label="Error Rate" value={analytics ? `${(100 - analytics.success_rate).toFixed(1)}%` : "N/A"} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Usage Over Time</h2>
        </div>
        <div className="h-48 px-2 py-3 sm:px-4 lg:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={totals.chartRows} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
              <defs>
                <linearGradient id="usageCallsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--gray-3)" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--gray-6)", fontSize: 11 }}
                tickFormatter={(label: string) => (Number(label.slice(0, 2)) % 6 === 0 ? label : "")}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--gray-6)", fontSize: 11 }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: "var(--gray-2)", border: "1px solid var(--gray-3)", borderRadius: 10, color: "var(--gray-9)", fontSize: 12, padding: "6px 8px" }}>
                      {`${String(label)} — ${String(payload[0]?.value ?? 0)} calls`}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="calls" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#usageCallsGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">API Key Breakdown</h2>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          <div className="grid grid-cols-2 bg-[var(--gray-1)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-5)] sm:px-5">
            <span>Key ID</span>
            <span className="text-right">Calls</span>
          </div>
          {totals.keyRows.length === 0 ? <EmptyState title="No usage data" description="No API key usage in this period." /> : null}
          {totals.keyRows.map(([apiKeyId, count]) => (
            <div key={apiKeyId} className="flex items-center justify-between px-4 py-3 sm:px-5">
              <span className="font-mono text-[13px] text-[var(--gray-9)]">{apiKeyId.slice(0, 8)}…</span>
              <span className="font-mono text-[13px] text-[var(--gray-7)]">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
