import Link from "next/link";
import { ArrowLeft, EnvelopeSimpleOpen } from "@phosphor-icons/react/dist/ssr";
import { AuthShell } from "@/components/auth/auth-shell";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthShell
      title="Your next step is waiting in your inbox."
      description="The sign-in request is separate from the session. Nothing changes until you open the private link."
    >
      <div>
        <span className="auth-icon-frame">
          <EnvelopeSimpleOpen size={27} aria-hidden="true" />
        </span>
        <h2 className="mt-7 text-[2rem] font-semibold tracking-[-0.05em]">Check your email</h2>
        <p className="mt-4 text-[14px] leading-7 text-[var(--site-muted-bright)]">
          If the address can receive email, we sent a sign-in link to{" "}
          <strong className="font-medium text-[var(--site-ink)]">{email || "your inbox"}</strong>.
        </p>
        <div className="mt-8 border-l border-[var(--site-accent)] pl-5">
          <p className="text-[13px] font-medium">Open the link on this device</p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--site-muted)]">
            It expires after 15 minutes. You can close this tab once the signed-in page opens.
          </p>
        </div>
        <Link
          href="/login"
          className="mt-10 inline-flex min-h-11 items-center gap-2 text-[13px] text-[var(--site-muted-bright)] transition hover:text-[var(--site-ink)]"
        >
          <ArrowLeft size={15} /> Use a different email
        </Link>
      </div>
    </AuthShell>
  );
}
