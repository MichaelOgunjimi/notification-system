"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle, SpinnerGap } from "@phosphor-icons/react";
import { AuthShell } from "./auth-shell";
import { useSession } from "@beaco/auth/react";

export function SessionReady() {
  const { status, user } = useSession();

  if (status === "loading") return <AuthShell><div aria-live="polite" className="flex items-center gap-3 text-[14px] text-[var(--site-muted-bright)]"><SpinnerGap size={20} className="animate-spin" /> Loading your session</div></AuthShell>;
  if (!user) return <AuthShell><div><h2 className="text-[2rem] font-semibold tracking-[-0.05em]">Your session ended</h2><p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">Request another private link to continue.</p><Link href="/login" className="auth-primary-action mt-8 w-full"><span>Return to sign in</span><ArrowRight size={18} /></Link></div></AuthShell>;

  return <AuthShell title="The control plane knows who you are." description="The next product step is selecting an organization and project before entering notification operations."><div><span className="auth-icon-frame auth-icon-success"><CheckCircle size={27} weight="fill" /></span><p className="mt-7 font-mono text-[11px] tracking-[0.12em] text-[var(--site-accent)]">ACCOUNT READY</p><h2 className="mt-4 text-[2rem] font-semibold tracking-[-0.05em]">Signed in as {user.name}</h2><p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">{user.email}</p><div className="mt-8 border-l border-[var(--site-line-strong)] pl-5"><p className="text-[13px] font-medium">Authentication is complete</p><p className="mt-2 text-[12px] leading-5 text-[var(--site-muted)]">Dashboard project selection is intentionally the next milestone, so this flow does not fall back to the obsolete API-key login.</p></div><Link href="/" className="auth-secondary-action mt-8 w-full">Return to the landing page</Link></div></AuthShell>;
}
