import type { AlertMetric } from "@beaco/control-plane";

export const METRIC_LABELS: Record<AlertMetric, string> = {
  failure_rate: "Failure rate",
  dead_letter_count: "Dead letters",
  avg_latency_ms: "Avg latency",
};

export function formatThreshold(metric: AlertMetric, threshold: number): string {
  if (metric === "failure_rate") return `${threshold}%`;
  if (metric === "avg_latency_ms") return `${threshold}ms`;
  return String(threshold);
}
