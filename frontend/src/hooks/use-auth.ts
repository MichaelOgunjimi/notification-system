"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuthInfo, setAuthInfo, clearAuthInfo, type AuthInfo } from "@/lib/auth";

export function useAuth() {
  const [auth, setAuth] = useState<AuthInfo | null>(null);

  useEffect(() => {
    setAuth(getAuthInfo());
  }, []);

  const login = useCallback((info: AuthInfo) => {
    setAuthInfo(info);
    setAuth(info);
  }, []);

  const logout = useCallback(async () => {
    clearAuthInfo();
    setAuth(null);
    await fetch("/api/auth/logout", { method: "POST" });
  }, []);

  return {
    keyPrefix: auth?.keyPrefix ?? null,
    keyName: auth?.name ?? null,
    isMaster: auth?.isMaster ?? false,
    isAuthenticated: !!auth,
    login,
    logout,
  };
}
