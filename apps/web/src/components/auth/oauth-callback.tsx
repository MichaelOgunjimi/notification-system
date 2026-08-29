"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GithubLogo, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { AuthShell } from "./auth-shell";
import { establishOAuthSession } from "@/lib/auth/client";
import type { AuthTokens } from "@/lib/auth/contracts";

export function OAuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function completeOAuth() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const tokens: AuthTokens = {
        access_token: params.get("access_token") ?? "",
        refresh_token: params.get("refresh_token") ?? "",
        token_type: "bearer",
      };
      window.history.replaceState(null, "", window.location.pathname);
      if (!tokens.access_token || !tokens.refresh_token) throw new Error("GitHub did not return a complete session.");
      await establishOAuthSession(tokens);
      window.location.replace("/auth/complete");
    }
    completeOAuth().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "GitHub sign-in could not be completed."));
  }, []);

  if (error) {
    return <AuthShell title="GitHub could not complete this session." description="No account changes were made. You can retry GitHub or request a magic link instead."><div><span className="auth-icon-frame auth-icon-error"><WarningCircle size={27} /></span><h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Sign-in interrupted</h2><p role="alert" className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">{error}</p><Link href="/login" className="auth-primary-action mt-8 w-full"><span>Return to sign in</span><ArrowRight size={18} /></Link></div></AuthShell>;
  }

  return <AuthShell title="Completing the GitHub exchange." description="The provider token stays with the backend. Beaco is creating your own human session now."><div aria-live="polite"><span className="auth-icon-frame"><GithubLogo size={27} weight="fill" /></span><h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Connecting GitHub</h2><p className="mt-4 flex items-center gap-2 text-[14px] leading-7 text-[var(--site-muted-bright)]"><SpinnerGap size={17} className="animate-spin" /> Finalising your session</p></div></AuthShell>;
}
