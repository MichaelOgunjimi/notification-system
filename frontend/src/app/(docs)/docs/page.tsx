import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Code2,
  Layers,
  Mail,
  Rocket,
  Send,
  Server,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getDocsByGroup } from "@/lib/docs";
import type { DocSlug } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation — Beacon",
  description:
    "Learn how to integrate and operate the Beacon event-driven notification system.",
};

const ICONS: Record<DocSlug, ReactNode> = {
  introduction: <BookOpen size={20} />,
  quickstart: <Rocket size={20} />,
  events: <Zap size={20} />,
  channels: <Mail size={20} />,
  templates: <Code2 size={20} />,
  delivery: <Send size={20} />,
  "api-reference": <Server size={20} />,
  architecture: <Layers size={20} />,
  "self-hosting": <Server size={20} />,
};

export default function DocsIndexPage() {
  const groups = getDocsByGroup();

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-12 lg:px-10">
      <div className="mb-12">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--gray-4)] bg-[var(--gray-2)] px-3 py-1 text-[12px] font-medium text-[var(--gray-9)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
          Documentation
        </div>
        <h1 className="text-[36px] font-semibold tracking-tight text-[var(--foreground)]">
          Beacon Documentation
        </h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-[var(--gray-9)]">
          Everything you need to understand, integrate, and operate the
          event-driven notification platform. From first API call to production deployment.
        </p>
      </div>

      <div className="space-y-10">
        {groups.map((group) => (
          <div key={group.label}>
            <h2 className="mb-4 text-[14px] font-semibold uppercase tracking-wide text-[var(--gray-7)]">
              {group.label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((doc) => (
                <Link
                  key={doc.slug}
                  href={`/docs/${doc.slug}`}
                  className="group rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-6 transition-all hover:border-[var(--gray-4)] hover:shadow-sm"
                >
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] text-[var(--primary)]">
                    {ICONS[doc.slug]}
                  </span>
                  <h3 className="text-[15px] font-semibold text-[var(--foreground)]">
                    {doc.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--gray-9)]">
                    {doc.description}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">
                    Read more <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
