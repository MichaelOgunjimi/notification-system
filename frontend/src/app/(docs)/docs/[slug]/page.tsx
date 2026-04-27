import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import {
  DOC_SLUGS,
  getDocContent,
  getDocNeighbors,
  DOC_DEFINITIONS,
} from "@/lib/docs";
import { MarkdownRenderer } from "@/components/docs/markdown-renderer";
import { TableOfContents } from "@/components/docs/table-of-contents";

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
    <div className="mx-auto w-full max-w-[1280px] px-6 py-10 lg:px-10">
      <div className="docs-content-grid">
        <article className="min-w-0">
          <MarkdownRenderer content={content} />

          <nav className="mt-14 grid gap-4 border-t border-[var(--gray-3)] pt-8 sm:grid-cols-2">
            {previous ? (
              <Link
                href={previous.href}
                className="rounded-lg border border-[var(--gray-3)] p-4 transition-colors hover:bg-[var(--gray-2)]"
              >
                <p className="mb-1 flex items-center gap-1 text-[12px] text-[var(--gray-7)]">
                  <ArrowLeft size={14} />
                  Previous
                </p>
                <p className="text-[14px] text-[var(--foreground)]">{previous.title}</p>
              </Link>
            ) : (
              <div />
            )}

            {next ? (
              <Link
                href={next.href}
                className="rounded-lg border border-[var(--gray-3)] p-4 text-right transition-colors hover:bg-[var(--gray-2)]"
              >
                <p className="mb-1 flex items-center justify-end gap-1 text-[12px] text-[var(--gray-7)]">
                  Next
                  <ArrowRight size={14} />
                </p>
                <p className="text-[14px] text-[var(--foreground)]">{next.title}</p>
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
