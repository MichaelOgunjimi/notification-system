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
import { DocsSidebar } from "@/components/docs-sidebar";
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
    <div className="mx-auto w-full max-w-7xl px-5 pb-20 pt-14 sm:px-8 sm:pt-20 xl:px-10">
      <header className="mx-auto max-w-195 text-center">
        <p className="text-[11px] font-medium text-(--docs-accent)">Beaco help centre</p>
        <h1 className="mt-5 font-serif text-[clamp(2.8rem,7vw,5.6rem)] font-normal leading-[0.98] tracking-[-0.045em] text-(--docs-ink) text-balance">
          How can we help?
        </h1>
        <p className="mx-auto mt-5 max-w-147.5 text-[15px] leading-7 text-(--docs-muted)">
          Learn the platform model, send your first event, or trace a delivery from ingestion through retries and final status.
        </p>
        <div className="mx-auto mt-8 max-w-170 text-left">
          <DocsSearchButton large />
        </div>
      </header>

      <div className="mt-16 grid gap-10 border-t border-white/7.5 pt-10 lg:grid-cols-[210px_minmax(0,1fr)_240px] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24 -ml-3">
            <DocsSidebar />
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-7">
            <h2 className="font-serif text-[30px] font-normal tracking-[-0.025em] text-(--docs-ink)">Browse by topic</h2>
            <p className="mt-2 text-[12px] text-(--docs-muted)">Start with the job you need to complete.</p>
          </div>

          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.label} className="rounded-2xl bg-(--docs-panel) p-5 ring-1 ring-white/7.5 sm:p-6">
                <h3 className="text-[13px] font-medium text-[#d7d3c8]">{group.label}</h3>
                <div className="mt-4 grid gap-x-7 sm:grid-cols-2">
                  {group.items.map((doc) => (
                    <Link
                      key={doc.slug}
                      href={`/${doc.slug}`}
                      className="group grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 border-t border-white/6.5 py-4"
                    >
                      <span className="grid size-8 place-items-center rounded-lg bg-white/4.5 text-[#aaa79d] transition-colors group-hover:text-(--docs-accent)">
                        {icons[doc.slug]}
                      </span>
                      <span>
                        <span className="block text-[13px] font-medium text-[#dedacf] transition-colors group-hover:text-(--docs-ink)">{doc.title}</span>
                        <span className="mt-1 block text-[11px] leading-[1.65] text-(--docs-muted)">{doc.description}</span>
                      </span>
                      <ArrowRight size={13} className="mt-2 text-[#5f5f57] transition-all group-hover:translate-x-0.5 group-hover:text-(--docs-accent)" />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>

        <aside>
          <div className="sticky top-24">
            <h2 className="text-[13px] font-medium text-[#d7d3c8]">Popular articles</h2>
            <ol className="mt-4">
              {popular.map((slug, index) => {
                const doc = allDocs.find((item) => item.slug === slug);
                if (!doc) return null;
                return (
                  <li key={slug} className="border-t border-white/7.5">
                    <Link href={`/${slug}`} className="group flex gap-3 py-4">
                      <span className="font-mono text-[9px] leading-5 text-[#64645c]">0{index + 1}</span>
                      <span>
                        <span className="block text-[12px] leading-5 text-[#cac7bd] transition-colors group-hover:text-(--docs-accent)">{doc.title}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-[#7e7d74]">{doc.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 rounded-2xl bg-[#1a1b16] p-5 ring-1 ring-white/6.5">
              <p className="font-serif text-[20px] text-[#ddd8cc]">New to Beaco?</p>
              <p className="mt-2 text-[11px] leading-5 text-(--docs-muted)">Send one event and inspect every delivery created from it.</p>
              <Link href="/quickstart" className="mt-4 inline-flex items-center gap-2 text-[11px] font-medium text-(--docs-accent)">
                Start the quickstart <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
