import { apiClient } from "./client";
import type { AnalyticsResponse } from "@/types/api";

export type { AnalyticsResponse };

export async function getAnalytics(params?: {
  date_from?: string;
  date_to?: string;
}): Promise<AnalyticsResponse> {
  const { data } = await apiClient.get("/analytics", { params });
  return data;
}
