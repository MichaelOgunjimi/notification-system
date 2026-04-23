"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CornerDownLeft,
  FileText,
  Hash,
  Key,
  LayoutDashboard,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldOff,
  type LucideIcon,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PageItem {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  group: "monitor" | "observe" | "settings";
}

const PAGE_ITEMS: PageItem[] = [
  { label: "Dashboard", description: "Overview & health", href: "/dashboard", icon: LayoutDashboard, group: "monitor" },
  { label: "Events", description: "Inbound event stream", href: "/events", icon: Zap, group: "monitor" },
  { label: "Notifications", description: "Delivery log", href: "/notifications", icon: Bell, group: "monitor" },
  { label: "Dead Letter Queue", description: "Failed deliveries", href: "/dlq", icon: AlertTriangle, group: "monitor" },
  { label: "Templates", description: "Notification templates", href: "/templates", icon: FileText, group: "monitor" },
  { label: "Usage", description: "API usage & trends", href: "/usage", icon: BarChart3, group: "observe" },
  { label: "Alerts", description: "Alert rules", href: "/alerts", icon: AlertCircle, group: "observe" },
  { label: "Suppressions", description: "Suppression rules", href: "/suppressions", icon: ShieldOff, group: "observe" },
  { label: "Audit Log", description: "Activity history", href: "/audit-log", icon: ScrollText, group: "observe" },
  { label: "Channel Config", description: "Email, SMS, webhook", href: "/settings/channels", icon: Settings, group: "settings" },
  { label: "Retry Policies", description: "Retry strategies", href: "/settings/retry-policies", icon: RefreshCw, group: "settings" },
  { label: "API Keys", description: "Key management", href: "/settings/api-keys", icon: Key, group: "settings" },
];

const GROUP_LABELS: Record<string, string> = {
  monitor: "Monitor",
  observe: "Observe",
  settings: "Settings",
};

type CommandItem = {
  id: string;
  section: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  iconAccent?: string;
  onSelect: () => void;
};

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[var(--primary)] font-medium">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { isMaster } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setIsMounted(true);
      requestAnimationFrame(() => {
        setIsVisible(true);
        inputRef.current?.focus();
      });
      return;
    }
    setIsVisible(false);
    const timeout = window.setTimeout(() => setIsMounted(false), 200);
    return () => window.clearTimeout(timeout);
  }, [open]);

  const lowerQuery = query.trim().toLowerCase();

  const items = useMemo(() => {
    const result: CommandItem[] = [];

    // Group pages by their group
    const groups = new Map<string, PageItem[]>();
    for (const item of PAGE_ITEMS) {
      if (item.group === "settings" && !isMaster) continue;
      const matches = !lowerQuery || item.label.toLowerCase().includes(lowerQuery) || item.description.toLowerCase().includes(lowerQuery);
      if (matches) {
        const list = groups.get(item.group) ?? [];
        list.push(item);
        groups.set(item.group, list);
      }
    }

    for (const [group, items] of groups) {
      for (const item of items) {
        result.push({
          id: `page-${item.href}`,
          section: GROUP_LABELS[group] ?? group,
          label: item.label,
          description: item.description,
          icon: item.icon,
          onSelect: () => {
            router.push(item.href);
            onOpenChange(false);
          },
        });
      }
    }

    // Quick actions — always show when no query, or when query exists (for searching)
    if (!lowerQuery || "search events".includes(lowerQuery) || "events".includes(lowerQuery)) {
      result.push({
        id: "action-search-events",
        section: "Quick Actions",
        label: query.trim() ? `Search events for "${query.trim()}"` : "Search events…",
        icon: Zap,
        iconAccent: "text-[#f59e0b]",
        onSelect: () => {
          router.push(`/events?search=${encodeURIComponent(query.trim())}`);
          onOpenChange(false);
        },
      });
    }
    if (!lowerQuery || "search notifications".includes(lowerQuery) || "notifications".includes(lowerQuery)) {
      result.push({
        id: "action-search-notifications",
        section: "Quick Actions",
        label: query.trim() ? `Search notifications for "${query.trim()}"` : "Search notifications…",
        icon: Bell,
        iconAccent: "text-[#60a5fa]",
        onSelect: () => {
          router.push(`/notifications?search=${encodeURIComponent(query.trim())}`);
          onOpenChange(false);
        },
      });
    }

    return result;
  }, [lowerQuery, onOpenChange, query, router, isMaster]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [lowerQuery]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      items[selectedIndex]?.onSelect();
    }
  }, [items, selectedIndex, onOpenChange]);

  if (!isMounted) return null;

  // Build section boundaries for rendering
  const sections: { label: string; items: (CommandItem & { globalIndex: number })[] }[] = [];
  let currentSection: typeof sections[0] | null = null;
  items.forEach((item, i) => {
    if (!currentSection || currentSection.label !== item.section) {
      currentSection = { label: item.section, items: [] };
      sections.push(currentSection);
    }
    currentSection.items.push({ ...item, globalIndex: i });
  });

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center transition-all duration-200 ease-out",
        isVisible ? "bg-black/50 opacity-100 backdrop-blur-[6px]" : "bg-black/0 opacity-0 backdrop-blur-0",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Modal */}
      <div
        className={cn(
          "mt-[min(12vh,120px)] w-full max-w-[560px] mx-4 flex flex-col overflow-hidden rounded-2xl border border-[var(--gray-3)] bg-[var(--gray-1)] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset] transition-all duration-200 ease-out",
          isVisible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-3 scale-[0.97] opacity-0",
        )}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Search className="h-[18px] w-[18px] shrink-0 text-[var(--gray-5)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-6 w-full bg-transparent text-[15px] text-[var(--gray-9)] placeholder:text-[var(--gray-5)] outline-none"
            placeholder="Type a command or search…"
            aria-label="Search commands"
          />
          <kbd className="ml-auto shrink-0 inline-flex items-center rounded-md border border-[var(--gray-3)] bg-[var(--gray-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--gray-5)]">
            ESC
          </kbd>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-[var(--gray-3)] to-transparent" />

        {/* Results */}
        <div ref={listRef} className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain py-1.5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Hash className="h-8 w-8 text-[var(--gray-4)]" />
              <p className="text-[13px] text-[var(--gray-5)]">No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.label} className="px-1.5">
                <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--gray-5)]">
                  {section.label}
                </p>
                {section.items.map((item) => {
                  const isSelected = item.globalIndex === selectedIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-index={item.globalIndex}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-75",
                        isSelected
                          ? "bg-[var(--primary)]/[0.08] text-[var(--gray-9)]"
                          : "text-[var(--gray-7)] hover:bg-[var(--gray-2)]",
                      )}
                      onMouseEnter={() => setSelectedIndex(item.globalIndex)}
                      onClick={item.onSelect}
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors duration-75",
                          isSelected
                            ? "border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]"
                            : "border-[var(--gray-3)] bg-[var(--gray-2)] text-[var(--gray-6)]",
                          item.iconAccent && isSelected && item.iconAccent,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium leading-tight">
                          {highlightMatch(item.label, query.trim())}
                        </span>
                        {item.description && (
                          <span className="ml-2 text-[12px] text-[var(--gray-5)]">
                            {item.description}
                          </span>
                        )}
                      </div>
                      <ArrowRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-all duration-75",
                          isSelected
                            ? "translate-x-0 text-[var(--primary)] opacity-100"
                            : "-translate-x-1 text-[var(--gray-5)] opacity-0 group-hover:translate-x-0 group-hover:opacity-50",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-[var(--gray-3)] bg-[var(--gray-2)]/50 px-4 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--gray-5)]">
            <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-[var(--gray-3)] bg-[var(--gray-2)] text-[10px]">↑</kbd>
            <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-[var(--gray-3)] bg-[var(--gray-2)] text-[10px]">↓</kbd>
            <span className="ml-0.5">Navigate</span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--gray-5)]">
            <kbd className="inline-flex h-4 items-center justify-center rounded border border-[var(--gray-3)] bg-[var(--gray-2)] px-1 text-[10px]">
              <CornerDownLeft className="h-2.5 w-2.5" />
            </kbd>
            <span>Select</span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--gray-5)]">
            <kbd className="inline-flex h-4 items-center justify-center rounded border border-[var(--gray-3)] bg-[var(--gray-2)] px-1 text-[10px]">esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
