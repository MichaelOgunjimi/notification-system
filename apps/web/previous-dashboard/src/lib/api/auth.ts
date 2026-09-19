import { apiClient } from "./client";

export interface ValidateResponse {
  valid: boolean;
  is_master: boolean;
  name: string;
  key_prefix: string;
}

export async function validateKey(key: string): Promise<ValidateResponse> {
  const { data } = await apiClient.post<ValidateResponse>("/auth/validate", { key });
  return data;
}
