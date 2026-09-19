import { apiClient } from "./client";
import type { AdminHealthResponse, AdminKeyStats } from "@/types/api";
export type { AdminHealthResponse, AdminKeyStats };

export interface AdminAnalyticsResponse {
  total_events: number;
  total_notifications: number;
  per_channel: Array<{ channel: string; total: number }>;
  top_keys: Array<{ api_key_id: string; key_name: string; total_notifications: number }>;
}

export async function listAdminKeys(): Promise<AdminKeyStats[]> {
  const { data } = await apiClient.get("/admin/keys");
  return data;
}

export async function getAdminHealth(): Promise<AdminHealthResponse> {
  const { data } = await apiClient.get("/admin/health");
  return data;
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
  const { data } = await apiClient.get("/admin/analytics");
  return data;
}
