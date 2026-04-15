import { apiClient } from "./client";
import type { AnalyticsResponse } from "@/types/api";

export type { AnalyticsResponse };

export async function getAnalytics(): Promise<AnalyticsResponse> {
  const { data } = await apiClient.get("/analytics");
  return data;
}
