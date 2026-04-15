import { apiClient } from "./client";
import type {
  PaginatedResponse,
  EventResponse,
  EventDetailResponse,
} from "@/types/api";

export type { EventResponse, EventDetailResponse };

export async function listEvents(params?: {
  page?: number;
  per_page?: number;
  status?: string;
}): Promise<PaginatedResponse<EventResponse>> {
  const { data } = await apiClient.get("/events", { params });
  return data;
}

export async function getEvent(id: string): Promise<EventDetailResponse> {
  const { data } = await apiClient.get(`/events/${id}`);
  return data;
}
