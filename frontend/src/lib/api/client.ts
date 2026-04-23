import axios from "axios";
import { clearAuthInfo } from "@/lib/auth";

export const apiClient = axios.create({
  baseURL: "/api/proxy",
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      if (typeof window !== "undefined") {
        clearAuthInfo();
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {
          // Best-effort logout cleanup.
        }
        window.location.replace("/login");
      }
    }
    return Promise.reject(err);
  },
);
