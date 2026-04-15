import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, delta, icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-6)]">
          {label}
        </p>
        {icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--gray-3)] text-[var(--gray-6)]">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-5">
        <p className="tabular-nums text-[26px] font-semibold leading-none tracking-tight text-[var(--gray-10)]">
          {value}
        </p>
        {delta && (
          <p
            className={cn(
              "mt-2 text-[11px] font-medium",
              delta.positive ? "text-[var(--status-delivered)]" : "text-[var(--status-failed)]",
            )}
          >
            {delta.positive ? "↑" : "↓"} {delta.value}
          </p>
        )}
      </div>
    </div>
  );
}
