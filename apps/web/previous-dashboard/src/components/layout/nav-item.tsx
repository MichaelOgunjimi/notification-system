"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function NavItem({
  href,
  icon,
  label,
  badge,
  collapsed = false,
  onNavigate,
}: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  const link = (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      onClick={onNavigate}
        className={cn(
          "group flex touch-manipulation items-center rounded-lg text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/70 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--gray-1)]",
          collapsed
            ? "h-10 w-10 justify-center"
            : "h-10 justify-between px-2.5",
        isActive
          ? "bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]"
          : "text-[var(--gray-7)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-center",
          collapsed ? "justify-center" : "gap-x-2.5",
        )}
      >
        <span
          className={cn(
            "flex h-[16px] w-[16px] shrink-0 items-center justify-center transition-colors",
            isActive
              ? "text-[var(--primary)]"
              : "text-[var(--gray-6)] group-hover:text-[var(--gray-8)]",
          )}
        >
          {icon}
        </span>
        {!collapsed && <span className="truncate">{label}</span>}
      </span>

      {!collapsed && badge != null && badge > 0 && (
        <span className="tabular-nums rounded-full bg-[var(--primary)] px-1.5 py-px text-[11px] font-semibold text-black">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <TooltipProvider delay={200}>
        <Tooltip>
          <TooltipTrigger render={link} />
          <TooltipContent side="right" className="text-xs font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return link;
}
