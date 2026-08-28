import { apiClient } from "./client";
import type { PaginatedResponse, SuppressionResponse } from "@/types/api";
export type { SuppressionResponse };

export interface SuppressionCreate {
  channel: "email" | "sms" | "webhook";
  recipient: string;
  reason?: string;
}

export async function listSuppressions(params?: {
  page?: number;
  per_page?: number;
  channel?: string;
}): Promise<PaginatedResponse<SuppressionResponse>> {
  const { data } = await apiClient.get("/suppressions", { params });
  return data;
}

export async function createSuppression(data_: SuppressionCreate): Promise<SuppressionResponse> {
  const { data } = await apiClient.post("/suppressions", data_);
  return data;
}

export async function deleteSuppression(id: string): Promise<void> {
  await apiClient.delete(`/suppressions/${id}`);
}
