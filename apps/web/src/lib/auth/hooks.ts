"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./provider";
import type { AuthUser } from "./contracts";

export function useBeacoAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useBeacoAuth must be used within BeacoAuthProvider.");
  return context;
}

export function useBeacoUser(): AuthUser | null {
  return useBeacoAuth().user;
}
