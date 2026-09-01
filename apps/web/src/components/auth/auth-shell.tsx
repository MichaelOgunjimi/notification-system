import Link from "next/link";
import { ArrowLeft, BellRinging, CheckCircle, Fingerprint } from "@phosphor-icons/react/dist/ssr";
import { ThemeToggle } from "@beaco/theme";
import BrandLogo from "@/components/brand/brand-logo";
import "./auth-shell.css";

type AuthShellProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export function AuthShell({
  children,
  title = "One identity for every notification operation.",
  description = "Sign in without a password. Beaco keeps human access separate from the scoped keys used by your applications.",
}: AuthShellProps) {
  return (
    <main id="main-content" className="auth-shell min-h-dvh text-[var(--site-ink)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex h-16 items-center justify-between border-b border-[var(--site-line)]">
          <Link href="/" aria-label="Beaco home">
            <BrandLogo priority markClassName="size-8" labelClassName="text-[15px] font-semibold tracking-[-0.03em] text-[var(--site-ink)]" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-[13px] text-[var(--site-muted-bright)] transition-colors hover:text-[var(--site-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]">
              <ArrowLeft size={15} aria-hidden="true" />
              Back to Beaco
            </Link>
          </div>
        </header>

        <div className="grid flex-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(32rem,1.08fr)]">
          <section className="auth-story relative hidden flex-col justify-between overflow-hidden border-r border-[var(--site-line)] px-10 py-16 lg:flex xl:px-16">
            <div className="relative z-10 max-w-xl">
              <p className="mb-6 font-mono text-[11px] tracking-[0.14em] text-[var(--site-accent)]">HUMAN ACCESS / PASSWORDLESS</p>
              <h1 className="max-w-[12ch] text-balance text-[clamp(2.6rem,5vw,5rem)] font-semibold leading-[0.95] tracking-[-0.065em]">{title}</h1>
              <p className="mt-7 max-w-[34rem] text-pretty text-[15px] leading-7 text-[var(--site-muted-bright)] sm:text-base">{description}</p>
            </div>

            <div className="relative z-10 mt-16 grid max-w-xl gap-6 sm:grid-cols-3 lg:mt-24 lg:grid-cols-1 xl:grid-cols-3">
              {[
                [Fingerprint, "No passwords", "A single-use link proves control of your email."],
                [BellRinging, "Project separation", "Human sessions never become application API keys."],
                [CheckCircle, "Short sessions", "Access tokens rotate through a durable refresh session."],
              ].map(([Icon, label, copy]) => {
                const ItemIcon = Icon as typeof Fingerprint;
                return (
                  <div key={String(label)} className="border-l border-[var(--site-line-strong)] pl-4">
                    <ItemIcon size={18} className="mb-4 text-[var(--site-accent)]" aria-hidden="true" />
                    <p className="text-[13px] font-medium text-[var(--site-ink)]">{String(label)}</p>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--site-muted)]">{String(copy)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex items-center justify-center px-1 py-12 sm:px-8 sm:py-16 lg:px-14 lg:py-20 xl:px-20">
            <div className="w-full max-w-[31rem]">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
