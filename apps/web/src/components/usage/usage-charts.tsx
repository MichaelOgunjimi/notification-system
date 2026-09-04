"use client";

import type {
  ChannelStat,
  TrendPoint,
  UsageEndpointStat,
  UsageHourlyPoint,
} from "@beaco/control-plane";
import { absoluteFormatter } from "@/lib/audit-log";
import "./usage-charts.css";

/** Delivery-status series colors, shared by the trend chart and its legend. */
const TREND_SERIES: ReadonlyArray<{ key: keyof TrendPoint; label: string; className: string }> = [
  { key: "delivered", label: "Delivered", className: "success" },
  { key: "failed", label: "Failed", className: "danger" },
  { key: "queued", label: "Queued", className: "info" },
  { key: "processing", label: "Processing", className: "warning" },
];

const ZERO_POINT = { delivered: 0, failed: 0, queued: 0, processing: 0 } as const;
/** Hard ceiling on generated buckets, so an unexpectedly wide custom range
 * can't blow up the DOM — 366 covers the daily case (a year) and well past
 * the hourly case (this chart only uses "hour" for the 24h preset). */
const MAX_TREND_BUCKETS = 366;

/**
 * Fills every hour/day between `from` and `to` with a zero point where the
 * server returned none — it only sends buckets that had at least one
 * notification, so without this a handful of active days would be spaced
 * across the full chart width as if they were the only days that existed,
 * each looking artificially tall and wide next to nothing.
 *
 * @param points Sparse points from the API, in any order.
 * @param from ISO lower bound of the queried window.
 * @param to ISO upper bound of the queried window.
 * @param granularity Bucket size the points were truncated to.
 * @returns One point per bucket across the window, oldest first.
 */
function zeroFillTrend(
  points: readonly TrendPoint[],
  from: string,
  to: string,
  granularity: "hour" | "day",
): TrendPoint[] {
  const keyLength = granularity === "hour" ? 13 : 10; // "YYYY-MM-DDTHH" or "YYYY-MM-DD"
  const byKey = new Map(points.map((point) => [point.timestamp.slice(0, keyLength), point]));
  const stepMs = granularity === "hour" ? 3_600_000 : 86_400_000;

  const start = new Date(from);
  start.setUTCMinutes(0, 0, 0);
  if (granularity === "day") start.setUTCHours(0, 0, 0, 0);
  const endMs = new Date(to).getTime();

  const filled: TrendPoint[] = [];
  for (let t = start.getTime(); t <= endMs && filled.length < MAX_TREND_BUCKETS; t += stepMs) {
    const timestamp = new Date(t).toISOString().slice(0, 19);
    const existing = byKey.get(timestamp.slice(0, keyLength));
    filled.push(existing ?? { timestamp, ...ZERO_POINT });
  }
  return filled;
}

/**
 * Stacked chronological area chart of notification outcomes — delivered,
 * failed, queued, processing — one bar per bucket across the full queried
 * window, zero-filled where a bucket had no activity.
 *
 * @param props The (possibly sparse) trend points, the bucket granularity,
 *   and the window's bounds used to generate the full bucket list.
 * @returns The chart, or an empty-state message when the window has no
 *   activity at all.
 */
export function TrendChart({
  points,
  granularity,
  from,
  to,
}: Readonly<{
  points: readonly TrendPoint[];
  granularity: "hour" | "day";
  from: string;
  to: string;
}>) {
  if (points.length === 0) {
    return <p className="usage-chart__empty">No delivery activity in this range yet.</p>;
  }
  const filled = zeroFillTrend(points, from, to, granularity);
  const max = Math.max(
    1,
    ...filled.map((point) => point.delivered + point.failed + point.queued + point.processing),
  );
  return (
    <div className="usage-chart">
      <div className="usage-chart__stack" role="img" aria-label="Delivery status over time">
        {filled.map((point) => {
          const total = point.delivered + point.failed + point.queued + point.processing;
          const label = `${absoluteFormatter.format(new Date(point.timestamp))} — ${total.toLocaleString()} ${
            granularity === "hour" ? "this hour" : "this day"
          }`;
          return (
            <div className="usage-chart__col" key={point.timestamp} title={label}>
              {TREND_SERIES.map(({ key, className }) => {
                const value = point[key] as number;
                return value > 0 ? (
                  <span
                    key={key}
                    className="usage-chart__seg"
                    data-tone={className}
                    style={{ height: `${(value / max) * 100}%` }}
                  />
                ) : null;
              })}
            </div>
          );
        })}
      </div>
      <div className="usage-chart__legend">
        {TREND_SERIES.map(({ key, label, className }) => (
          <span key={key}>
            <i data-tone={className} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 24-cell heatmap of request volume by hour of day (UTC), intensity-shaded.
 *
 * @param props The 24 hourly buckets (0-23), zero-filled where there was no traffic.
 * @returns The heatmap grid.
 */
export function HourlyHeatmap({ points }: Readonly<{ points: readonly UsageHourlyPoint[] }>) {
  const max = Math.max(1, ...points.map((point) => point.requestCount));
  return (
    <div className="usage-heatmap" role="img" aria-label="Request intensity by hour of day, UTC">
      {points.map((point) => {
        const intensity = point.requestCount / max;
        // Vary the fill's mix percentage, not element opacity, so the hour
        // label stays fully legible even on a barely-active cell — opacity
        // would fade the text along with the background.
        const mixPct = point.requestCount > 0 ? Math.round(15 + intensity * 45) : 0;
        return (
          <span
            key={point.hour}
            className="usage-heatmap__cell"
            data-active={point.requestCount > 0 || undefined}
            style={
              mixPct > 0
                ? {
                    background: `color-mix(in srgb, var(--dashboard-accent) ${mixPct}%, var(--dashboard-overlay))`,
                  }
                : undefined
            }
            title={`${String(point.hour).padStart(2, "0")}:00 UTC — ${point.requestCount.toLocaleString()} requests`}
          >
            {String(point.hour).padStart(2, "0")}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Horizontal bar ranking of endpoints by request count, highest first.
 *
 * @param props The ranked endpoint rows.
 * @returns The bar list, or an empty-state message when there are no rows.
 */
export function EndpointBars({ rows }: Readonly<{ rows: readonly UsageEndpointStat[] }>) {
  if (rows.length === 0) {
    return <p className="usage-chart__empty">No requests in this range yet.</p>;
  }
  const max = Math.max(...rows.map((row) => row.requestCount));
  return (
    <div className="usage-bars">
      {rows.map((row) => (
        <div className="usage-bars__row" key={row.endpoint}>
          <span className="usage-bars__label" title={row.endpoint}>
            {row.endpoint}
          </span>
          <span className="usage-bars__track">
            <span
              className="usage-bars__fill"
              style={{ width: `${(row.requestCount / max) * 100}%` }}
            />
          </span>
          <span className="usage-bars__count">{row.requestCount.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

const CHANNEL_TONES = ["info", "success", "warning", "danger"] as const;

/**
 * Donut breakdown of notification volume by delivery channel.
 *
 * @param props The per-channel outcome counts.
 * @returns The donut plus a legend, or an empty-state message with no notifications.
 */
export function ChannelDonut({ stats }: Readonly<{ stats: readonly ChannelStat[] }>) {
  const rows = stats
    .map((stat) => ({
      channel: stat.channel,
      total: stat.delivered + stat.failed + stat.pending + stat.deadLetter,
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  if (grandTotal === 0) {
    return <p className="usage-chart__empty">No notifications in this range yet.</p>;
  }

  let cursor = 0;
  const stops = rows.map((row, index) => {
    const tone = CHANNEL_TONES[index % CHANNEL_TONES.length];
    const start = (cursor / grandTotal) * 360;
    cursor += row.total;
    const end = (cursor / grandTotal) * 360;
    return { ...row, tone, start, end };
  });
  const gradient = stops
    .map((stop) => `var(--usage-${stop.tone}) ${stop.start}deg ${stop.end}deg`)
    .join(", ");

  return (
    <div className="usage-donut">
      <span className="usage-donut__ring" style={{ background: `conic-gradient(${gradient})` }} />
      <div className="usage-donut__legend">
        {stops.map((stop) => (
          <div key={stop.channel}>
            <i data-tone={stop.tone} />
            <span>{stop.channel}</span>
            <b>{Math.round((stop.total / grandTotal) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}
