"use client";

import Link from "next/link";
import { Bell, ChevronRight, Menu, Search } from "lucide-react";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface TopbarProps {
  onOpenMobileNav?: () => void;
  breadcrumbs?: Breadcrumb[];
}

export function Topbar({ onOpenMobileNav, breadcrumbs }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-[var(--gray-3)] bg-[var(--gray-1)] px-4 sm:px-5">
      {/* Mobile hamburger */}
      <button
        type="button"
        className="inline-flex h-7 w-7 touch-manipulation items-center justify-center rounded-lg text-[var(--gray-6)] transition hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/70 lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Desktop: breadcrumbs OR search */}
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-1.5">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[var(--gray-4)]" />}
              {crumb.href ? (
                <Link href={crumb.href} className="text-[12px] text-[var(--gray-6)] hover:text-[var(--gray-9)] transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-[12px] font-medium text-[var(--gray-9)]">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : (
        <button
          type="button"
          aria-label="Search"
          className="hidden lg:flex items-center gap-2 h-7 w-48 rounded-md border border-[var(--gray-3)] bg-[var(--gray-2)] px-2.5 text-left text-[12px] text-[var(--gray-5)] hover:border-[var(--gray-4)] hover:bg-[var(--gray-3)] transition-colors focus-visible:outline-none"
        >
          <Search className="h-3 w-3 shrink-0" />
          <span className="flex-1">Search…</span>
          <kbd className="inline-flex items-center rounded border border-[var(--gray-3)] px-1 py-px text-[10px] text-[var(--gray-5)]">⌘K</kbd>
        </button>
      )}

      {/* Right: status + bell */}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-[color:rgba(34,197,94,0.2)] bg-[color:rgba(34,197,94,0.07)] px-2.5 py-1 text-[11px] font-medium text-[var(--status-delivered)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-delivered)] shadow-[0_0_5px_currentColor]" />
          Operational
        </div>

        <button
          type="button"
          className="inline-flex h-7 w-7 touch-manipulation items-center justify-center rounded-lg text-[var(--gray-6)] transition hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/70"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
