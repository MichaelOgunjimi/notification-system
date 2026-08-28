import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  BracketsCurly,
  Database,
  EnvelopeSimple,
  Lightning,
  PaperPlaneTilt,
  PlugsConnected,
  RocketLaunch,
  TreeStructure,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocsSearchButton } from "@/components/docs-shell";
import { getDocsByGroup, type DocSlug } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation — Beaco",
  description: "Learn how to integrate and operate Beaco as a hosted notification platform.",
};

const icons: Record<DocSlug, ReactNode> = {
  introduction: <BookOpenText size={18} />,
  quickstart: <RocketLaunch size={18} />,
  events: <Lightning size={18} />,
  channels: <EnvelopeSimple size={18} />,
  templates: <BracketsCurly size={18} />,
  delivery: <PaperPlaneTilt size={18} />,
  "api-reference": <Database size={18} />,
  architecture: <TreeStructure size={18} />,
  webhooks: <PlugsConnected size={18} />,
};

const popular: DocSlug[] = ["quickstart", "events", "delivery", "api-reference"];

export default function DocsIndexPage() {
  const groups = getDocsByGroup();
  const allDocs = groups.flatMap((group) => group.items);

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-10 sm:px-7 sm:py-14 xl:px-12 xl:py-16">
      <header className="grid gap-8 border-b border-white/[0.075] pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] lg:items-end lg:gap-16 lg:pb-14">
        <div>
          <p className="mb-5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--docs-accent)]">
            <span className="h-px w-7 bg-[var(--docs-accent)]" />
            Beaco documentation
          </p>
          <h1 className="max-w-[720px] text-[clamp(2.4rem,6vw,5.15rem)] font-medium leading-[0.94] tracking-[-0.06em] text-balance">
            Build delivery systems that stay understandable.
          </h1>
          <p className="mt-6 max-w-[650px] text-[15px] leading-7 text-[var(--docs-muted)] sm:text-[16px]">
            Start with one event, then follow it through channels, templates, retries, and the delivery history Beaco keeps around it.
          </p>
        </div>

        <div>
          <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[#696860]">Find an answer</p>
          <DocsSearchButton large />
          <p className="mt-3 text-[10px] text-[#696860]">Search article titles, descriptions, and complete guide content.</p>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="border-white/[0.075] py-10 lg:border-r lg:pr-10 xl:pr-14">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#696860]">Browse the system</p>
              <h2 className="mt-2 text-[24px] font-medium tracking-[-0.035em]">Documentation collections</h2>
            </div>
            <span className="hidden font-mono text-[10px] text-[#5f5e57] sm:block">09 ARTICLES</span>
          </div>

          <div className="border-t border-white/[0.075]">
            {groups.map((group, groupIndex) => (
              <section
                key={group.label}
                className="grid border-b border-white/[0.075] md:grid-cols-[180px_minmax(0,1fr)]"
              >
                <div className="border-b border-white/[0.075] py-6 md:border-b-0 md:border-r md:pr-6">
                  <span className="font-mono text-[10px] text-[var(--docs-accent)]">0{groupIndex + 1}</span>
                  <h3 className="mt-3 text-[13px] font-medium text-[#cfcdc4]">{group.label}</h3>
                </div>
                <div className="grid sm:grid-cols-2">
                  {group.items.map((doc, index) => (
                    <Link
                      key={doc.slug}
                      href={`/${doc.slug}`}
                      className={`group min-h-[138px] p-5 transition-colors hover:bg-white/[0.028] sm:p-6 ${
                        index % 2 === 0 ? "sm:border-r sm:border-white/[0.075]" : ""
                      } ${index < group.items.length - 2 ? "border-b border-white/[0.075]" : ""}`}
                    >
                      <span className="flex items-start justify-between gap-4">
                        <span className="grid size-8 place-items-center rounded-md border border-white/8 bg-white/[0.025] text-[var(--docs-accent)]">
                          {icons[doc.slug]}
                        </span>
                        <ArrowRight size={14} className="text-[#52514b] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--docs-accent)]" />
                      </span>
                      <span className="mt-4 block text-[13px] font-medium text-[var(--docs-ink)]">{doc.title}</span>
                      <span className="mt-1.5 block text-[11px] leading-5 text-[var(--docs-muted)]">{doc.description}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="py-10 lg:pl-8 xl:pl-10">
          <div className="sticky top-24">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#696860]">Popular now</p>
            <ol className="mt-5 border-t border-white/[0.075]">
              {popular.map((slug, index) => {
                const doc = allDocs.find((item) => item.slug === slug);
                if (!doc) return null;
                return (
                  <li key={slug} className="border-b border-white/[0.075]">
                    <Link href={`/${slug}`} className="group grid grid-cols-[24px_minmax(0,1fr)] gap-3 py-4">
                      <span className="font-mono text-[9px] text-[#5f5e57]">0{index + 1}</span>
                      <span>
                        <span className="block text-[12px] text-[#cfcdc4] transition-colors group-hover:text-[var(--docs-accent)]">{doc.title}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-[#716f68]">{doc.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 rounded-lg border border-[color-mix(in_srgb,var(--docs-accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--docs-accent)_5%,transparent)] p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--docs-accent)]">Best first step</p>
              <p className="mt-3 text-[15px] font-medium tracking-[-0.02em]">Send one real event.</p>
              <p className="mt-2 text-[11px] leading-5 text-[var(--docs-muted)]">The quickstart gives you the shortest path from API key to a traceable delivery.</p>
              <Link href="/quickstart" className="mt-4 inline-flex items-center gap-2 text-[11px] font-medium text-[var(--docs-accent)]">
                Open quickstart <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
