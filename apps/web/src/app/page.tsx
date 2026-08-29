import Image from "next/image"
import Link from "next/link"
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise"
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight"
import { BracketsCurly } from "@phosphor-icons/react/dist/ssr/BracketsCurly"
import { ChatCircle } from "@phosphor-icons/react/dist/ssr/ChatCircle"
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise"
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple"
import { Fingerprint } from "@phosphor-icons/react/dist/ssr/Fingerprint"
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck"
import { WebhooksLogo } from "@phosphor-icons/react/dist/ssr/WebhooksLogo"

import AnimateOnScroll, {
  StaggerGroup,
  StaggerItem,
} from "@/components/landing/animate-on-scroll"
import MobileNav from "@/components/landing/mobile-nav"
import PublicFooter from "@/components/landing/public-footer"
import BrandLogo from "@/components/brand/brand-logo"
import { docsUrl } from "@/lib/urls"

const navLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Reliability", href: "#reliability" },
  { label: "Docs", href: docsUrl() },
]

const channels = [
  { icon: EnvelopeSimple, label: "Email" },
  { icon: ChatCircle, label: "SMS" },
  { icon: WebhooksLogo, label: "Webhooks" },
]

const platformGuarantees = [
  { value: "03", label: "Channels", detail: "One consistent event contract" },
  { value: "Safe", label: "Retries", detail: "Duplicate requests stop at ingress" },
  { value: "Full", label: "History", detail: "Every attempt keeps its context" },
]

const deliverySteps = [
  { title: "Accept", description: "Validate the event and lock its idempotency key." },
  { title: "Route", description: "Fan out to the right channel and render its template." },
  { title: "Deliver", description: "Send through the provider with channel-aware retries." },
  { title: "Record", description: "Keep every attempt available for support and audit work." },
]

const reliabilityFeatures = [
  {
    icon: ArrowCounterClockwise,
    title: "Retries that know when to stop",
    description:
      "Transient failures back off automatically. Permanent failures move somewhere useful instead of looping forever.",
    className: "lg:col-span-7",
  },
  {
    icon: ClockCounterClockwise,
    title: "A dead-letter queue you can work from",
    description:
      "Inspect the payload, provider response, and attempt history before you replay a failed delivery.",
    className: "lg:col-span-5",
  },
  {
    icon: Fingerprint,
    title: "Idempotency at the door",
    description:
      "Safe retries begin before an event reaches the queue, so duplicate requests do not become duplicate messages.",
    className: "lg:col-span-4",
  },
  {
    icon: ShieldCheck,
    title: "Suppression before send",
    description:
      "Block opted-out or unsafe recipients centrally, with a traceable reason attached to every decision.",
    className: "lg:col-span-8",
  },
]

const requestExample = `curl -X POST https://api.beaco.dev/v1/events \\
  -H "X-API-Key: nk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "invoice.paid",
    "channels": ["email", "webhook"],
    "recipient": { "email": "mina@example.com" },
    "data": { "invoice_id": "inv_84Q2" }
  }'`

const ArrowButton = ({ label, className = "" }: { label: string; className?: string }) => (
  <span className={`site-primary-action ${className}`}>
    <span>{label}</span>
    <span className="site-primary-action-icon">
      <ArrowRight size={14} weight="bold" aria-hidden="true" />
    </span>
  </span>
)

export default function Home() {
  return (
    <main
      id="main-content"
      className="marketing-shell min-h-dvh overflow-x-clip bg-[var(--site-canvas)] text-[var(--site-ink)]"
    >
      <div className="relative z-30 border-b border-white/[0.06] bg-[#090908] px-4 py-2.5 text-center text-[11px] tracking-[0.01em] text-[var(--site-muted)]">
        <span className="sm:hidden">Built for reliable delivery.</span>
        <span className="hidden sm:inline">Notification infrastructure for teams that need the full delivery story.</span>
        <Link
          href={docsUrl("/quickstart")}
          className="ml-2 inline-flex items-center gap-1.5 text-[var(--site-accent)] transition-colors duration-300 hover:text-[var(--site-accent-bright)]"
        >
          <span className="sm:hidden">Quickstart</span>
          <span className="hidden sm:inline">Read the quickstart</span>
          <ArrowRight size={12} weight="bold" aria-hidden="true" />
        </Link>
      </div>

      <header className="sticky top-3 z-40 px-3 sm:px-4">
        <nav className="site-nav mx-auto flex h-16 w-full max-w-[1240px] items-center gap-8 px-3 sm:px-4">
          <Link
            href="/"
            className="group flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.02em]"
            aria-label="Beaco home"
          >
            <BrandLogo priority className="transition-transform duration-300 ease-[var(--site-ease)] group-hover:-translate-y-0.5" />
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[12px] text-[var(--site-muted)] transition-colors duration-300 hover:text-[var(--site-ink)]"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link
              href="/login"
              className="rounded-[9px] px-3 py-2 text-[12px] font-medium text-[var(--site-muted)] transition-colors duration-300 hover:text-[var(--site-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
            >
              Sign in
            </Link>
            <Link href={docsUrl("/quickstart")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]">
              <ArrowButton label="Start building" />
            </Link>
          </div>

          <div className="ml-auto md:hidden">
            <MobileNav links={navLinks} />
          </div>
        </nav>
      </header>

      <div className="site-page-grid mx-auto mt-7 w-[calc(100%-1rem)] max-w-[1240px] sm:mt-8 sm:w-[calc(100%-2rem)]">
        <section className="site-grid-section">
          <div className="grid overflow-hidden bg-[var(--site-panel)] lg:min-h-[570px] lg:grid-cols-[minmax(0,1.12fr)_minmax(390px,0.88fr)]">
            <div className="relative flex flex-col justify-center px-6 py-11 sm:px-10 sm:py-14 lg:px-14 lg:py-14 xl:px-[68px]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--site-accent)]/30 to-transparent" />
              <AnimateOnScroll variant="fade-up">
                <p className="mb-6 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--site-muted)]">
                  <span className="h-px w-6 bg-[var(--site-accent)]" />
                  Built for the messages that matter
                </p>
                <h1 className="max-w-[620px] text-[clamp(2.15rem,10.4vw,4.65rem)] font-medium leading-[0.94] tracking-[-0.065em]">
                  <span className="block sm:whitespace-nowrap">Message delivery.</span>
                  <span className="block text-[var(--site-muted-bright)] sm:whitespace-nowrap">Under control.</span>
                </h1>
              </AnimateOnScroll>

              <AnimateOnScroll variant="fade-up" delay={90}>
                <p className="mt-6 max-w-[510px] text-[15px] leading-7 text-[var(--site-muted)] text-pretty sm:text-[16px]">
                  One API for email, SMS, and webhooks, with queues, retries, templates, and a complete delivery trail.
                </p>
              </AnimateOnScroll>

              <AnimateOnScroll variant="fade-up" delay={150}>
                <div className="mt-7 grid grid-cols-2 gap-2 sm:max-w-[390px]">
                  <Link href={docsUrl("/quickstart")} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]">
                    <ArrowButton label="Start building" className="w-full" />
                  </Link>
                  <Link href={docsUrl()} className="site-secondary-action inline-flex h-12 w-full items-center justify-center px-4 text-[13px] font-medium">
                    Explore the docs
                  </Link>
                </div>
              </AnimateOnScroll>
            </div>

            <div className="grid border-t border-white/[0.07] bg-[#090908] lg:grid-rows-[1fr_auto] lg:border-l lg:border-t-0">
              <div className="relative min-h-[280px] overflow-hidden sm:min-h-[410px] lg:min-h-0">
                <Image
                  src="/beaco-routing-dark.webp"
                  alt="Three graphite notification modules connected by an amber signal rail"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 44vw"
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] bg-[#0b0b0a] px-5 py-4 sm:px-7 sm:py-5">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--site-ink)]">One event, three routes</p>
                  <p className="mt-1 text-[10px] text-[var(--site-muted)]">Each channel keeps its own delivery history.</p>
                </div>
                <div className="flex items-center gap-1.5" aria-label="Supported channels">
                  {channels.map(({ icon: Icon, label }) => (
                    <span key={label} title={label} className="grid size-8 place-items-center rounded-[8px] border border-white/[0.09] bg-white/[0.055] text-[var(--site-ink)]">
                      <Icon size={14} weight="light" aria-hidden="true" />
                      <span className="sr-only">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="site-grid-section" aria-label="Platform guarantees">
          <div className="grid w-full grid-cols-2 md:grid-cols-12">
            {platformGuarantees.map(({ value, label, detail }, index) => (
              <div
                key={label}
                className={`site-stat-block px-5 py-7 text-center sm:px-8 sm:py-9 sm:text-left lg:px-10 ${
                  index === 0
                    ? "col-span-2 border-b border-white/[0.07] md:col-span-3 md:border-b-0 md:border-r"
                    : index === 1
                      ? "col-span-1 border-r border-white/[0.07] md:col-span-4"
                      : "col-span-1 md:col-span-5"
                }`}
              >
                <p className="font-mono text-[17px] font-medium tracking-[-0.04em] text-[var(--site-accent)] sm:text-[20px]">{value}</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--site-ink)] sm:text-[12px]">{label}</p>
                <p className="mt-1.5 hidden text-[11px] text-[var(--site-muted)] sm:block">{detail}</p>
              </div>
            ))}
          </div>
        </section>

      <section id="how-it-works" className="site-grid-section site-grid-field">
        <div className="px-6 py-20 sm:px-10 sm:py-24 lg:px-14 lg:py-28">
          <AnimateOnScroll>
            <div className="max-w-[720px]">
              <h2 className="text-[clamp(2.35rem,4.5vw,4.35rem)] font-medium leading-[0.98] tracking-[-0.06em] text-balance">
                One event enters. Beaco handles the rest.
              </h2>
              <p className="mt-5 max-w-[610px] text-[15px] leading-7 text-[var(--site-muted)]">
                Your application emits business events. Beaco turns them into dependable customer messages and keeps the operational detail attached.
              </p>
            </div>
          </AnimateOnScroll>

          <div className="mt-14 border border-white/[0.075]">
            <div className="grid overflow-hidden bg-[#0a0a09] lg:grid-cols-12">
              <AnimateOnScroll variant="fade-right" className="min-w-0 p-6 sm:p-8 lg:col-span-7 lg:p-10 xl:p-12">
                <div className="mb-8 flex items-center gap-2 text-[var(--site-muted)]">
                  <BracketsCurly size={16} weight="light" className="text-[var(--site-accent)]" aria-hidden="true" />
                  <span className="font-mono text-[11px]">Create an event</span>
                </div>
                <pre className="overflow-x-auto font-mono text-[11px] leading-6 text-[#dedcd3] sm:text-[12px]">
                  <code>{requestExample}</code>
                </pre>
              </AnimateOnScroll>

              <StaggerGroup className="border-t border-white/[0.07] bg-[var(--site-soft)] p-6 sm:p-8 lg:col-span-5 lg:border-l lg:border-t-0 lg:p-10" staggerMs={70}>
                {deliverySteps.map((step, index) => (
                  <StaggerItem key={step.title}>
                    <div className="grid grid-cols-[38px_1fr] gap-4 pb-8 last:pb-0">
                      <span className="grid size-[38px] place-items-center rounded-[9px] border border-white/[0.09] bg-white/[0.035] font-mono text-[10px] text-[var(--site-muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="border-b border-white/[0.07] pb-8 last:border-b-0">
                        <h3 className="text-[15px] font-medium tracking-[-0.02em]">{step.title}</h3>
                        <p className="mt-1.5 max-w-[360px] text-[12px] leading-5 text-[var(--site-muted)]">{step.description}</p>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerGroup>
            </div>
          </div>
        </div>
      </section>

      <section id="reliability" className="site-grid-section site-grid-field site-grid-field-reverse">
        <div className="px-6 py-20 sm:px-10 sm:py-24 lg:px-14 lg:py-28">
          <AnimateOnScroll>
            <div className="max-w-[760px]">
              <h2 className="text-[clamp(2.35rem,4.5vw,4.35rem)] font-medium leading-[0.98] tracking-[-0.06em] text-balance">
                The failure cases already have a home.
              </h2>
              <p className="mt-5 max-w-[610px] text-[15px] leading-7 text-[var(--site-muted)]">
                Queues and providers fail in different ways. Beaco keeps each recovery path explicit, inspectable, and safe to operate.
              </p>
            </div>
          </AnimateOnScroll>

          <StaggerGroup className="mt-14 grid border-l border-t border-white/[0.075] lg:grid-cols-12" staggerMs={65}>
            {reliabilityFeatures.map(({ icon: Icon, title, description, className }, index) => (
              <StaggerItem key={title} className={className}>
                <article className={`site-feature-card group relative min-h-[250px] overflow-hidden border-b border-r border-white/[0.075] p-7 sm:p-9 ${index === 0 || index === 3 ? "bg-[var(--site-soft)] lg:min-h-[315px]" : "bg-[var(--site-panel)] lg:min-h-[275px]"}`}>
                  <div className="absolute right-0 top-0 size-36 bg-[radial-gradient(circle_at_top_right,rgba(233,170,49,0.09),transparent_68%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <span className="grid size-11 place-items-center rounded-[11px] border border-white/[0.09] bg-white/[0.035] text-[var(--site-ink)]">
                    <Icon size={19} weight="light" aria-hidden="true" />
                  </span>
                  <div className={`${index === 0 || index === 3 ? "mt-20" : "mt-14"} max-w-[520px]`}>
                    <h3 className="text-[20px] font-medium tracking-[-0.035em]">{title}</h3>
                    <p className="mt-3 text-[13px] leading-6 text-[var(--site-muted)]">{description}</p>
                  </div>
                </article>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      <section className="site-grid-section">
          <div className="site-cta relative grid overflow-hidden bg-[var(--site-panel)] lg:grid-cols-12">
            <div className="px-6 py-14 sm:px-10 lg:col-span-9 lg:px-14 lg:py-16">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--site-accent)]">The first event takes minutes</p>
              <h2 className="mt-4 max-w-[780px] text-[clamp(2.4rem,4.8vw,4.8rem)] font-medium leading-[0.96] tracking-[-0.065em] text-balance">
                Start with one event. Keep the control.
              </h2>
            </div>
            <div className="flex items-center border-t border-white/[0.07] px-6 py-10 sm:px-10 sm:py-12 lg:col-span-3 lg:border-l lg:border-t-0 lg:px-10 lg:py-16">
              <Link href={docsUrl("/quickstart")} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]">
                <ArrowButton label="Open the quickstart" />
              </Link>
            </div>
          </div>
      </section>

        <PublicFooter />
      </div>
    </main>
  )
}
