"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NavItem } from "./nav-item";
import { useAuth } from "@/hooks/use-auth";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Crown,
  FileText,
  Key,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Radio,
  RotateCcw,
  ScrollText,
  Server,
  ShieldOff,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

const monitorItems = [
  { href: "/dashboard", icon: <LayoutDashboard size={16} />, label: "Dashboard" },
  { href: "/events", icon: <Zap size={16} />, label: "Events" },
  { href: "/notifications", icon: <Bell size={16} />, label: "Notifications" },
  { href: "/dlq", icon: <AlertTriangle size={16} />, label: "Dead Letter Queue" },
  { href: "/templates", icon: <FileText size={16} />, label: "Templates" },
];

const observabilityItems = [
  { href: "/usage", icon: <TrendingUp size={16} />, label: "Usage" },
  { href: "/alerts", icon: <Activity size={16} />, label: "Alerts" },
  { href: "/suppressions", icon: <ShieldOff size={16} />, label: "Suppressions" },
  { href: "/audit-log", icon: <ScrollText size={16} />, label: "Audit Log" },
];

const settingsItems = [
  { href: "/settings/channels", icon: <Radio size={16} />, label: "Channel Config" },
  { href: "/settings/retry-policies", icon: <RotateCcw size={16} />, label: "Retry Policies" },
  { href: "/settings/api-keys", icon: <Key size={16} />, label: "API Keys" },
];

const adminItems = [
  { href: "/admin/keys", icon: <Crown size={16} />, label: "Keys Overview" },
  { href: "/admin/health", icon: <Server size={16} />, label: "System Health" },
  { href: "/admin/analytics", icon: <BarChart3 size={16} />, label: "Analytics" },
];

interface SidebarInnerProps {
  collapsed?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
}

function SidebarInner({ collapsed = false, onClose, onToggleCollapse }: SidebarInnerProps) {
  const router = useRouter();
  const { keyPrefix, keyName, isMaster, logout } = useAuth();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const sections = [
    { label: "Monitor", items: monitorItems },
    { label: "Observe", items: observabilityItems },
    { label: "Settings", items: settingsItems },
    ...(isMaster ? [{ label: "Admin", items: adminItems }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* ── Header / Brand ── */}
      <div
        className={cn(
          "group/header relative flex h-16 shrink-0 items-center border-b border-[var(--gray-3)]",
          collapsed ? "justify-center" : "gap-3 px-5",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            className="group/logo relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#f59e0b,#fbbf24)] shadow-[0_2px_10px_rgba(245,158,11,0.35)] transition-shadow hover:shadow-[0_4px_16px_rgba(245,158,11,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/70"
          >
            <span className="text-[13px] font-bold text-black transition-opacity duration-100 group-hover/logo:opacity-0">
              B
            </span>
            <ChevronRight className="absolute h-3.5 w-3.5 text-black opacity-0 transition-opacity duration-100 group-hover/logo:opacity-100" />
          </button>
        ) : (
          <>
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#f59e0b,#fbbf24)] shadow-[0_2px_10px_rgba(245,158,11,0.3)]">
              <span className="text-[13px] font-bold text-black">B</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-none text-[var(--gray-10)]">Beacon</p>
              <p className="mt-1 text-[11px] leading-none text-[var(--gray-5)]">Notification Ops</p>
            </div>

            {/* Desktop collapse — appears on header hover */}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--gray-9)] opacity-50 transition hover:bg-[var(--gray-3)] hover:opacity-100 hover:text-[var(--gray-10)] group-hover/header:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/70 lg:flex"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {/* Mobile close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--gray-6)] transition hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)] focus-visible:outline-none lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        {sections.map((section, i) => (
          <div key={section.label} className={cn(i > 0 && "mt-5")}>
            {!collapsed ? (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-5)]">
                {section.label}
              </p>
            ) : (
              i > 0 && <div className="mb-3 mx-auto h-px w-8 bg-[var(--gray-3)]" />
            )}
            <div className={cn("space-y-0.5", collapsed && "flex flex-col items-center")}>
              {section.items.map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  collapsed={collapsed}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer / Auth ── */}
      <div className={cn("border-t border-[var(--gray-3)] p-3", collapsed && "flex justify-center")}>
        {collapsed ? (
          /* Collapsed: just the key icon with crown overlay */
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--gray-3)] text-[var(--gray-6)]">
            <KeyRound className="h-3.5 w-3.5" />
            {isMaster && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--primary)]">
                <Crown className="h-2 w-2 text-black" />
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            {/* Key avatar */}
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--gray-3)] text-[var(--gray-6)]">
              <KeyRound className="h-3.5 w-3.5" />
              {isMaster && (
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--primary)]">
                  <Crown className="h-2 w-2 text-black" />
                </span>
              )}
            </div>

            {/* Key info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-none text-[var(--gray-9)]">
                {keyName || (isMaster ? "Master" : "Project key")}
              </p>
              <p className="mt-1 font-mono text-[11px] leading-none text-[var(--gray-5)]">
                {keyPrefix}
              </p>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--gray-5)] transition hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)]"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  collapsed = false,
  mobileOpen = false,
  onClose,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 self-start border-r border-[var(--gray-3)] bg-[var(--gray-1)] transition-[width] duration-200 ease-in-out lg:flex lg:flex-col",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <SidebarInner collapsed={collapsed} onClose={onClose} onToggleCollapse={onToggleCollapse} />
      </aside>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile drawer — always renders expanded regardless of desktop collapsed state */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] border-r border-[var(--gray-3)] bg-[var(--gray-1)] transition-transform duration-200 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarInner collapsed={false} onClose={onClose} onToggleCollapse={onToggleCollapse} />
      </aside>
    </>
  );
}
