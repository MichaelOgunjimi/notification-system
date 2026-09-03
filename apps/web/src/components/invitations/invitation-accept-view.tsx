"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { ControlPlaneError } from "@beaco/control-plane";
import { useAcceptInvitation } from "@beaco/control-plane/react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useToast } from "@/components/ui/toast";

function acceptPath(token: string): string {
  return `/invitations/accept?token=${encodeURIComponent(token)}`;
}

/**
 * Completes an organization invitation for the signed-in user.
 *
 * A logged-out invitee is routed through sign-in with a `next` that returns
 * here; a signed-in invitee accepts immediately. The backend rejects a token
 * whose email the current user has not verified.
 *
 * @param props Optional one-time token from the emailed accept link.
 */
export function InvitationAcceptView({ token }: { token?: string }) {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const acceptInvitation = useAcceptInvitation();
  const accept = acceptInvitation.mutate;
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current || session.status !== "authenticated") return;
    started.current = true;
    accept(
      { token },
      {
        onSuccess: () => {
          toast.success("Invitation accepted", "You now have access to the organization.");
          router.replace("/workspace");
        },
      },
    );
  }, [token, session.status, accept, router, toast]);

  if (!token) {
    return (
      <AuthShell
        title="This invitation link is incomplete."
        description="Open the most recent invitation email and use its button, or ask the sender to invite you again."
      >
        <div>
          <span className="auth-icon-frame auth-icon-error">
            <WarningCircle size={27} />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
            Invitation not found
          </h2>
          <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
            The link is missing its one-time token.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (session.status === "loading") {
    return (
      <AuthShell title="Opening your invitation." description="Checking your session.">
        <div aria-live="polite">
          <span className="auth-icon-frame">
            <SpinnerGap size={27} className="animate-spin" />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">One moment</h2>
        </div>
      </AuthShell>
    );
  }

  if (session.status !== "authenticated") {
    return (
      <AuthShell
        title="You’ve been invited to a Beaco organization."
        description="Sign in or create your account to accept. Use the email address the invitation was sent to."
      >
        <div>
          <span className="auth-icon-frame">
            <CheckCircle size={27} weight="fill" />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
            Accept your invitation
          </h2>
          <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
            After you sign in we’ll bring you straight back here to finish joining.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(acceptPath(token))}`}
            className="auth-primary-action mt-8 w-full"
          >
            <span>Continue to sign in</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (acceptInvitation.isError) {
    const error = acceptInvitation.error;
    const forbidden = error instanceof ControlPlaneError && error.code === "forbidden";
    return (
      <AuthShell
        title="This invitation could not be accepted."
        description="No changes were made to your account."
      >
        <div>
          <span className="auth-icon-frame auth-icon-error">
            <WarningCircle size={27} />
          </span>
          <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
            {forbidden ? "Wrong account" : "Link expired or already used"}
          </h2>
          <p role="alert" className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
            {error?.message ?? "This invitation link is invalid or has expired."}
          </p>
          {forbidden ? (
            <p className="mt-3 text-[13px] leading-6 text-[var(--site-muted)]">
              You are signed in as{" "}
              <strong className="font-medium text-[var(--site-ink)]">{session.user?.email}</strong>.
            </p>
          ) : null}
          <Link href="/workspace" className="auth-primary-action mt-8 w-full">
            <span>Go to your workspace</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Joining the organization." description="Accepting your invitation now.">
      <div aria-live="polite">
        <span className="auth-icon-frame">
          <SpinnerGap size={27} className="animate-spin" />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
          Adding you to the team
        </h2>
        <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
          This only takes a moment.
        </p>
      </div>
    </AuthShell>
  );
}
