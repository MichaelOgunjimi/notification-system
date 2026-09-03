"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { SessionRecovery } from "./session-recovery";
import { postAuthDestination } from "@/lib/dashboard-route";
import { readOAuthReturnPath } from "@/lib/oauth-return";
import { hasPendingAuthReturnPath, safeInternalPath } from "@/lib/auth-return";
import "./auth-route-gate.css";

/**
 * Prevents an active session from rendering sign-in, callback, or expired-link
 * content and restores the user's last validated dashboard when available.
 *
 * @param props Authentication route content shown only to anonymous users.
 * @returns Anonymous auth content or a neutral redirecting surface.
 */
export function AuthRouteGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const userId = session.user?.id;
  // On the OAuth callback route the callback component is the sole redirect
  // authority; the gate must not race it with its own `router.replace`,
  // especially once a pending return path has been read and cleared.
  const callbackOwnsRedirect =
    typeof window !== "undefined" &&
    window.location.pathname === "/auth/callback" &&
    (readOAuthReturnPath() !== null || hasPendingAuthReturnPath());

  useEffect(() => {
    if (!userId || callbackOwnsRedirect) return;
    const requestedNext =
      typeof window === "undefined"
        ? null
        : safeInternalPath(new URLSearchParams(window.location.search).get("next"));
    router.replace(requestedNext ?? postAuthDestination(userId));
  }, [callbackOwnsRedirect, router, userId]);

  if (session.status === "loading" || (session.user && !callbackOwnsRedirect)) {
    return (
      <main className="auth-route-gate" aria-live="polite">
        <SpinnerGap size={16} className="animate-spin" /> Restoring your workspace
      </main>
    );
  }

  if (session.status === "error") {
    return <SessionRecovery fullPage onRetry={() => void session.refresh()} />;
  }

  if (session.user && callbackOwnsRedirect) return children;

  return children;
}
