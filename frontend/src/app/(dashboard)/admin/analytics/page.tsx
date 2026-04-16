"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { getAdminAnalytics } from "@/lib/api";
import { StatCard } from "@/components/dashboard/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export default function AdminAnalyticsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "analytics"], queryFn: getAdminAnalytics });

  const channelColorMap = useMemo(
    () => ({
      email: "#60a5fa",
      sms: "#4ade80",
      webhook: "#a78bfa",
      fallback: "#9ca3af",
    }),
    [],
  );
  const channelData = useMemo(
    () =>
      (data?.per_channel ?? []).map((channel) => ({
        ...channel,
        fill: channelColorMap[channel.channel as keyof typeof channelColorMap] ?? channelColorMap.fallback,
      })),
    [data?.per_channel, channelColorMap],
  );
  const channelTotal = useMemo(() => channelData.reduce((sum, channel) => sum + channel.total, 0), [channelData]);
  const topKeyChartData = useMemo(
    () =>
      (data?.top_keys ?? []).map((key) => ({
        ...key,
        short_name: key.key_name.length > 12 ? `${key.key_name.slice(0, 12)}…` : key.key_name,
      })),
    [data?.top_keys],
  );

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
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Total Events" value={data?.total_events ?? 0} />
        <StatCard label="Total Notifications" value={data?.total_notifications ?? 0} />
        <StatCard label="Active Keys" value={data?.top_keys.length ?? 0} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Channel Breakdown</h2>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          {channelData.length === 0 ? <EmptyState title="No channel data" description="No channel analytics available." /> : null}
          {channelData.length > 0 ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-3">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={channelData}
                          dataKey="total"
                          nameKey="channel"
                          innerRadius={50}
                          outerRadius={72}
                          cx="50%"
                          cy="45%"
                          strokeWidth={0}
                        >
                          {channelData.map((entry) => (
                            <Cell key={entry.channel} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--gray-9)" }} />
                        <text x="50%" y="42%" textAnchor="middle" dominantBaseline="middle" fill="var(--gray-6)" fontSize={11}>
                          Total
                        </text>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="var(--gray-10)" fontSize={20}>
                          {channelTotal}
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-3 lg:block">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelData} layout="vertical" margin={{ top: 8, right: 16, left: 10, bottom: 8 }}>
                        <CartesianGrid stroke="var(--gray-3)" horizontal={true} vertical={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--gray-6)", fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="channel"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--gray-6)", fontSize: 11 }}
                          width={70}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--gray-2)",
                            border: "1px solid var(--gray-3)",
                            borderRadius: 10,
                            color: "var(--gray-9)",
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                          {channelData.map((entry) => (
                            <Cell key={entry.channel} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
                <div className="grid grid-cols-2 bg-[var(--gray-1)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--gray-6)]">
                  <span>Channel</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="divide-y divide-[var(--gray-3)]">
                  {channelData.map((channel) => (
                    <div key={channel.channel} className="grid grid-cols-2 px-4 py-3">
                      <span className="text-[13px] text-[var(--gray-9)]">{channel.channel}</span>
                      <span className="text-right font-mono text-[13px] text-[var(--gray-7)]">{channel.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Top Keys</h2>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          {topKeyChartData.length === 0 ? <EmptyState title="No key data" description="No key activity available." /> : null}
          {topKeyChartData.length > 0 ? (
            <>
              <div className="rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-3">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topKeyChartData} margin={{ top: 8, right: 16, left: -10, bottom: 20 }}>
                      <CartesianGrid stroke="var(--gray-3)" vertical={false} />
                      <XAxis
                        dataKey="short_name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--gray-6)", fontSize: 11 }}
                        interval={0}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--gray-6)", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--gray-2)",
                          border: "1px solid var(--gray-3)",
                          borderRadius: 10,
                          color: "var(--gray-9)",
                          fontSize: 12,
                        }}
                        labelFormatter={(label) => `Key: ${label}`}
                        formatter={(value) => [`${value ?? 0}`, "Notifications"]}
                      />
                      <Bar dataKey="total_notifications" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
                <div className="grid grid-cols-2 bg-[var(--gray-1)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--gray-6)]">
                  <span>Key Name</span>
                  <span className="text-right">Notifications</span>
                </div>
                <div className="divide-y divide-[var(--gray-3)]">
                  {data?.top_keys.map((key) => (
                    <div key={key.api_key_id} className="grid grid-cols-2 px-4 py-3">
                      <span className="text-[13px] text-[var(--gray-9)]">{key.key_name}</span>
                      <span className="text-right font-mono text-[13px] text-[var(--gray-7)]">{key.total_notifications}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
