"use client";

import { createContext, useContext } from "react";
import { controlPlaneClient } from "../client";
import type { ControlPlaneClient } from "../types";

const ControlPlaneClientContext = createContext<ControlPlaneClient | null>(null);

/** Props accepted by the control-plane client context provider. */
export type ControlPlaneProviderProps = Readonly<{
  /** React subtree that may consume control-plane hooks. */
  children: React.ReactNode;
  /** Optional client override for tests or an alternate application boundary. */
  client?: ControlPlaneClient;
}>;

/**
 * Supplies a control-plane client to React hooks without creating a QueryClient.
 *
 * Mount this beneath the host application's TanStack `QueryClientProvider` so
 * authentication and control-plane hooks share one cache.
 *
 * @param props Provider children and optional client override.
 * @returns Context provider wrapping the supplied subtree.
 */
export function ControlPlaneProvider({
  children,
  client = controlPlaneClient,
}: ControlPlaneProviderProps) {
  return (
    <ControlPlaneClientContext.Provider value={client}>
      {children}
    </ControlPlaneClientContext.Provider>
  );
}

/**
 * Reads the control-plane client configured for the current React subtree.
 *
 * @returns Client supplied by the nearest `ControlPlaneProvider`.
 * @throws {Error} When called outside a `ControlPlaneProvider`.
 */
export function useControlPlaneClient(): ControlPlaneClient {
  const client = useContext(ControlPlaneClientContext);
  if (!client) {
    throw new Error("useControlPlaneClient must be used within <ControlPlaneProvider>.");
  }
  return client;
}
