import { apiClient } from "./client";
import type { PaginatedResponse, TemplateResponse } from "@/types/api";

export type { TemplateResponse };

export interface TemplateCreate {
  name: string;
  channel: "email" | "sms" | "webhook";
  subject?: string;
  body: string;
  variables?: string[];
}

export async function listTemplates(params?: {
  page?: number;
  per_page?: number;
  channel?: string;
}): Promise<PaginatedResponse<TemplateResponse>> {
  const { data } = await apiClient.get("/templates", { params });
  return data;
}

export async function getTemplate(id: string): Promise<TemplateResponse> {
  const { data } = await apiClient.get(`/templates/${id}`);
  return data;
}

export async function createTemplate(data_: TemplateCreate): Promise<TemplateResponse> {
  const { data } = await apiClient.post("/templates", data_);
  return data;
}

export async function updateTemplate(
  id: string,
  data_: Partial<TemplateCreate>,
): Promise<TemplateResponse> {
  const { data } = await apiClient.put(`/templates/${id}`, data_);
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/templates/${id}`);
}
