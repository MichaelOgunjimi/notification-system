"use client";

import Link from "next/link";
import { AuthProvider, useSession } from "@beaco/auth/react";
import { ThemeToggle } from "@beaco/theme";
import ArrowButton from "./arrow-button";
import MobileNav from "./mobile-nav";
import { docsUrl } from "@/lib/urls";

type SiteNavActionsProps = Readonly<{ links: Array<{ label: string; href: string }> }>;

function NavActions({ links }: SiteNavActionsProps) {
  const { isAuthenticated, status } = useSession();
  const authed = status === "authenticated" && isAuthenticated;

  return (
    <>
      <div className="ml-auto hidden items-center gap-2 md:flex">
        <ThemeToggle />
        {authed ? (
          <Link
            href="/workspace"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
          >
            <ArrowButton label="Open dashboard" />
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-[9px] px-3 py-2 text-[12px] font-medium text-[var(--site-muted)] transition-colors duration-300 hover:text-[var(--site-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
            >
              Sign in
            </Link>
            <Link
              href={docsUrl("/quickstart")}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"
            >
              <ArrowButton label="Start building" />
            </Link>
          </>
        )}
      </div>

      <div className="ml-auto md:hidden">
        <MobileNav links={links} authed={authed} />
      </div>
    </>
  );
}

/** Marketing nav's auth-dependent actions, self-contained so the page around it stays a server component. */
export default function SiteNavActions(props: SiteNavActionsProps) {
  return (
    <AuthProvider>
      <NavActions {...props} />
    </AuthProvider>
  );
}
