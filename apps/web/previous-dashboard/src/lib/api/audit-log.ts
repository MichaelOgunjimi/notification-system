import { apiClient } from "./client";
import type { PaginatedResponse, AuditLogResponse } from "@/types/api";
export type { AuditLogResponse };

export async function listAuditLog(params?: {
  page?: number;
  per_page?: number;
  action?: string;
  from?: string;
}): Promise<PaginatedResponse<AuditLogResponse>> {
  const { data } = await apiClient.get("/audit-log", { params });
  return data;
}

export async function listAdminAuditLog(params?: {
  page?: number;
  per_page?: number;
  api_key_id?: string;
}): Promise<PaginatedResponse<AuditLogResponse>> {
  const { data } = await apiClient.get("/admin/audit-log", { params });
  return data;
}
