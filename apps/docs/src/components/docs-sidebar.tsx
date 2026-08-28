"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  BracketsCurly,
  Database,
  EnvelopeSimple,
  House,
  Lightning,
  PaperPlaneTilt,
  PlugsConnected,
  RocketLaunch,
  TreeStructure,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { DocSlug } from "@/lib/docs";

const DOC_ICONS: Record<DocSlug, ReactNode> = {
  introduction: <BookOpenText size={15} />,
  quickstart: <RocketLaunch size={15} />,
  events: <Lightning size={15} />,
  channels: <EnvelopeSimple size={15} />,
  templates: <BracketsCurly size={15} />,
  delivery: <PaperPlaneTilt size={15} />,
  "api-reference": <Database size={15} />,
  architecture: <TreeStructure size={15} />,
  webhooks: <PlugsConnected size={15} />,
};

const sections = [
  {
    label: "Getting started",
    items: [
      { slug: "introduction" as const, href: "/introduction", label: "Introduction" },
      { slug: "quickstart" as const, href: "/quickstart", label: "Quickstart" },
    ],
  },
  {
    label: "Build",
    items: [
      { slug: "events" as const, href: "/events", label: "Events" },
      { slug: "channels" as const, href: "/channels", label: "Channels" },
      { slug: "templates" as const, href: "/templates", label: "Templates" },
      { slug: "delivery" as const, href: "/delivery", label: "Delivery pipeline" },
    ],
  },
  {
    label: "Understand",
    items: [
      { slug: "api-reference" as const, href: "/api-reference", label: "API reference" },
      { slug: "architecture" as const, href: "/architecture", label: "Architecture" },
      { slug: "webhooks" as const, href: "/webhooks", label: "Webhooks" },
    ],
  },
];

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Beaco documentation" className="px-4 py-6">
      <Link
        href="/"
        onClick={onNavigate}
        className={`mb-7 flex items-center gap-2.5 rounded-md px-3 py-2 text-[12px] transition-colors ${
          pathname === "/"
            ? "bg-white/[0.06] text-[var(--docs-ink)]"
            : "text-[var(--docs-muted)] hover:bg-white/[0.035] hover:text-[var(--docs-ink)]"
        }`}
      >
        <House size={15} className={pathname === "/" ? "text-[var(--docs-accent)]" : "text-[#68675f]"} />
        Documentation home
      </Link>

      <div className="space-y-7">
        {sections.map((section) => (
          <section key={section.label}>
            <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#626159]">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-[12px] transition-colors ${
                      active
                        ? "bg-[color-mix(in_srgb,var(--docs-accent)_9%,transparent)] text-[var(--docs-ink)]"
                        : "text-[var(--docs-muted)] hover:bg-white/[0.035] hover:text-[var(--docs-ink)]"
                    }`}
                  >
                    <span className={active ? "text-[var(--docs-accent)]" : "text-[#68675f] group-hover:text-[#9a9890]"}>
                      {DOC_ICONS[item.slug]}
                    </span>
                    {item.label}
                    {active ? <span className="ml-auto size-1 rounded-full bg-[var(--docs-accent)]" /> : null}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 border-t border-white/[0.065] px-3 pt-5">
        <p className="text-[10px] leading-5 text-[#626159]">Beaco docs · v1 foundation</p>
      </div>
    </nav>
  );
}
