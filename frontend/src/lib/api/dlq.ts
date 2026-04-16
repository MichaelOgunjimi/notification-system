import { apiClient } from "./client";
import type {
  DeadLetterDetailResponse,
  DeadLetterResponse,
  PaginatedResponse,
} from "@/types/api";

export type { DeadLetterResponse, DeadLetterDetailResponse };

export async function listDLQ(params?: {
  page?: number;
  per_page?: number;
  status?: "active" | "retried" | "discarded";
}): Promise<PaginatedResponse<DeadLetterResponse>> {
  const { data } = await apiClient.get("/dead-letter", { params });
  return data;
}

export async function getDLQ(id: string): Promise<DeadLetterDetailResponse> {
  const { data } = await apiClient.get(`/dead-letter/${id}`);
  return data;
}

export async function retryDLQ(id: string): Promise<void> {
  await apiClient.post(`/dead-letter/${id}/retry`);
}

export async function discardDLQ(id: string): Promise<void> {
  await apiClient.post(`/dead-letter/${id}/discard`);
}
