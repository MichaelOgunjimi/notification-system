import { cn } from "@/lib/utils";

const statusConfig: Record<
  string,
  { label: string; className: string; dotClass: string }
> = {
  accepted: {
    label: "Accepted",
    className: "bg-blue-500/10 border-blue-500/20 text-blue-300",
    dotClass: "bg-blue-400",
  },
  completed: {
    label: "Completed",
    className:
      "bg-[var(--status-delivered-bg)] border-[var(--status-delivered-border)] text-[#86efac]",
    dotClass: "bg-[var(--status-delivered)]",
  },
  delivered: {
    label: "Delivered",
    className:
      "bg-[var(--status-delivered-bg)] border-[var(--status-delivered-border)] text-[#86efac]",
    dotClass: "bg-[var(--status-delivered)]",
  },
  failed: {
    label: "Failed",
    className:
      "bg-[var(--status-failed-bg)] border-[var(--status-failed-border)] text-[#fca5a5]",
    dotClass: "bg-[var(--status-failed)]",
  },
  retrying: {
    label: "Retrying",
    className:
      "bg-[var(--status-retrying-bg)] border-[var(--status-retrying-border)] text-[#fdba74]",
    dotClass: "bg-[var(--status-retrying)] animate-pulse",
  },
  queued: {
    label: "Queued",
    className:
      "bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[#d1d5db]",
    dotClass: "bg-[var(--status-pending)]",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-500/10 border-blue-500/20 text-blue-300",
    dotClass: "bg-blue-400 animate-pulse",
  },
  partially_failed: {
    label: "Partial",
    className:
      "bg-[color:rgba(245,158,11,0.08)] border-[color:rgba(245,158,11,0.2)] text-[#fbbf24]",
    dotClass: "bg-[#f59e0b]",
  },
  dead_letter: {
    label: "Dead Letter",
    className: "bg-red-900/20 border-red-800/30 text-red-400",
    dotClass: "bg-red-600",
  },
  pending: {
    label: "Pending",
    className:
      "bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[#d1d5db]",
    dotClass: "bg-[var(--status-pending)]",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[var(--gray-6)]",
    dotClass: "bg-[var(--gray-5)]",
  },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? {
    label: status,
    className: "bg-gray-500/10 border-gray-500/20 text-gray-300",
    dotClass: "bg-gray-500",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
      {cfg.label}
    </span>
  );
}
