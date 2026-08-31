import { apiClient } from "./client";
import type {
  PaginatedResponse,
  ApiKeyResponse,
  ApiKeyCreateResponse,
} from "@/types/api";

export type { ApiKeyResponse };
export type { ApiKeyCreateResponse };

export interface ChannelConfig {
  id: string;
  channel: string;
  is_enabled: boolean;
  rate_limit_per_min: number | null;
  created_at: string;
  updated_at: string;
}

export interface RetryPolicy {
  id: string;
  channel: string;
  max_retries: number;
  base_delay_seconds: number;
  max_backoff_seconds: number;
  jitter_enabled: boolean;
  retry_on_timeout: boolean;
  retry_on_5xx: boolean;
  retry_on_4xx: boolean;
  created_at: string;
  updated_at: string;
}

export async function listApiKeys(params?: {
  page?: number;
  per_page?: number;
}): Promise<PaginatedResponse<ApiKeyResponse>> {
  const { data } = await apiClient.get("/settings/api-keys", { params });
  return data;
}

export async function createApiKey(data_: {
  name: string;
  rate_limit_per_min?: number;
}): Promise<ApiKeyCreateResponse> {
  const { data } = await apiClient.post("/settings/api-keys", data_);
  return data;
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiClient.delete(`/settings/api-keys/${id}`);
}

export async function listChannelConfigs(): Promise<ChannelConfig[]> {
  const { data } = await apiClient.get("/settings/channels");
  return data;
}

export async function listRetryPolicies(): Promise<RetryPolicy[]> {
  const { data } = await apiClient.get("/settings/retry-policies");
  return data;
}
