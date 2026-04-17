"use client";

import { List } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export function TableOfContents({ headings }: { headings: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });
  const observerRef = useRef<IntersectionObserver | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  useEffect(() => {
    if (headings.length === 0) {
      return;
    }

    const callback: IntersectionObserverCallback = (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible.length > 0) {
        setActiveId(visible[0].target.id);
      }
    };

    observerRef.current = new IntersectionObserver(callback, {
      rootMargin: "-80px 0px -60% 0px",
      threshold: 0,
    });

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    elements.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [headings]);

  useEffect(() => {
    const activeEl = linkRefs.current[activeId];
    if (!activeEl) {
      return;
    }

    setIndicator({
      top: activeEl.offsetTop,
      height: activeEl.offsetHeight,
    });
  }, [activeId, headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Table of contents" className="sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto">
      <p className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[var(--gray-9)]">
        <List size={14} className="text-[var(--gray-7)]" />
        On this page
      </p>

      <div className="relative pl-4">
        <div className="absolute left-0 top-0 h-full w-px bg-[var(--gray-3)]" />
        <div
          className="absolute left-0 w-[2px] rounded-full bg-[var(--primary)] transition-all duration-200"
          style={{
            top: `${indicator.top}px`,
            height: `${indicator.height}px`,
          }}
        />

        <ul className="space-y-1">
          {headings.map((heading) => (
            <li key={heading.id}>
              <a
                ref={(node) => {
                  linkRefs.current[heading.id] = node;
                }}
                href={`#${heading.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  const target = document.getElementById(heading.id);
                  if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                    setActiveId(heading.id);
                  }
                }}
                className={`block rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                  heading.level === 3 ? "ml-3" : ""
                } ${
                  activeId === heading.id
                    ? "text-[var(--primary)]"
                    : "text-[var(--gray-7)] hover:text-[var(--foreground)]"
                }`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
