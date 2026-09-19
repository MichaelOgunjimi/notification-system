import { apiClient } from "./client";
import type { PaginatedResponse, UsageResponse } from "@/types/api";
export type { UsageResponse };

export async function getUsage(params?: {
  page?: number;
  per_page?: number;
  from?: string;
  to?: string;
}): Promise<PaginatedResponse<UsageResponse>> {
  const { data } = await apiClient.get("/usage", { params });
  return data;
}

export async function getAdminUsage(params?: {
  page?: number;
  per_page?: number;
}): Promise<PaginatedResponse<UsageResponse>> {
  const { data } = await apiClient.get("/admin/usage", { params });
  return data;
}
