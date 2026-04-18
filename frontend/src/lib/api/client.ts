import axios from "axios";
import { getToken } from "@/lib/auth";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "/api/v1",
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers["X-API-Key"] = token;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      if (typeof window !== "undefined") {
        const hasToken = !!localStorage.getItem("beacon_token");
        if (!hasToken) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(err);
  },
);
