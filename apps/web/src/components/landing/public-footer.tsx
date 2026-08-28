import Link from "next/link"
import BrandLogo from "@/components/brand/brand-logo"
import { docsUrl } from "@/lib/urls"

const exploreLinks = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Reliability", href: "/#reliability" },
  { label: "Documentation", href: docsUrl() },
]

const buildLinks = [
  { label: "Quickstart", href: docsUrl("/quickstart") },
  { label: "Events", href: docsUrl("/events") },
  { label: "Webhooks", href: docsUrl("/webhooks") },
]

const footerLinkClass =
  "text-[12px] text-[#8f8e86] transition-colors duration-300 hover:text-[#f1efe7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9aa31]"

export default function PublicFooter() {
  return (
    <footer className="site-footer border-t border-white/[0.07] bg-[#080807]">
      <div className="grid lg:grid-cols-4">
        <div className="border-b border-white/[0.07] px-6 py-12 sm:px-10 sm:py-14 lg:col-span-2 lg:border-b-0 lg:border-r lg:px-14 lg:py-16">
          <div className="max-w-[500px]">
            <Link
              href="/"
              className="group inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9aa31]"
              aria-label="Beaco home"
            >
              <BrandLogo
                className="transition-transform duration-300 group-hover:-translate-y-0.5"
                markClassName="size-10"
                labelClassName="text-[15px] font-semibold tracking-[-0.025em] text-[#f1efe7]"
              />
            </Link>
            <p className="mt-5 max-w-[380px] text-[22px] font-medium leading-[1.18] tracking-[-0.04em] text-[#d2d0c7] text-balance sm:text-[25px]">
              Notification infrastructure with the operational detail still attached.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:col-span-2">
          <nav className="border-r border-white/[0.07] px-6 py-10 sm:px-10 lg:px-10 lg:py-16" aria-label="Explore Beaco">
            <p className="mb-4 text-[11px] font-medium text-[#d2d0c7]">Explore</p>
            <ul className="space-y-3.5">
              {exploreLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLinkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="px-6 py-10 sm:px-10 lg:px-10 lg:py-16" aria-label="Developer resources">
            <p className="mb-4 text-[11px] font-medium text-[#d2d0c7]">Build</p>
            <ul className="space-y-3.5">
              {buildLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={footerLinkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="flex flex-col gap-5 border-t border-white/[0.07] px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-14">
          <p className="text-[11px] text-[#66665f]">© {new Date().getFullYear()} Beaco</p>
          <div className="flex items-center gap-6">
            <Link href="/login" className={footerLinkClass}>
              Sign in
            </Link>
            <a
              href="https://github.com/MichaelOgunjimi/notification-system"
              target="_blank"
              rel="noreferrer"
              className={footerLinkClass}
            >
              GitHub
            </a>
          </div>
      </div>
    </footer>
  )
}
