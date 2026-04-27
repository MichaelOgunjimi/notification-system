"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { isAuthenticated } from "@/lib/auth";

const pageMeta: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Monitor throughput, failures, and delivery health in real time.",
  },
  "/events": {
    title: "Events",
    description: "Inspect incoming events and trace how they fan out across channels.",
  },
  "/notifications": {
    title: "Notifications",
    description: "Track delivery status, retries, and provider responses.",
  },
  "/dlq": {
    title: "Dead Letter Queue",
    description: "Review exhausted notifications and recover failed deliveries.",
  },
  "/templates": {
    title: "Templates",
    description: "Manage reusable channel templates and preview message content.",
  },
  "/usage": {
    title: "Usage",
    description: "Analyse API call volume, endpoint breakdown, and rate-limit headroom.",
  },
  "/alerts": {
    title: "Alerts",
    description: "Configure delivery-failure and latency alert rules.",
  },
  "/suppressions": {
    title: "Suppressions",
    description: "Manage blocked recipients and opt-out lists.",
  },
  "/audit-log": {
    title: "Audit Log",
    description: "Chronological record of all API key actions and system events.",
  },
  "/settings/api-keys": {
    title: "API Keys",
    description: "Create, revoke, and audit project credentials.",
  },
  "/settings/channels": {
    title: "Channel Config",
    description: "Manage delivery channel settings and provider configuration.",
  },
  "/settings/retry-policies": {
    title: "Retry Policies",
    description: "Configure per-channel exponential backoff and retry behaviour.",
  },
  "/admin/keys": {
    title: "Keys Overview",
    description: "Inspect all project API keys across the system.",
  },
  "/admin/health": {
    title: "System Health",
    description: "Monitor worker queues, Redis, database, and service uptime.",
  },
  "/admin/analytics": {
    title: "Analytics",
    description: "Cross-key delivery analytics and system-wide performance metrics.",
  },
};

// Detail page route patterns
const detailRoutePattern = /^\/(events|notifications|templates)\/[^/]+$/;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth guard — run once on mount, before rendering anything
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  useEffect(() => {
    const saved = window.localStorage.getItem("beaco-sidebar-collapsed");
    if (saved === "true") setIsSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem("beaco-sidebar-collapsed", String(next));
      return next;
    });
  };

  const isDetailPage = detailRoutePattern.test(pathname);

  const meta = useMemo(() => {
    const match = Object.entries(pageMeta)
      .sort(([a], [b]) => b.length - a.length)
      .find(([key]) => pathname === key || pathname.startsWith(`${key}/`));
    return (
      match?.[1] ?? {
        title: "Beaco",
        description: "Internal operations dashboard for your notification platform.",
      }
    );
  }, [pathname]);

  // Build breadcrumbs for detail pages
  const breadcrumbs = useMemo(() => {
    if (!isDetailPage) return undefined;

    const eventMatch = pathname.match(/^\/events\/(.+)$/);
    const notifMatch = pathname.match(/^\/notifications\/(.+)$/);
    const templateMatch = pathname.match(/^\/templates\/(.+)$/);

    if (eventMatch) {
      const id = eventMatch[1];
      return [
        { label: "Events", href: "/events" },
        { label: id.length > 22 ? id.slice(0, 22) + "…" : id },
      ];
    }
    if (notifMatch) {
      const id = notifMatch[1];
      return [
        { label: "Notifications", href: "/notifications" },
        { label: id.length > 22 ? id.slice(0, 22) + "…" : id },
      ];
    }
    if (templateMatch) {
      const id = templateMatch[1];
      return [
        { label: "Templates", href: "/templates" },
        { label: id.length > 22 ? id.slice(0, 22) + "…" : id },
      ];
    }

    return undefined;
  }, [pathname, isDetailPage]);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        onToggleCollapse={toggleSidebar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          breadcrumbs={breadcrumbs}
        />

        <main id="main-content" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
            {!isDetailPage && (
              <div className="mb-7">
                <h1 className="text-[18px] font-semibold tracking-tight text-[var(--gray-10)]">
                  {meta.title}
                </h1>
                <p className="mt-1 text-sm text-[var(--gray-6)]">{meta.description}</p>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
