"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GithubLogo, SpinnerGap } from "@phosphor-icons/react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuthClient, useSendMagicLink } from "@beaco/auth/react";
import { rememberAuthReturnPath } from "@/lib/auth-return";

/**
 * Passwordless sign-in form. When `next` is present the caller is returned to
 * that same-origin path after verification — carried in the magic-link URL for
 * the email flow and in a short-lived cookie for the GitHub redirect.
 *
 * @param props Optional validated return path from the `?next=` query.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const authClient = useAuthClient();
  const sendMagicLink = useSendMagicLink();
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const error = validationError ?? sendMagicLink.error?.message ?? null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setValidationError("Enter a valid email address.");
      return;
    }

    setValidationError(null);
    const receipt = await sendMagicLink
      .mutateAsync({ email: normalizedEmail, next })
      .catch(() => null);
    if (receipt) {
      const params = new URLSearchParams({ email: normalizedEmail });
      if (next) params.set("next", next);
      router.push(`/auth/check-email?${params.toString()}`);
    }
  }

  return (
    <AuthShell>
      <div>
        <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--site-accent)]">
          WELCOME BACK
        </p>
        <h2 className="mt-4 text-[2rem] font-semibold tracking-[-0.05em] sm:text-[2.35rem]">
          Sign in to Beaco
        </h2>
        <p className="mt-3 max-w-md text-[14px] leading-6 text-[var(--site-muted-bright)]">
          Enter your work email. We’ll send a private link that signs you in or creates your
          account.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-9">
          <label htmlFor="email" className="text-[13px] font-medium text-[var(--site-ink)]">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            disabled={sendMagicLink.isPending}
            onChange={(event) => {
              setEmail(event.target.value);
              if (validationError) setValidationError(null);
              if (sendMagicLink.isError) sendMagicLink.reset();
            }}
            aria-describedby={error ? "email-error" : "email-note"}
            aria-invalid={Boolean(error)}
            placeholder="you@company.com"
            className="auth-input mt-2 h-14 w-full px-4 text-[15px] outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          {error ? (
            <p id="email-error" role="alert" className="mt-2 text-[12px] leading-5 text-[#f09a8f]">
              {error}
            </p>
          ) : (
            <p id="email-note" className="mt-2 text-[12px] leading-5 text-[var(--site-muted)]">
              The link expires after 15 minutes and can be used once.
            </p>
          )}

          <button
            type="submit"
            disabled={sendMagicLink.isPending}
            className="auth-primary-action mt-6 w-full"
          >
            <span>{sendMagicLink.isPending ? "Sending your link" : "Continue with email"}</span>
            {sendMagicLink.isPending ? (
              <SpinnerGap size={18} className="animate-spin" />
            ) : (
              <ArrowRight size={18} />
            )}
          </button>
        </form>

        <div className="my-7 flex items-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-[var(--site-line)]" />
          <span className="text-[11px] text-[var(--site-muted)]">or</span>
          <span className="h-px flex-1 bg-[var(--site-line)]" />
        </div>

        <a
          href={authClient.getOAuthSignInUrl("github")}
          onClick={() => rememberAuthReturnPath(next)}
          className="auth-secondary-action w-full"
        >
          <GithubLogo size={19} weight="fill" /> Continue with GitHub
        </a>

        <p className="mt-8 text-pretty text-[11px] leading-5 text-[var(--site-muted)]">
          By continuing, you agree to Beaco’s terms and acknowledge the privacy policy. We only use
          your email to secure and operate your account.
        </p>
      </div>
    </AuthShell>
  );
}
