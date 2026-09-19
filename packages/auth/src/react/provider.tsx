"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { authClient } from "../client";
import type { AuthClient } from "../types";

const AuthClientContext = createContext<AuthClient | null>(null);

export function createAuthQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60 * 1000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        retry: 1,
        staleTime: 30 * 1000,
      },
      mutations: { retry: false },
    },
  });
}

type AuthProviderProps = {
  children: React.ReactNode;
  client?: AuthClient;
  queryClient?: QueryClient;
};

export function AuthProvider({
  children,
  client = authClient,
  queryClient: suppliedQueryClient,
}: AuthProviderProps) {
  const [queryClient] = useState(() => suppliedQueryClient ?? createAuthQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthClientContext.Provider value={client}>{children}</AuthClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useAuthClient(): AuthClient {
  const client = useContext(AuthClientContext);
  if (!client) throw new Error("useAuthClient must be used within <AuthProvider>.");
  return client;
}
