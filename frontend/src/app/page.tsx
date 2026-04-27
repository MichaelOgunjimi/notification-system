import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Code2,
  Cpu,
  FileText,
  Fingerprint,
  Key,
  Layers,
  Mail,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  Terminal,
  Webhook,
  Zap,
} from "lucide-react"

import AnimateOnScroll, {
  StaggerGroup,
  StaggerItem,
} from "@/components/landing/animate-on-scroll"
import AnimatedCounter from "@/components/landing/animated-counter"
import HeroBackground from "@/components/landing/hero-background"
import MobileNav from "@/components/landing/mobile-nav"
import { CopyCommandButton, CURL_COMMAND } from "@/components/landing/terminal-preview"
import TerminalPreview from "@/components/landing/terminal-preview"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Docs", href: "/docs" },
  { label: "Dashboard", href: "/dashboard" },
]

const pipelineSteps = [
  {
    number: "01",
    icon: Terminal,
    title: "Ingest",
    description: "Send an event via REST API with channel routing and metadata",
    color: "text-blue-400",
    glow: "rgba(96, 165, 250, 0.15)",
  },
  {
    number: "02",
    icon: Layers,
    title: "Queue",
    description: "Event is validated, deduplicated, and pushed to Redis queue",
    color: "text-violet-400",
    glow: "rgba(167, 139, 250, 0.15)",
  },
  {
    number: "03",
    icon: Zap,
    title: "Process",
    description: "Celery worker renders templates and prepares the payload",
    color: "text-[var(--primary)]",
    glow: "rgba(245, 158, 11, 0.15)",
  },
  {
    number: "04",
    icon: Send,
    title: "Deliver",
    description: "Dispatched via email, SMS, or webhook with retry on failure",
    color: "text-emerald-400",
    glow: "rgba(52, 211, 153, 0.15)",
  },
]

const featureCards = [
  {
    number: "01",
    title: "Multi-Channel Delivery",
    description:
      "Route notifications to email via Resend, SMS via Twilio, or webhook to any endpoint — all from a single API call.",
    icon: Radio,
    span: "lg:col-span-2 lg:row-span-2",
    badges: ["Email", "SMS", "Webhook"],
  },
  {
    number: "02",
    title: "Smart Retries & DLQ",
    description:
      "Exponential backoff with jitter. Failed after max retries? Automatically routed to dead-letter queue for manual inspection.",
    icon: RefreshCw,
    span: "lg:col-span-2",
    detail: "retry",
  },
  {
    number: "03",
    title: "Jinja2 Templates",
    description:
      "Dynamic content with variable interpolation. Create templates once, reuse across channels.",
    icon: FileText,
    span: "",
    detail: "template",
  },
  {
    number: "04",
    title: "Real-time Dashboard",
    description:
      "Full observability — monitor events, deliveries, failures, queue depth, and latency from a single dashboard.",
    icon: BarChart3,
    span: "",
  },
  {
    number: "05",
    title: "Idempotency Built-in",
    description:
      "Duplicate events are automatically deduplicated using idempotency keys. Safe to retry without side effects.",
    icon: Fingerprint,
    span: "",
  },
  {
    number: "06",
    title: "API-First Design",
    description:
      "Clean REST API with scoped project keys and master keys for admin. Every action is API-accessible.",
    icon: Key,
    span: "",
  },
]

const techStack = [
  { icon: Code2, label: "PostgreSQL", desc: "Event persistence & audit trail" },
  { icon: Cpu, label: "Redis + Celery", desc: "Async task queue & workers" },
  { icon: Zap, label: "FastAPI", desc: "High-performance async API" },
  { icon: Layers, label: "Alembic", desc: "Database migrations" },
]

export default function Home() {
  return (
    <main className="relative scroll-smooth bg-[var(--background)] text-[var(--foreground)]">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-white">
            <span className="beaco-dot size-2 rounded-full bg-[var(--primary)]" />
            Beaco
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] text-[var(--gray-9)] transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/michaelowiti/notification-system"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-[var(--gray-9)] transition-colors hover:text-white"
            >
              GitHub
            </a>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <Link
                href="/docs/quickstart"
                className={cn(
                  buttonVariants(),
                  "h-8 rounded-lg bg-[var(--primary)] px-4 text-xs font-medium text-[var(--primary-foreground)] hover:bg-[color:color-mix(in_oklab,var(--primary),black_18%)]"
                )}
              >
                Get Started
              </Link>
            </div>
            <MobileNav links={navLinks} />
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden">
        {/* Animated canvas background with grid + floating nodes */}
        <HeroBackground />

        {/* Radial glow overlay */}
        <div className="pointer-events-none absolute top-0 left-1/2 -z-[5] h-[700px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.10)_0%,transparent_55%)]" />

        <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-14 sm:px-6 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-24">
          <div className="flex flex-col items-center text-center">

            {/* Pill badge */}
            <AnimateOnScroll variant="fade-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3.5 py-1.5 backdrop-blur-sm">
                <span className="beaco-dot size-1.5 rounded-full bg-[var(--primary)]" />
                <span className="text-[11px] font-medium tracking-wide text-[var(--primary)] sm:text-xs">
                  Notification Infrastructure for Developers
                </span>
              </div>
            </AnimateOnScroll>

            {/* Heading */}
            <AnimateOnScroll variant="fade-up" delay={100}>
              <h1 className="mt-7 max-w-4xl text-[clamp(2.25rem,6vw,4.5rem)] leading-[1.08] font-bold tracking-tight text-white sm:mt-8">
                Event-driven notifications{" "}
                <span className="hero-highlight">as&nbsp;a&nbsp;service</span>
              </h1>
            </AnimateOnScroll>

            {/* Subheading */}
            <AnimateOnScroll variant="fade-up" delay={200}>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--gray-8)] sm:mt-6 sm:text-base lg:text-lg">
                Send notifications via email, SMS, and webhooks with a single API call.
                Built-in queues, retries, templates, and real-time observability.
              </p>
            </AnimateOnScroll>

            {/* Channel badges */}
            <AnimateOnScroll variant="fade-up" delay={250}>
              <div className="mt-5 flex items-center gap-2">
                {[
                  { icon: Mail, label: "Email" },
                  { icon: MessageSquare, label: "SMS" },
                  { icon: Webhook, label: "Webhook" },
                ].map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--gray-9)] backdrop-blur-sm"
                  >
                    <Icon className="size-3 text-[var(--primary)]" />
                    {label}
                  </span>
                ))}
              </div>
            </AnimateOnScroll>

            {/* CTAs */}
            <AnimateOnScroll variant="fade-up" delay={300}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/docs/quickstart"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "group h-11 bg-[var(--primary)] px-6 text-sm font-medium text-black hover:bg-[color:color-mix(in_oklab,var(--primary),black_12%)]"
                  )}
                >
                  Get Started
                  <ArrowRight className="ml-1.5 size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/docs"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-11 border-white/10 bg-white/[0.03] px-6 text-sm text-[var(--gray-10)] hover:border-white/20 hover:bg-white/[0.06]"
                  )}
                >
                  Read the Docs
                </Link>
              </div>
            </AnimateOnScroll>

            {/* Inline curl — hidden on small mobile, scrollable otherwise */}
            <AnimateOnScroll variant="fade-up" delay={350}>
              <div className="mt-6 hidden max-w-full items-center gap-2 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 backdrop-blur-sm sm:inline-flex">
                <code className="overflow-x-auto whitespace-nowrap font-mono text-xs text-[var(--gray-8)] sm:text-[13px]">
                  {CURL_COMMAND}
                </code>
                <CopyCommandButton text={CURL_COMMAND} iconOnly />
              </div>
            </AnimateOnScroll>
          </div>

          {/* Terminal preview */}
          <AnimateOnScroll variant="scale-in" delay={450}>
            <div className="mx-auto mt-12 max-w-3xl sm:mt-16">
              <TerminalPreview />
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Subtle static grid for remaining sections */}
      <div className="grid-bg pointer-events-none fixed inset-0 -z-20 opacity-50" />

      {/* ── Dashboard Preview ── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <AnimateOnScroll variant="fade-up">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-widest text-[var(--primary)] uppercase">
              Observability
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Monitor everything in real-time
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[var(--gray-9)]">
              A single operational view for events, delivery health, queue depth, and failure diagnostics.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="scale-in" delay={200}>
          <div className="mt-14 [perspective:1400px]">
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--gray-1)] shadow-[0_0_100px_rgba(245,158,11,0.1),0_20px_60px_rgba(0,0,0,0.4)] [transform:rotateX(2deg)]">
              {/* Browser chrome */}
              <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[var(--gray-2)] px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#febc2e]" />
                  <span className="size-2.5 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex-1 rounded-md border border-white/[0.06] bg-black/30 px-3 py-1 text-center text-[11px] tracking-wide text-[var(--gray-8)]">
                  beaco.michaelogunjimi.com/dashboard
                </div>
              </div>
              <Image
                src="/dashboard-preview.png"
                alt="Beaco dashboard showing event delivery metrics, pipeline health, and recent notification activity"
                width={1920}
                height={1080}
                className="h-auto w-full"
                priority
              />
            </div>
          </div>
        </AnimateOnScroll>

        {/* Stats row */}
        <StaggerGroup className="mt-8 grid gap-3 sm:grid-cols-3" staggerMs={120}>
          <StaggerItem>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-white">
                <AnimatedCounter end={204} suffix="+" />
              </p>
              <p className="mt-1 text-xs text-[var(--gray-9)]">Events Processed</p>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-white">
                <AnimatedCounter end={88.5} suffix="%" decimals={1} />
              </p>
              <p className="mt-1 text-xs text-[var(--gray-9)]">Delivery Rate</p>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-white">
                {"< "}<AnimatedCounter end={2} suffix="s" />
              </p>
              <p className="mt-1 text-xs text-[var(--gray-9)]">Avg Latency</p>
            </div>
          </StaggerItem>
        </StaggerGroup>
      </section>

      {/* ── How It Works — Pipeline ── */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,rgba(245,158,11,0.06),transparent_60%)]" />

        <AnimateOnScroll variant="fade-up">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-widest text-[var(--primary)] uppercase">
              Pipeline
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              How it works
            </h2>
          </div>
        </AnimateOnScroll>

        <StaggerGroup className="mt-14 grid gap-4 md:grid-cols-4" staggerMs={100}>
          {pipelineSteps.map((step, index) => {
            const Icon = step.icon
            return (
              <StaggerItem key={step.title}>
                <div className="group relative h-full">
                  <div className="feature-card h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-widest text-[var(--gray-8)]">
                        {step.number}
                      </span>
                    </div>
                    <div
                      className="mt-3 mb-4 inline-flex rounded-xl p-2.5"
                      style={{ backgroundColor: step.glow }}
                    >
                      <Icon className={cn("size-5", step.color)} />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--gray-9)]">
                      {step.description}
                    </p>
                  </div>
                  {/* Connector arrow */}
                  {index < pipelineSteps.length - 1 && (
                    <div className="absolute top-1/2 -right-2.5 z-10 hidden -translate-y-1/2 md:block">
                      <ArrowRight className="size-4 text-[var(--gray-6)]" />
                    </div>
                  )}
                </div>
              </StaggerItem>
            )
          })}
        </StaggerGroup>
      </section>

      {/* ── Features — Bento Grid ── */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <AnimateOnScroll variant="fade-up">
          <p className="text-xs font-semibold tracking-widest text-[var(--primary)] uppercase">
            Features
          </p>
          <h2 className="mt-3 text-4xl leading-tight font-bold tracking-tight text-white sm:text-5xl">
            Built for reliability
          </h2>
          <p className="mt-4 max-w-2xl text-[var(--gray-9)]">
            Every component is designed for production workloads — idempotent delivery,
            automatic retries, and full observability out of the box.
          </p>
        </AnimateOnScroll>

        <StaggerGroup className="mt-12 grid gap-4 lg:grid-cols-4" staggerMs={80}>
          {featureCards.map((feature) => {
            const Icon = feature.icon
            return (
              <StaggerItem key={feature.title} className={feature.span}>
                <div className="feature-card h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
                  <div className="flex items-start justify-between">
                    <div className="inline-flex rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/10 p-2.5">
                      <Icon className="size-5 text-[var(--primary)]" />
                    </div>
                    <span className="text-[11px] font-bold tracking-widest text-[var(--gray-7)]">
                      {feature.number}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--gray-9)]">
                    {feature.description}
                  </p>

                  {/* Card-specific extras */}
                  {feature.badges && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {feature.badges.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-xs text-[var(--gray-10)]"
                        >
                          {b === "Email" && <Mail className="size-3" />}
                          {b === "SMS" && <MessageSquare className="size-3" />}
                          {b === "Webhook" && <Webhook className="size-3" />}
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                  {feature.detail === "retry" && (
                    <div className="mt-5 flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-xs text-[var(--gray-10)]">
                      <span>1</span>
                      <ArrowRight className="size-3 text-[var(--gray-7)]" />
                      <span>2</span>
                      <ArrowRight className="size-3 text-[var(--gray-7)]" />
                      <span>3</span>
                      <ArrowRight className="size-3 text-[var(--gray-7)]" />
                      <span className="font-semibold text-[var(--primary)]">DLQ</span>
                    </div>
                  )}
                  {feature.detail === "template" && (
                    <div className="mt-5 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-xs text-[var(--gray-10)]">
                      Hello {"{{name}}"}, your {"{{plan}}"} is active
                    </div>
                  )}
                </div>
              </StaggerItem>
            )
          })}
        </StaggerGroup>
      </section>

      {/* ── Architecture ── */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.06),transparent_60%)]" />

        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <AnimateOnScroll variant="fade-right">
            <div>
              <p className="text-xs font-semibold tracking-widest text-[var(--primary)] uppercase">
                Architecture
              </p>
              <h2 className="mt-3 text-4xl leading-tight font-bold tracking-tight text-white sm:text-5xl">
                Production-grade infrastructure
              </h2>
              <p className="mt-5 max-w-xl text-[var(--gray-9)]">
                Beaco runs as a resilient event pipeline with separated ingestion,
                processing, and delivery layers. Each stage is observable and designed for safe retries.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-3">
                {techStack.map((tech) => {
                  const TechIcon = tech.icon
                  return (
                    <div
                      key={tech.label}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                    >
                      <TechIcon className="size-4 text-[var(--primary)]" />
                      <p className="mt-2 text-sm font-medium text-white">{tech.label}</p>
                      <p className="mt-0.5 text-xs text-[var(--gray-8)]">{tech.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll variant="fade-left" delay={150}>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
              <p className="mb-4 text-[11px] font-bold tracking-widest text-[var(--gray-8)] uppercase">
                Event Pipeline
              </p>
              <div className="space-y-2">
                {[
                  { label: "Event API", sub: "POST /api/v1/events", accent: false },
                  { label: "Redis Queue", sub: "Async task dispatch", accent: false },
                  { label: "Celery Worker", sub: "Template render + payload prep", accent: false },
                  {
                    label: "Channel Adapter",
                    sub: "Email · SMS · Webhook",
                    accent: false,
                  },
                  { label: "Dead-Letter Queue", sub: "Failed after 3 retries", accent: true },
                ].map((item, i, arr) => (
                  <div key={item.label}>
                    <div
                      className={cn(
                        "rounded-lg border px-4 py-3",
                        item.accent
                          ? "border-[var(--primary)]/25 bg-[var(--primary)]/5"
                          : "border-white/[0.06] bg-black/20"
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm font-medium",
                          item.accent ? "text-[var(--primary)]" : "text-white"
                        )}
                      >
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--gray-8)]">{item.sub}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex items-center gap-1 py-1 pl-4">
                        <div className="h-4 w-px bg-[var(--gray-5)]" />
                        {i === arr.length - 2 && (
                          <span className="ml-1 text-[10px] text-[var(--gray-7)]">
                            on failure
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.12),transparent_55%)]" />

        <AnimateOnScroll variant="fade-up">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Start sending notifications
            <br />
            <span className="text-[var(--primary)]">in minutes</span>
          </h2>
          <p className="mt-4 text-[var(--gray-9)]">
            Free to use. Open source. No credit card required.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/docs/quickstart"
              className={cn(
                buttonVariants({ size: "lg" }),
                "group h-11 bg-[var(--primary)] px-6 text-sm font-medium text-black hover:bg-[color:color-mix(in_oklab,var(--primary),black_12%)]"
              )}
            >
              Get Started
              <ArrowRight className="ml-1.5 size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="https://github.com/michaelowiti/notification-system"
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 border-white/10 bg-white/[0.03] px-6 text-sm text-[var(--gray-10)] hover:border-white/20 hover:bg-white/[0.06]"
              )}
            >
              View on GitHub
            </a>
          </div>
        </AnimateOnScroll>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2 text-[var(--gray-9)]">
            <span className="size-1.5 rounded-full bg-[var(--primary)]" />
            <span className="font-medium text-[var(--gray-10)]">Beaco</span>
            <span>·</span>
            <span>Built by Michael Ogunjimi</span>
          </div>
          <div className="flex items-center gap-5 text-[var(--gray-8)]">
            <Link href="/docs" className="transition-colors hover:text-white">
              Docs
            </Link>
            <Link href="/dashboard" className="transition-colors hover:text-white">
              Dashboard
            </Link>
            <a
              href="https://github.com/michaelowiti/notification-system"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white"
            >
              GitHub
            </a>
            <span className="text-[var(--gray-6)]">© 2026</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
