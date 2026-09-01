import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight"
import { House } from "@phosphor-icons/react/dist/ssr/House"
import "@/components/landing/landing.css"

import PublicFooter from "@/components/landing/public-footer"
import BrandLogo from "@/components/brand/brand-logo"
import { docsUrl } from "@/lib/urls"

export const metadata: Metadata = {
  title: "Page not found | Beaco",
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main id="main-content" className="marketing-shell min-h-dvh overflow-x-clip bg-[var(--site-canvas)] text-[var(--site-ink)]">
      <header className="px-4 pt-4 sm:px-6 lg:px-8">
        <nav className="site-nav mx-auto flex h-16 w-full max-w-[1240px] items-center px-3 sm:px-4" aria-label="404 navigation">
          <Link href="/" className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.02em]" aria-label="Beaco home">
            <BrandLogo />
          </Link>
          <Link href={docsUrl()} className="ml-auto text-[12px] text-[var(--site-muted)] transition-colors duration-300 hover:text-[var(--site-ink)]">
            Documentation
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[calc(100dvh-84px)] w-full max-w-[1160px] items-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-[760px]">
          <p className="font-mono text-[12px] font-medium text-[var(--site-accent)]">404</p>
          <h1 className="mt-5 text-[clamp(3rem,8vw,7.5rem)] font-medium leading-[0.9] tracking-[-0.07em] text-balance">
            This page isn&apos;t here.
          </h1>
          <p className="mt-7 max-w-[520px] text-[16px] leading-7 text-[var(--site-muted)]">
            The address may have changed, or the page may no longer exist. The documentation and homepage are still available.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className="site-primary-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]">
              <span className="inline-flex items-center gap-2">
                <House size={15} weight="bold" aria-hidden="true" />
                Go home
              </span>
              <span className="site-primary-action-icon">
                <ArrowRight size={14} weight="bold" aria-hidden="true" />
              </span>
            </Link>
            <Link href={docsUrl()} className="site-secondary-action inline-flex h-12 items-center justify-center px-5 text-[13px] font-medium">
              Browse the docs
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}
