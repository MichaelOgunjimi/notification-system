"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { AuthShell } from "./auth-shell";
import { useVerifyMagicLink } from "@beaco/auth/react";
import { postAuthDestination } from "@/lib/dashboard-route";
import { safeInternalPath } from "@/lib/safe-redirect";

/**
 * Exchanges a single-use magic-link token for a cookie-backed session.
 *
 * @param props Token and optional same-origin return path read from the magic-link URL.
 * @returns Verification, recovery, or completion UI until navigation finishes.
 */
export function MagicLinkVerifier({ token, next }: { token?: string; next?: string }) {
  const verification = useVerifyMagicLink();
  const verify = verification.mutate;
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify(
      { token },
      {
        onSuccess: (user) =>
          window.location.replace(safeInternalPath(next) ?? postAuthDestination(user.id)),
      },
    );
  }, [token, next, verify]);

  if (token && (verification.isIdle || verification.isPending)) {
    return (
      <AuthShell
        title="Verifying the private link."
        description="Beaco is exchanging the single-use token for a short-lived human session."
      >
        <div aria-live="polite">
          <span className="auth-icon-frame">
            <SpinnerGap size={27} className="animate-spin" />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Signing you in</h2>
          <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
            Keep this tab open for a moment. The link can only be exchanged once.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (!token || verification.isError) {
    const message = token
      ? (verification.error?.message ?? "This sign-in link could not be verified.")
      : "This sign-in link is incomplete.";
    return (
      <AuthShell
        title="This link no longer opens a session."
        description="Magic links are single-use and expire after 15 minutes. Requesting another one is safe."
      >
        <div>
          <span className="auth-icon-frame auth-icon-error">
            <WarningCircle size={27} />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
            Link expired or already used
          </h2>
          <p role="alert" className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
            {message}
          </p>
          <Link href="/login" className="auth-primary-action mt-8 w-full">
            <span>Request another link</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  const user = verification.data;
  if (!user) return null;
  return (
    <AuthShell
      title="Identity verified. Your workspace is ready."
      description="New accounts receive an organization and a default project. Existing accounts return to the same memberships."
    >
      <div>
        <span className="auth-icon-frame auth-icon-success">
          <CheckCircle size={27} weight="fill" />
        </span>
        <p className="mt-7 font-mono text-[11px] tracking-[0.12em] text-[var(--site-accent)]">
          SESSION CREATED
        </p>
        <h2 className="mt-4 text-[2rem] font-semibold tracking-[-0.05em]">Welcome, {user.name}</h2>
        <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
          You are signed in as{" "}
          <strong className="font-medium text-[var(--site-ink)]">{user.email}</strong>.
        </p>
        <Link href="/workspace" className="auth-primary-action mt-8 w-full">
          <span>Open workspace</span>
          <ArrowRight size={18} />
        </Link>
      </div>
    </AuthShell>
  );
}
