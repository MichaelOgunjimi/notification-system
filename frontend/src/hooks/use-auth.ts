"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuthInfo, setAuthInfo, clearToken, type AuthInfo } from "@/lib/auth";

export function useAuth() {
  const [auth, setAuth] = useState<AuthInfo | null>(null);

  useEffect(() => {
    setAuth(getAuthInfo());
  }, []);

  const login = useCallback((info: AuthInfo) => {
    setAuthInfo(info);
    setAuth(info);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuth(null);
  }, []);

  return {
    apiKey: auth?.token ?? null,
    keyPrefix: auth?.keyPrefix ?? null,
    keyName: auth?.name ?? null,
    isMaster: auth?.isMaster ?? false,
    isAuthenticated: !!auth,
    login,
    logout,
  };
}
