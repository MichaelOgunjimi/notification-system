"use client";

import Image from "next/image";
import Link from "next/link";
import { List, MagnifyingGlass, X } from "@phosphor-icons/react";
import { createContext, useContext, useEffect, useState } from "react";
import { DocsSearch } from "@/components/docs-search";
import { DocsSidebar } from "@/components/docs-sidebar";
import type { DocSearchItem } from "@/lib/docs";
import { WEB_URL } from "@/lib/urls";

const DocsSearchContext = createContext<(() => void) | null>(null);

function DocsBrand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/brand/beaco-mark-128.png" alt="" width={24} height={24} priority />
      <span className="text-[14px] font-semibold tracking-[-0.025em]">Beaco</span>
    </span>
  );
}

export function DocsSearchButton({
  large = false,
  className = "",
}: {
  large?: boolean;
  className?: string;
}) {
  const openSearch = useContext(DocsSearchContext);
  if (!openSearch) return null;

  return (
    <button
      type="button"
      onClick={openSearch}
      className={`docs-search-trigger group flex items-center text-left ${large ? "h-[66px] w-full px-5" : "h-10 w-full px-3.5"} ${className}`}
    >
      <MagnifyingGlass size={large ? 20 : 17} className="shrink-0 text-[var(--docs-accent)]" aria-hidden />
      <span className={`${large ? "ml-4 text-[15px]" : "ml-3 text-[13px]"} flex-1 text-[var(--docs-muted)]`}>
        Search documentation
      </span>
      <kbd className="rounded border border-white/10 bg-white/[0.035] px-2 py-1 text-[9px] tracking-wide text-[#77766f]">
        ⌘ K
      </kbd>
    </button>
  );
}

export function DocsShell({
  children,
  searchItems,
}: {
  children: React.ReactNode;
  searchItems: DocSearchItem[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === "/" && !isTyping) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <DocsSearchContext.Provider value={() => setSearchOpen(true)}>
      <div className="docs-shell min-h-dvh bg-[var(--docs-canvas)] text-[var(--docs-ink)]">
        <header className="docs-topbar fixed inset-x-0 top-0 z-40 h-16 border-b border-white/[0.075]">
          <div className="mx-auto grid h-full max-w-[1440px] grid-cols-[1fr_auto] items-center gap-4 px-4 lg:grid-cols-[auto_minmax(280px,620px)_1fr] lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Open documentation navigation"
                onClick={() => setDrawerOpen(true)}
                className="grid size-9 place-items-center rounded-md border border-white/8 text-[#aaa89f] lg:hidden"
              >
                <List size={19} />
              </button>
              <Link href={WEB_URL} className="shrink-0" aria-label="Beaco home">
                <DocsBrand />
              </Link>
              <span className="h-4 w-px bg-white/12" />
              <Link href="/" className="text-[11px] uppercase tracking-[0.15em] text-[var(--docs-muted)]">
                Docs
              </Link>
            </div>

            <DocsSearchButton className="hidden max-w-[620px] lg:flex" />

            <nav aria-label="Docs utility navigation" className="flex items-center justify-end gap-5">
              <button
                type="button"
                aria-label="Search documentation"
                onClick={() => setSearchOpen(true)}
                className="grid size-9 place-items-center rounded-md border border-white/8 text-[#aaa89f] lg:hidden"
              >
                <MagnifyingGlass size={18} />
              </button>
              <Link href={WEB_URL} className="hidden text-[12px] text-[var(--docs-muted)] transition-colors hover:text-[var(--docs-ink)] sm:block">
                Product
              </Link>
              <Link href={`${WEB_URL}/login`} className="hidden text-[12px] text-[var(--docs-muted)] transition-colors hover:text-[var(--docs-ink)] sm:block">
                Sign in
              </Link>
              <Link href="/quickstart" className="hidden rounded-md bg-[var(--docs-accent)] px-3.5 py-2 text-[11px] font-semibold text-[#1c160b] transition-colors hover:bg-[#f5bd50] md:block">
                Quickstart
              </Link>
            </nav>
          </div>
        </header>

        {drawerOpen ? (
          <button
            type="button"
            aria-label="Close documentation navigation"
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed bottom-0 left-0 top-0 z-50 w-[284px] border-r border-white/[0.075] bg-[#090908] pt-16 transition-transform duration-200 lg:hidden ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            aria-label="Close documentation navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute right-4 top-[18px] grid size-7 place-items-center rounded-md text-[var(--docs-muted)]"
          >
            <X size={18} />
          </button>
          <DocsSidebar onNavigate={() => setDrawerOpen(false)} />
        </aside>

        <main id="main-content" className="docs-reading-field min-h-dvh pt-16">{children}</main>

        <DocsSearch items={searchItems} open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </DocsSearchContext.Provider>
  );
}
