"use client";

import Link from "next/link";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { ThemeToggle } from "@beaco/theme";
import { useState } from "react";
import { docsUrl } from "@/lib/urls";

type MobileNavProps = {
  links: Array<{ label: string; href: string }>;
};

export default function MobileNav({ links }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-2 md:hidden">
      <ThemeToggle />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex size-10 items-center justify-center rounded-[9px] border border-[var(--site-line-strong)] bg-[var(--site-overlay)] text-[var(--site-ink)] transition hover:bg-[var(--site-overlay-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
      >
        {open ? <X size={16} weight="light" /> : <List size={17} weight="light" />}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-56 rounded-[14px] border border-[var(--site-line-strong)] bg-[var(--site-panel)]/95 p-2 shadow-[0_24px_70px_var(--site-shadow)] backdrop-blur-xl">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-[9px] px-3 py-2.5 text-sm text-[var(--site-muted)] transition hover:bg-[var(--site-soft)] hover:text-[var(--site-ink)]"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/MichaelOgunjimi/notification-system"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="rounded-[9px] px-3 py-2.5 text-sm text-[var(--site-muted)] transition hover:bg-[var(--site-soft)] hover:text-[var(--site-ink)]"
            >
              GitHub
            </a>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-[9px] px-3 py-2.5 text-sm text-[var(--site-ink)] transition hover:bg-[var(--site-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
            >
              Sign in
            </Link>
            <Link
              href={docsUrl("/quickstart")}
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-[9px] bg-[var(--site-accent)] px-4 text-sm font-semibold text-[var(--site-accent-ink)] transition hover:bg-[var(--site-accent-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)] active:translate-y-px"
            >
              Start building
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
