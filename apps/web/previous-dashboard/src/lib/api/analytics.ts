import { apiClient } from "./client";
import type { AnalyticsResponse, TrendResponse } from "@/types/api";

export type { AnalyticsResponse, TrendResponse };

export async function getAnalytics(params?: {
  date_from?: string;
  date_to?: string;
}): Promise<AnalyticsResponse> {
  const { data } = await apiClient.get("/analytics", { params });
  return data;
}

export async function getTrends(params?: {
  date_from?: string;
  date_to?: string;
  granularity?: "hour" | "day";
}): Promise<TrendResponse> {
  const { data } = await apiClient.get("/analytics/trends", { params });
  return data;
}
