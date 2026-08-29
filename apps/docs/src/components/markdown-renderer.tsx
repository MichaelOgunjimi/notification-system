import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Components } from "react-markdown";
import { CodeBlock } from "./code-block";

const components: Partial<Components> = {
  h1: ({ children, ...props }) => (
    <h1
      className="mb-7 text-[clamp(2.25rem,6vw,4.25rem)] font-medium leading-[0.96] tracking-[-0.055em] text-[var(--docs-ink)]"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="mb-5 mt-14 scroll-mt-28 border-t border-white/[0.075] pt-10 text-[24px] font-medium tracking-[-0.035em] text-[var(--docs-ink)]"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="mb-3 mt-8 scroll-mt-28 text-[16px] font-medium tracking-[-0.015em] text-[#d7d5cc]"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p
      className="mb-5 text-[15px] leading-[1.85] text-[var(--docs-muted)]"
      {...props}
    >
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-[var(--docs-accent)] underline decoration-[color-mix(in_srgb,var(--docs-accent)_35%,transparent)] underline-offset-4 transition-colors hover:decoration-[var(--docs-accent)]"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="mb-5 ml-5 list-disc space-y-2.5 text-[15px] leading-[1.8] text-[var(--docs-muted)] marker:text-[var(--docs-accent)]"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="mb-5 ml-5 list-decimal space-y-2.5 text-[15px] leading-[1.8] text-[var(--docs-muted)] marker:text-[var(--docs-accent)]"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="pl-1" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-7 rounded-r-lg border-l-2 border-[var(--docs-accent)] bg-[color-mix(in_srgb,var(--docs-accent)_5%,transparent)] px-5 py-4 text-[14px] leading-[1.8] text-[#aaa89f]"
      {...props}
    >
      {children}
    </blockquote>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-[var(--docs-ink)]" {...props}>
      {children}
    </strong>
  ),
  code: ({ children, className, ...props }) => {
    const match = className?.match(/language-(\w+)/);
    if (match) {
      const code = String(children).replace(/\n$/, "");
      return <CodeBlock language={match[1]}>{code}</CodeBlock>;
    }
    return (
      <code
        className="rounded border border-white/10 bg-white/[0.045] px-1.5 py-0.5 font-mono text-[13px] text-[var(--docs-accent)]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children, ...props }) => (
    <div className="my-7 overflow-x-auto rounded-lg border border-white/[0.075]">
      <table
        className="min-w-full border-collapse text-[13px] text-[var(--docs-muted)]"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="border-b border-white/[0.075] bg-white/[0.025]" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border-b border-white/[0.075] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#cfcdc4]"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="border-b border-white/[0.06] px-4 py-3"
      {...props}
    >
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="odd:bg-transparent even:bg-white/[0.018]" {...props}>
      {children}
    </tr>
  ),
  hr: (props) => <hr className="my-10 border-white/[0.075]" {...props} />,
  img: ({ src, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className="my-6 max-w-full rounded-xl border border-white/[0.075]"
      loading="lazy"
      {...props}
    />
  ),
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
