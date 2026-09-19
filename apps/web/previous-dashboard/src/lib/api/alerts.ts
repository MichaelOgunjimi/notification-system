import { apiClient } from "./client";
import type { AlertRuleResponse } from "@/types/api";

export type { AlertRuleResponse };

export interface AlertRuleCreate {
  name: string;
  metric: string;
  threshold: number;
  window_minutes?: number;
  notify_email?: string;
  is_active?: boolean;
}

export async function listAlerts(): Promise<AlertRuleResponse[]> {
  const { data } = await apiClient.get("/alerts");
  return data;
}

export async function createAlert(data_: AlertRuleCreate): Promise<AlertRuleResponse> {
  const { data } = await apiClient.post("/alerts", data_);
  return data;
}

export async function updateAlert(
  id: string,
  data_: Partial<AlertRuleCreate>,
): Promise<AlertRuleResponse> {
  const { data } = await apiClient.put(`/alerts/${id}`, data_);
  return data;
}

export async function deleteAlert(id: string): Promise<void> {
  await apiClient.delete(`/alerts/${id}`);
}

export const listAlertRules = listAlerts;
export const createAlertRule = createAlert;
export const updateAlertRule = updateAlert;
export const deleteAlertRule = deleteAlert;
