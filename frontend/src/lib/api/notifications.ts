import { apiClient } from "./client";
import type {
  PaginatedResponse,
  NotificationResponse,
  NotificationDetailResponse,
} from "@/types/api";

export type { NotificationResponse, NotificationDetailResponse };

export async function listNotifications(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  channel?: string;
  date_from?: string;
  date_to?: string;
}): Promise<PaginatedResponse<NotificationResponse>> {
  const { data } = await apiClient.get("/notifications", { params });
  return data;
}

export async function getNotification(id: string): Promise<NotificationDetailResponse> {
  const { data } = await apiClient.get(`/notifications/${id}`);
  return data;
}
