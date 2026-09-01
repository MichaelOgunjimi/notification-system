"use client";

import { createContext, useContext } from "react";
import { controlPlaneClient } from "../client";
import type { ControlPlaneClient } from "../types";

const ControlPlaneClientContext = createContext<ControlPlaneClient | null>(null);

export type ControlPlaneProviderProps = Readonly<{
  children: React.ReactNode;
  client?: ControlPlaneClient;
}>;

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

export function useControlPlaneClient(): ControlPlaneClient {
  const client = useContext(ControlPlaneClientContext);
  if (!client) {
    throw new Error(
      "useControlPlaneClient must be used within <ControlPlaneProvider>.",
    );
  }
  return client;
}
