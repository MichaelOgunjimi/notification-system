"use client"

import Link from "next/link"
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise"
import { House } from "@phosphor-icons/react/dist/csr/House"
import { useEffect } from "react"
import BrandLogo from "@/components/brand/brand-logo"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="main-content" className="marketing-shell grid min-h-dvh place-items-center overflow-x-clip bg-[var(--site-canvas)] px-4 py-12 text-[var(--site-ink)] sm:px-6">
      <section className="site-frame w-full max-w-[760px]">
        <div className="relative overflow-hidden rounded-[19px] bg-[var(--site-panel)] px-6 py-12 sm:px-10 sm:py-14">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--site-accent)]/35 to-transparent" />
          <Link href="/" className="inline-flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.02em]" aria-label="Beaco home">
            <BrandLogo />
          </Link>

          <p className="mt-14 font-mono text-[11px] text-[var(--site-accent)]">Application error</p>
          <h1 className="mt-4 max-w-[620px] text-[clamp(2.6rem,7vw,5.5rem)] font-medium leading-[0.92] tracking-[-0.065em] text-balance">
            Something stopped unexpectedly.
          </h1>
          <p className="mt-6 max-w-[520px] text-[15px] leading-7 text-[var(--site-muted)]">
            Your data is unchanged. Try loading this view again, or return home if the problem continues.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="site-primary-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
            >
              <span>Try again</span>
              <span className="site-primary-action-icon">
                <ArrowCounterClockwise size={15} weight="bold" aria-hidden="true" />
              </span>
            </button>
            <Link href="/" className="site-secondary-action inline-flex h-12 items-center justify-center gap-2 px-5 text-[13px] font-medium">
              <House size={15} weight="light" aria-hidden="true" />
              Go home
            </Link>
          </div>

          {error.digest ? (
            <p className="mt-10 font-mono text-[10px] text-[#66665f]">Reference: {error.digest}</p>
          ) : null}
        </div>
      </section>
    </main>
  )
}
