"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { AuthShell } from "./auth-shell";
import { verifyMagicLink } from "@/lib/auth/client";
import type { AuthUser } from "@/lib/auth/contracts";

type State = { status: "loading" } | { status: "success"; user: AuthUser } | { status: "error"; message: string };

export function MagicLinkVerifier({ token }: { token?: string }) {
  const [state, setState] = useState<State>(token ? { status: "loading" } : { status: "error", message: "This sign-in link is incomplete." });

  useEffect(() => {
    let active = true;
    if (!token) return;
    verifyMagicLink(token)
      .then((user) => active && setState({ status: "success", user }))
      .catch((error: unknown) => active && setState({ status: "error", message: error instanceof Error ? error.message : "This sign-in link could not be verified." }));
    return () => { active = false; };
  }, [token]);

  if (state.status === "loading") {
    return <AuthShell title="Verifying the private link." description="Beaco is exchanging the single-use token for a short-lived human session."><div aria-live="polite"><span className="auth-icon-frame"><SpinnerGap size={27} className="animate-spin" /></span><h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Signing you in</h2><p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">Keep this tab open for a moment. The link can only be exchanged once.</p></div></AuthShell>;
  }

  if (state.status === "error") {
    return <AuthShell title="This link no longer opens a session." description="Magic links are single-use and expire after 15 minutes. Requesting another one is safe."><div><span className="auth-icon-frame auth-icon-error"><WarningCircle size={27} /></span><h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Link expired or already used</h2><p role="alert" className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">{state.message}</p><Link href="/login" className="auth-primary-action mt-8 w-full"><span>Request another link</span><ArrowRight size={18} /></Link></div></AuthShell>;
  }

  return <AuthShell title="Identity verified. Your workspace is ready." description="New accounts receive an organization and a default project. Existing accounts return to the same memberships."><div><span className="auth-icon-frame auth-icon-success"><CheckCircle size={27} weight="fill" /></span><p className="mt-7 font-mono text-[11px] tracking-[0.12em] text-[var(--site-accent)]">SESSION CREATED</p><h2 className="mt-4 text-[2rem] font-semibold tracking-[-0.05em]">Welcome, {state.user.name}</h2><p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">You are signed in as <strong className="font-medium text-[var(--site-ink)]">{state.user.email}</strong>.</p><Link href="/auth/complete" className="auth-primary-action mt-8 w-full"><span>Continue</span><ArrowRight size={18} /></Link></div></AuthShell>;
}
