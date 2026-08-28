"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
} from "recharts";
import { getAnalytics, getTrends, getUsage } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, presetToDateRange } from "@/components/shared/date-range-filter";
import { useDateFilter } from "@/hooks/use-date-filter";
import { FadeIn, StaggerItem, StaggerList } from "@/components/shared/motion";
import { cn, parseUTC } from "@/lib/utils";

export default function UsagePage() {
  const { preset, setPreset, customRange, setCustomRange } = useDateFilter("today");
  const dateRange = presetToDateRange(preset, customRange);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["usage", preset, customRange],
    queryFn: () => getUsage({ per_page: 200, from: dateRange.from, to: dateRange.to }),
    placeholderData: keepPreviousData,
  });
  const { data: analytics } = useQuery({
    queryKey: ["analytics", preset, customRange],
    queryFn: () => getAnalytics({ date_from: dateRange.from, date_to: dateRange.to }),
  });
  const granularity = preset === "today" ? "hour" as const : "day" as const;
  const trendsQuery = useQuery({
    queryKey: ["usage-trends", preset, customRange],
    queryFn: () => getTrends({ date_from: dateRange.from, date_to: dateRange.to, granularity }),
    placeholderData: keepPreviousData,
  });

  const computed = useMemo(() => {
    const items = data?.items ?? [];
    const totalCalls = items.reduce((sum, item) => sum + item.request_count, 0);

    const keyMap = new Map<string, number>();
    const endpointMap = new Map<string, number>();
    const hourMap = new Map<string, number>(
      Array.from({ length: 24 }).map((_, h) => [h.toString().padStart(2, "0"), 0]),
    );

    items.forEach((item) => {
      keyMap.set(item.api_key_id, (keyMap.get(item.api_key_id) ?? 0) + item.request_count);
      const ep = (item.endpoint ?? "unknown").replace(/^\/api\/v1\//, "/");
      endpointMap.set(ep, (endpointMap.get(ep) ?? 0) + item.request_count);
      const hour = parseUTC(item.hour_bucket).getUTCHours().toString().padStart(2, "0");
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + item.request_count);
    });

    const hourEntries = Array.from(hourMap.entries()).sort(([a], [b]) => Number(a) - Number(b));
    const chartRows = hourEntries.map(([hour, count]) => ({ hour, label: `${hour}:00`, calls: count }));
    const peakHour = hourEntries.reduce((best, [h, c]) => (c > best[1] ? [h, c] : best), ["--", 0] as [string, number]);
    const endpointRows = Array.from(endpointMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const keyRows = Array.from(keyMap.entries());
    const maxKeyCount = Math.max(...keyRows.map(([, c]) => c), 1);
    const maxHourCount = Math.max(...hourEntries.map(([, c]) => c), 1);

    return {
      totalCalls,
      keyRows,
      maxKeyCount,
      chartRows,
      endpointRows,
      hourEntries,
      maxHourCount,
      peakHour: peakHour[0],
      uniqueEndpoints: endpointMap.size,
    };
  }, [data?.items]);

  const trendData = useMemo(
    () =>
      (trendsQuery.data?.points ?? []).map((point) => {
        const tsValue = point.timestamp.endsWith("Z") ? point.timestamp : `${point.timestamp}Z`;
        const d = new Date(tsValue);
        const label = granularity === "day"
          ? d.toLocaleDateString([], { month: "short", day: "numeric" })
          : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        const fullLabel = granularity === "day"
          ? d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
          : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        return { ...point, label, fullLabel };
      }),
    [trendsQuery.data?.points, granularity],
  );

  if (!data && isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;

  const endpointBarColors = [
    "#60a5fa",
    "#818cf8",
    "#a78bfa",
    "#c084fc",
    "#e879f9",
    "#f472b6",
    "#fb7185",
    "#fbbf24",
  ];

  return (
    <FadeIn>
      <div className={cn("space-y-5", "transition-opacity duration-150", isFetching && !isLoading && "opacity-60 pointer-events-none")}>
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

        <StaggerList className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <StaggerItem>
            <StatCard label="Total Requests" value={computed.totalCalls.toLocaleString()} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Endpoints Hit" value={computed.uniqueEndpoints} />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Avg Latency"
              value={analytics?.avg_delivery_latency_ms != null && analytics.avg_delivery_latency_ms > 0
                ? `${analytics.avg_delivery_latency_ms.toFixed(0)}ms`
                : "N/A"}
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Error Rate" value={analytics ? `${(100 - analytics.success_rate).toFixed(1)}%` : "N/A"} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Peak Hour" value={computed.peakHour !== "--" ? `${computed.peakHour}:00` : "N/A"} />
          </StaggerItem>
        </StaggerList>

        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
          <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Usage Over Time</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Hourly request volume across all endpoints.</p>
          </div>
          <div className="h-56 px-2 py-3 sm:px-4 lg:h-80">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={computed.chartRows} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
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
                        {`${String(label)} — ${String(payload[0]?.value ?? 0)} requests`}
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
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Delivery Status Trend</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">{granularity === "day" ? "Daily" : "Hourly"} breakdown of notification outcomes.</p>
          </div>
          <div className="h-[220px] px-2 py-3 sm:px-4 lg:h-[280px]">
            {trendsQuery.isLoading && !trendsQuery.data ? (
              <Skeleton className="h-full w-full" />
            ) : trendData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-[var(--gray-6)]">No trend data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
                  <defs>
                    <linearGradient id="usageTrendDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="usageTrendFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f87171" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="usageTrendQueued" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="usageTrendProcessing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--gray-3)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--gray-6)", fontSize: 11 }}
                    interval={granularity === "day" ? 0 : undefined}
                    tickFormatter={granularity === "hour" ? (label: string) => (Number(label.slice(0, 2)) % 6 === 0 ? label : "") : undefined}
                  />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "var(--gray-6)", fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as { fullLabel?: string; delivered: number; failed: number; queued: number; processing: number };
                      const total = (row.delivered ?? 0) + (row.failed ?? 0) + (row.queued ?? 0) + (row.processing ?? 0);
                      return (
                        <div style={{ background: "#1c1c1c", border: "1px solid #2e2e2e", borderRadius: 8, padding: "8px 12px" }}>
                          <p style={{ color: "#9ca3af", fontSize: 11, marginBottom: 4 }}>{row.fullLabel}</p>
                          {payload.map((entry) => (
                            <p key={entry.name} style={{ color: "#e5e5e5", fontSize: 12, fontWeight: 600 }}>
                              <span style={{ color: entry.stroke as string }}>● </span>
                              {entry.name}: {(entry.value as number).toLocaleString()}
                            </p>
                          ))}
                          <p style={{ color: "#6b7280", fontSize: 11, marginTop: 4, borderTop: "1px solid #2e2e2e", paddingTop: 4 }}>Total: {total.toLocaleString()}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--gray-6)" }} />
                  <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#4ade80" strokeWidth={2} fillOpacity={1} fill="url(#usageTrendDelivered)" />
                  <Area type="monotone" dataKey="failed" name="Failed" stroke="#f87171" strokeWidth={2} fillOpacity={1} fill="url(#usageTrendFailed)" />
                  <Area type="monotone" dataKey="queued" name="Queued" stroke="#60a5fa" strokeWidth={2} fillOpacity={1} fill="url(#usageTrendQueued)" />
                  <Area type="monotone" dataKey="processing" name="Processing" stroke="#fbbf24" strokeWidth={2} fillOpacity={1} fill="url(#usageTrendProcessing)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Two-column: Endpoint Breakdown + Channel Distribution */}
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* Endpoint Breakdown */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Endpoint Breakdown</h2>
              <p className="mt-0.5 text-xs text-[var(--gray-6)]">Top endpoints by request volume.</p>
            </div>
            {computed.endpointRows.length === 0 ? (
              <EmptyState title="No endpoint data" description="No API requests in this period." />
            ) : (
              <div className="p-3 sm:p-4" style={{ height: Math.max(200, computed.endpointRows.length * 36 + 16) }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart
                    data={computed.endpointRows}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--gray-6)", fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--gray-7)", fontSize: 11 }}
                      width={110}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0];
                        return (
                          <div style={{ background: "var(--gray-2)", border: "1px solid var(--gray-3)", borderRadius: 8, padding: "6px 10px" }}>
                            <p style={{ color: "var(--gray-9)", fontSize: 12, fontWeight: 600 }}>
                              {(p.payload as { name: string }).name}: {(p.value as number).toLocaleString()} requests
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {computed.endpointRows.map((_, i) => (
                        <Cell key={i} fill={endpointBarColors[i % endpointBarColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Channel Distribution donut */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Channel Distribution</h2>
              <p className="mt-0.5 text-xs text-[var(--gray-6)]">Notifications by delivery channel.</p>
            </div>
            <div className="p-4 sm:p-5">
              {(() => {
                const channelData = (analytics?.channel_stats ?? []).map((ch) => {
                  const total = ch.delivered + ch.failed + ch.pending + ch.dead_letter;
                  return { name: ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1), value: total };
                }).filter((d) => d.value > 0);
                const channelColors: Record<string, string> = {
                  Email: "#60a5fa",
                  Sms: "#fbbf24",
                  Webhook: "#a78bfa",
                };
                const channelTotal = channelData.reduce((s, d) => s + d.value, 0);

                if (channelTotal === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="relative flex h-[100px] w-[100px] items-center justify-center">
                        <svg width="100" height="100"><circle cx="50" cy="50" r="38" fill="none" stroke="var(--gray-3)" strokeWidth="16" /></svg>
                        <span className="absolute text-[10px] text-[var(--gray-6)]">No data</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col items-center gap-4">
                    <ResponsiveContainer width={140} height={140} minWidth={0} minHeight={0}>
                      <PieChart>
                        <Pie
                          data={channelData}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={62}
                          paddingAngle={channelData.length > 1 ? 3 : 0}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {channelData.map((entry) => (
                            <Cell key={entry.name} fill={channelColors[entry.name] ?? "#6b7280"} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-full space-y-2.5">
                      {channelData.map((ch) => {
                        const pct = channelTotal > 0 ? ((ch.value / channelTotal) * 100).toFixed(1) : "0";
                        return (
                          <div key={ch.name} className="flex items-center gap-3">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: channelColors[ch.name] ?? "#6b7280" }} />
                            <span className="min-w-0 flex-1 text-[13px] text-[var(--gray-9)]">{ch.name}</span>
                            <span className="shrink-0 font-mono text-[12px] text-[var(--gray-7)]">{ch.value.toLocaleString()}</span>
                            <span className="shrink-0 text-[11px] text-[var(--gray-5)]">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Hourly Heatmap — full width */}
        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
          <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Hourly Distribution</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Request intensity by hour of day (UTC).</p>
          </div>
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12 lg:grid-cols-24">
              {computed.hourEntries.map(([hour, count]) => {
                const intensity = computed.maxHourCount > 0 ? count / computed.maxHourCount : 0;
                return (
                  <div key={hour} className="group relative">
                    <div
                      className="flex aspect-square items-center justify-center rounded-lg border border-[var(--gray-3)] text-[10px] font-medium tabular-nums transition-transform hover:scale-110"
                      style={{
                        backgroundColor: intensity === 0
                          ? "var(--gray-1)"
                          : `rgba(245, 158, 11, ${0.15 + intensity * 0.7})`,
                        color: intensity > 0.5 ? "#fff" : "var(--gray-7)",
                      }}
                    >
                      {hour}
                    </div>
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--gray-1)] px-2 py-1 text-[10px] text-[var(--gray-9)] shadow-lg ring-1 ring-[var(--gray-3)] group-hover:block">
                      {`${hour}:00 — ${count.toLocaleString()} req`}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between text-[10px] text-[var(--gray-5)]">
              <span>Less</span>
              <div className="flex items-center gap-1">
                {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                  <div
                    key={v}
                    className="h-3 w-3 rounded-sm"
                    style={{
                      backgroundColor: v === 0
                        ? "var(--gray-3)"
                        : `rgba(245, 158, 11, ${0.15 + v * 0.7})`,
                    }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </div>

        {/* API Key Breakdown moved to Admin → Analytics (master-only view) */}
      </div>
    </FadeIn>
  );
}
