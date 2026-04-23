"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, BookOpen } from "lucide-react";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

export default function DocsShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--gray-3)] bg-[var(--background)] px-4 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-1.5 text-[var(--gray-9)] hover:bg-[var(--gray-2)]"
        >
          <Menu size={20} />
        </button>
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen size={18} className="text-[var(--primary)]" />
          <span>Beacon</span>
        </Link>
        <span className="text-sm font-semibold text-[var(--gray-9)]">Beacon Docs</span>
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] overflow-y-auto border-r border-[var(--gray-3)] bg-[var(--gray-1)] transition-transform duration-200 lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--gray-3)] px-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen size={18} className="text-[var(--primary)]" />
            Beacon Docs
          </span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="rounded-md p-1 text-[var(--gray-9)] hover:bg-[var(--gray-2)]"
          >
            <X size={18} />
          </button>
        </div>
        <DocsSidebar onNavigate={() => setDrawerOpen(false)} />
      </aside>

      <div className="mx-auto grid min-h-dvh w-full lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="relative hidden h-dvh overflow-y-auto border-r border-[var(--gray-3)] bg-[var(--gray-1)] lg:sticky lg:top-0 lg:block">
          <DocsSidebar />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-px bg-gradient-to-b from-[var(--gray-3)] to-transparent" />
        </aside>
        <div className="min-w-0 pt-14 lg:pt-0">{children}</div>
      </div>
    </div>
  );
}
