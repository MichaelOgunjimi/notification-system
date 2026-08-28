import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import {
  DOC_SLUGS,
  getDocContent,
  getDocNeighbors,
  DOC_DEFINITIONS,
} from "@/lib/docs";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { TableOfContents } from "@/components/table-of-contents";

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOC_DEFINITIONS.find((entry) => entry.slug === slug);
  if (!doc) {
    return { title: "Not Found — Beaco Docs" };
  }

  return {
    title: `${doc.title} — Beaco Docs`,
    description: doc.description,
  };
}

export default async function DocSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!DOC_SLUGS.includes(slug as (typeof DOC_SLUGS)[number])) {
    notFound();
  }

  const { content, headings } = getDocContent(slug);
  const { previous, next } = getDocNeighbors(slug);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 py-10 sm:px-8 sm:py-14 xl:px-12 xl:py-16">
      <div className="docs-content-grid">
        <article className="min-w-0 rounded-xl border border-white/[0.075] bg-[#0a0a09]/88 px-5 py-8 shadow-[inset_0_1px_rgba(255,255,255,0.02)] sm:px-9 sm:py-11 lg:px-12">
          <MarkdownRenderer content={content} />

          <nav className="mt-16 grid border-t border-white/[0.075] sm:grid-cols-2">
            {previous ? (
              <Link
                href={previous.href}
                className="group border-b border-white/[0.075] py-6 transition-colors hover:bg-white/[0.02] sm:border-b-0 sm:border-r sm:pr-6"
              >
                <p className="mb-2 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.15em] text-[#66655e]">
                  <ArrowLeft size={14} />
                  Previous
                </p>
                <p className="text-[13px] text-[#cfcdc4] transition-colors group-hover:text-[var(--docs-accent)]">{previous.title}</p>
              </Link>
            ) : (
              <div />
            )}

            {next ? (
              <Link
                href={next.href}
                className="group py-6 text-right transition-colors hover:bg-white/[0.02] sm:pl-6"
              >
                <p className="mb-2 flex items-center justify-end gap-1.5 text-[9px] uppercase tracking-[0.15em] text-[#66655e]">
                  Next
                  <ArrowRight size={14} />
                </p>
                <p className="text-[13px] text-[#cfcdc4] transition-colors group-hover:text-[var(--docs-accent)]">{next.title}</p>
              </Link>
            ) : (
              <div />
            )}
          </nav>
        </article>

        <aside className="docs-toc-aside">
          <TableOfContents headings={headings} />
        </aside>
      </div>
    </div>
  );
}
