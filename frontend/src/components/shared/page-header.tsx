import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex items-start justify-between", className)}>
      <div>
        <h1 className="text-xl font-semibold text-[var(--gray-10)]">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--gray-9)]">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
