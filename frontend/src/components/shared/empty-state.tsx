import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--gray-3)] text-[var(--gray-7)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-[var(--gray-10)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--gray-9)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
