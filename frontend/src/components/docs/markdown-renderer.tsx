import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";

const components: Partial<Components> = {
  h1: ({ children, ...props }) => (
    <h1
      className="mb-6 border-b border-[var(--gray-3)] pb-4 text-[34px] font-bold tracking-tight text-[var(--foreground)]"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="mt-14 mb-5 scroll-mt-28 border-b border-[var(--gray-3)] pb-3 text-[22px] font-semibold tracking-tight text-[var(--foreground)]"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="mt-8 mb-3 scroll-mt-28 text-[16px] font-medium text-[var(--gray-10)]"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p
      className="mb-4 text-[15px] leading-[1.85] text-[var(--gray-9)]"
      {...props}
    >
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-[var(--primary)] hover:underline"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="mb-4 ml-6 list-disc space-y-2.5 text-[15px] leading-[1.8] text-[var(--gray-9)]"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="mb-4 ml-6 list-decimal space-y-2.5 text-[15px] leading-[1.8] text-[var(--gray-9)]"
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
      className="my-5 rounded-lg border-l-2 border-[var(--primary)] bg-[var(--gray-2)] px-5 py-4 text-[15px] leading-[1.8] text-[var(--gray-9)]"
      {...props}
    >
      {children}
    </blockquote>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-[var(--foreground)]" {...props}>
      {children}
    </strong>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} text-[13px]`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded border border-[var(--gray-4)] bg-[var(--gray-3)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--primary)]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="my-5 overflow-x-auto rounded-xl border border-[var(--gray-3)] bg-[#0d0f12] p-4 font-mono text-[13px]"
      {...props}
    >
      {children}
    </pre>
  ),
  table: ({ children, ...props }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-[var(--gray-3)]">
      <table
        className="min-w-full border-collapse text-[14px] text-[var(--gray-9)]"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="border-b-2 border-[var(--gray-3)] bg-[var(--gray-2)]" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border-b-2 border-[var(--gray-3)] px-4 py-3 text-left text-[13px] font-semibold text-[var(--foreground)]"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="border-b border-[var(--gray-3)] px-4 py-3"
      {...props}
    >
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="odd:bg-[var(--gray-1)] even:bg-[var(--gray-2)]" {...props}>
      {children}
    </tr>
  ),
  hr: (props) => <hr className="my-8 border-[var(--gray-3)]" {...props} />,
  img: ({ src, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className="my-4 max-w-full rounded-xl border border-[var(--gray-3)]"
      loading="lazy"
      {...props}
    />
  ),
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug, rehypeRaw]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
