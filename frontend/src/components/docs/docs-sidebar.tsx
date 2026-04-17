"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Code2,
  Layers,
  Mail,
  Rocket,
  Send,
  Server,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DocSlug } from "@/lib/docs";

const DOC_ICONS: Record<DocSlug, ReactNode> = {
  introduction: <BookOpen size={16} />,
  quickstart: <Rocket size={16} />,
  events: <Zap size={16} />,
  channels: <Mail size={16} />,
  templates: <Code2 size={16} />,
  delivery: <Send size={16} />,
  "api-reference": <Server size={16} />,
  architecture: <Layers size={16} />,
  "self-hosting": <Server size={16} />,
};

interface SidebarSection {
  label: string;
  items: { slug: DocSlug; href: string; label: string }[];
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: "Getting Started",
    items: [
      { slug: "introduction", href: "/docs/introduction", label: "Introduction" },
      { slug: "quickstart", href: "/docs/quickstart", label: "Quickstart" },
    ],
  },
  {
    label: "Guides",
    items: [
      { slug: "events", href: "/docs/events", label: "Events" },
      { slug: "channels", href: "/docs/channels", label: "Channels" },
      { slug: "templates", href: "/docs/templates", label: "Templates" },
      { slug: "delivery", href: "/docs/delivery", label: "Delivery Pipeline" },
    ],
  },
  {
    label: "Reference",
    items: [
      { slug: "api-reference", href: "/docs/api-reference", label: "API Reference" },
      { slug: "architecture", href: "/docs/architecture", label: "Architecture" },
      { slug: "self-hosting", href: "/docs/self-hosting", label: "Self-Hosting" },
    ],
  },
];

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Beacon documentation" className="p-4">
      <div className="mb-6 flex items-center justify-between rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"
        >
          <Sparkles size={16} className="text-[var(--primary)]" />
          Beacon
        </Link>
        <span className="rounded-full border border-[var(--gray-4)] bg-[var(--gray-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--gray-9)]">
          Docs
        </span>
      </div>

      <div className="space-y-5">
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-7)]">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                      isActive
                        ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                        : "text-[var(--gray-9)] hover:bg-[var(--gray-2)]"
                    }`}
                  >
                    <span
                      className={
                        isActive
                          ? "text-[var(--primary)]"
                          : "text-[var(--gray-7)]"
                      }
                    >
                      {DOC_ICONS[item.slug]}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
