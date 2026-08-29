"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authClient, type BeacoAuthClient } from "./client";
import type { AuthSession, AuthTokens, AuthUser } from "./contracts";

type AuthContextValue = AuthSession & {
  isLoading: boolean;
  client: BeacoAuthClient;
  requestMagicLink: (email: string) => Promise<{ message: string }>;
  verifyMagicLink: (token: string) => Promise<AuthUser>;
  establishOAuthSession: (tokens: AuthTokens) => Promise<AuthUser>;
  refreshSession: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
  githubLoginUrl: () => string;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function BeacoAuthProvider({
  children,
  client = authClient,
}: {
  children: React.ReactNode;
  client?: BeacoAuthClient;
}) {
  const [session, setSession] = useState<AuthSession>({ user: null, isAuthenticated: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { unsubscribe } = client.onAuthStateChange((_event, user) => {
      if (!mounted) return;
      setSession({ user, isAuthenticated: user !== null });
      setIsLoading(false);
    });
    client.initialize().then((nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setIsLoading(false);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [client]);

  const refreshSession = useCallback(() => client.getSession(), [client]);
  const signOut = useCallback(() => client.signOut(), [client]);

  const value = useMemo<AuthContextValue>(() => ({
    ...session,
    isLoading,
    client,
    requestMagicLink: (email) => client.requestMagicLink(email),
    verifyMagicLink: (token) => client.verifyMagicLink(token),
    establishOAuthSession: (tokens) => client.establishOAuthSession(tokens),
    refreshSession,
    signOut,
    githubLoginUrl: () => client.githubLoginUrl(),
  }), [client, isLoading, refreshSession, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export type { AuthContextValue };
