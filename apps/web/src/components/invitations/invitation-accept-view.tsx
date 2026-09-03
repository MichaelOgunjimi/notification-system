"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Buildings, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { ControlPlaneError } from "@beaco/control-plane";
import { useAcceptInvitation, useInvitationPreview } from "@beaco/control-plane/react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useToast } from "@/components/ui/toast";
import "./invitation-accept-view.css";

function acceptPath(token: string): string {
  return `/invitations/accept?token=${encodeURIComponent(token)}`;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
  viewer: "a viewer",
};

/**
 * Completes an organization invitation for the signed-in user.
 *
 * The invitee first sees which organization and role the token grants (resolved
 * without a session), then accepts with an explicit click. A logged-out invitee
 * is routed through sign-in with a `next` that returns here.
 *
 * @param props Optional one-time token from the emailed accept link.
 */
export function InvitationAcceptView({ token }: { token?: string }) {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const preview = useInvitationPreview(token ?? null);
  const acceptInvitation = useAcceptInvitation();
  const startedRef = useRef(false);

  function runAccept() {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    acceptInvitation.mutate(
      { token },
      {
        onSuccess: () => {
          toast.success(
            "Invitation accepted",
            preview.data
              ? `You’ve joined ${preview.data.organizationName}.`
              : "You now have access to the organization.",
          );
          router.replace("/workspace");
        },
        onError: () => {
          startedRef.current = false;
        },
      },
    );
  }

  const shell = (title: string, description: string, body: React.ReactNode) => (
    <AuthShell title={title} description={description}>
      <div aria-live="polite">{body}</div>
    </AuthShell>
  );

  if (!token) {
    return shell(
      "This invitation link is incomplete.",
      "Open the most recent invitation email and use its button, or ask the sender to invite you again.",
      <>
        <span className="auth-icon-frame auth-icon-error">
          <WarningCircle size={27} />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Invitation not found</h2>
        <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
          The link is missing its one-time token.
        </p>
      </>,
    );
  }

  if (acceptInvitation.isSuccess) {
    return shell(
      "You’re in.",
      "Taking you to your workspace.",
      <>
        <span className="auth-icon-frame">
          <SpinnerGap size={27} className="animate-spin" />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Invitation accepted</h2>
      </>,
    );
  }

  if (acceptInvitation.isError) {
    const error = acceptInvitation.error;
    const forbidden = error instanceof ControlPlaneError && error.code === "forbidden";
    return shell(
      "This invitation could not be accepted.",
      "No changes were made to your account.",
      <>
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
            {preview.data?.email ? (
              <>
                This invitation was sent to{" "}
                <strong className="font-medium text-[var(--site-ink)]">{preview.data.email}</strong>
                . Add and verify that address on your account, then reopen this link.
              </>
            ) : (
              <>
                You are signed in as{" "}
                <strong className="font-medium text-[var(--site-ink)]">
                  {session.user?.email}
                </strong>
                .
              </>
            )}
          </p>
        ) : null}
        <Link href="/workspace" className="auth-primary-action mt-8 w-full">
          <span>Go to your workspace</span>
          <ArrowRight size={18} />
        </Link>
      </>,
    );
  }

  const previewIsDeadLink =
    preview.isError && preview.error instanceof ControlPlaneError && preview.error.status === 404;

  if (previewIsDeadLink) {
    return shell(
      "This invitation link is no longer valid.",
      "Invitations expire, and each one can be accepted once. Ask the sender to invite you again.",
      <>
        <span className="auth-icon-frame auth-icon-error">
          <WarningCircle size={27} />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Link expired or used</h2>
        <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
          We could not find a pending invitation for this link.
        </p>
      </>,
    );
  }

  if (session.status === "loading" || (preview.isPending && !preview.isError)) {
    return shell(
      "Opening your invitation.",
      "Fetching the invitation details.",
      <>
        <span className="auth-icon-frame">
          <SpinnerGap size={27} className="animate-spin" />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">One moment</h2>
      </>,
    );
  }

  const data = preview.data;
  const orgName = data?.organizationName ?? "this organization";
  const roleLabel = data ? (ROLE_LABEL[data.role] ?? `a ${data.role}`) : "a member";

  const invitationCard = (
    <div className="invitation-card">
      <span className="invitation-card__icon">
        <Buildings size={20} weight="fill" />
      </span>
      <div>
        <strong>{orgName}</strong>
        <small>
          Join as {roleLabel}
          {data?.inviterName ? ` · invited by ${data.inviterName}` : ""}
        </small>
      </div>
    </div>
  );

  if (session.status !== "authenticated") {
    return shell(
      `You’ve been invited to join ${orgName}.`,
      "Sign in or create your account to accept. Use the email address the invitation was sent to.",
      <>
        <span className="auth-icon-frame">
          <Buildings size={27} weight="fill" />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">
          Accept your invitation
        </h2>
        {invitationCard}
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
      </>,
    );
  }

  return shell(
    `Join ${orgName} on Beaco.`,
    "You’re signed in. Accept to add this organization to your workspace.",
    <>
      <span className="auth-icon-frame">
        <Buildings size={27} weight="fill" />
      </span>
      <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Accept your invitation</h2>
      {invitationCard}
      <p className="mt-4 text-[13px] leading-6 text-[var(--site-muted)]">
        Signed in as{" "}
        <strong className="font-medium text-[var(--site-ink)]">{session.user?.email}</strong>.
      </p>
      <button
        type="button"
        onClick={runAccept}
        disabled={acceptInvitation.isPending}
        className="auth-primary-action mt-8 w-full"
      >
        <span>{acceptInvitation.isPending ? "Joining…" : "Accept invitation"}</span>
        {acceptInvitation.isPending ? (
          <SpinnerGap size={18} className="animate-spin" />
        ) : (
          <ArrowRight size={18} />
        )}
      </button>
    </>,
  );
}
