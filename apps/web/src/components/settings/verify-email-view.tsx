"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useVerifyEmailAddress } from "@beaco/auth/react";
import { AuthShell } from "@/components/auth/auth-shell";

/**
 * Confirms a secondary email address from the token in its verification link.
 *
 * The endpoint needs no session — holding the emailed token is the proof of
 * control — so this renders outside the authenticated shell.
 *
 * @param props One-time token read from the verification URL.
 */
export function VerifyEmailView({ token }: { token?: string }) {
  const verification = useVerifyEmailAddress();
  const verify = verification.mutate;
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify(token);
  }, [token, verify]);

  if (token && (verification.isIdle || verification.isPending)) {
    return (
      <AuthShell title="Confirming your email address." description="This only takes a moment.">
        <div aria-live="polite">
          <span className="auth-icon-frame">
            <SpinnerGap size={27} className="animate-spin" />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Checking the link</h2>
        </div>
      </AuthShell>
    );
  }

  if (!token || verification.isError) {
    return (
      <AuthShell
        title="This confirmation link is no longer active."
        description="Verification links are single-use and expire. The address may already be confirmed."
      >
        <div>
          <span className="auth-icon-frame auth-icon-error">
            <WarningCircle size={27} />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
            Link expired or already used
          </h2>
          <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
            {token
              ? "If the address still shows as unverified, open your account settings and resend the link."
              : "The link is missing its token."}
          </p>
          <Link href="/workspace" className="auth-primary-action mt-8 w-full">
            <span>Go to your workspace</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  const address = verification.data;
  return (
    <AuthShell
      title="Email address confirmed."
      description="You can now use it to sign in, and to accept invitations sent to it."
    >
      <div>
        <span className="auth-icon-frame auth-icon-success">
          <CheckCircle size={27} weight="fill" />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
          {address?.email ?? "Address"} is verified
        </h2>
        <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
          It has been added to your Beaco account.
        </p>
        <Link href="/workspace" className="auth-primary-action mt-8 w-full">
          <span>Continue</span>
          <ArrowRight size={18} />
        </Link>
      </div>
    </AuthShell>
  );
}
