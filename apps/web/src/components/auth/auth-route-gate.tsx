"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { SessionRecovery } from "./session-recovery";
import { postAuthDestination } from "@/lib/dashboard-route";
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

  useEffect(() => {
    if (userId) router.replace(postAuthDestination(userId));
  }, [router, userId]);

  if (session.status === "loading" || session.user) {
    return (
      <main className="auth-route-gate" aria-live="polite">
        <SpinnerGap size={16} className="animate-spin" /> Restoring your workspace
      </main>
    );
  }

  if (session.status === "error") {
    return <SessionRecovery fullPage onRetry={() => void session.refresh()} />;
  }

  return children;
}
