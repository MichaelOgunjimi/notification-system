"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { SessionRecovery } from "./session-recovery";
import { postAuthDestination } from "@/lib/dashboard-route";
import { readOAuthReturnPath } from "@/lib/oauth-return";
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
  const completingOAuthConnection =
    typeof window !== "undefined" &&
    window.location.pathname === "/auth/callback" &&
    readOAuthReturnPath() !== null;

  useEffect(() => {
    if (userId && !completingOAuthConnection) router.replace(postAuthDestination(userId));
  }, [completingOAuthConnection, router, userId]);

  if (session.status === "loading" || (session.user && !completingOAuthConnection)) {
    return (
      <main className="auth-route-gate" aria-live="polite">
        <SpinnerGap size={16} className="animate-spin" /> Restoring your workspace
      </main>
    );
  }

  if (session.status === "error") {
    return <SessionRecovery fullPage onRetry={() => void session.refresh()} />;
  }

  if (session.user && completingOAuthConnection) return children;

  return children;
}
