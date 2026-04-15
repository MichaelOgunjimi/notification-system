"use client";

import { ArrowUpRight, CheckCircle2, Circle, Clock, Mail, RotateCcw, Zap } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { getNotification } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function NotificationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: notification, isLoading, error } = useQuery({
    queryKey: ["notifications", id],
    queryFn: () => getNotification(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error || !notification) {
    return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;
  }

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--gray-10)]">{notification.rendered_subject ?? notification.channel}</h1>
            <StatusBadge status={notification.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] text-[var(--gray-5)]">{notification.id}</span>
            <span className="text-[var(--gray-4)]">·</span>
            <span className="text-[12px] text-[var(--gray-6)]">{formatDate(notification.created_at)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[var(--gray-6)]">{notification.channel}</span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Delivery Timeline */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Delivery Timeline</h2>
              <p className="mt-0.5 text-xs text-[var(--gray-6)]">Step-by-step delivery trace.</p>
            </div>
            <div className="p-4 sm:p-5">
              <div className="space-y-0">
                {(notification.notification_logs ?? []).map((step, i) => (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.status === "delivered" ? "bg-[color:rgba(34,197,94,0.12)] text-[var(--status-delivered)]" : "bg-[var(--gray-3)] text-[var(--gray-5)]"}`}>
                        {step.status === "delivered" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                      </span>
                      {i < (notification.notification_logs ?? []).length - 1 && (
                        <div className="my-1 h-5 w-px bg-[var(--gray-3)]" />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-[13px] font-medium leading-6 ${step.status === "delivered" ? "text-[var(--gray-9)]" : "text-[var(--gray-5)]"}`}>{step.message ?? step.status}</p>
                      <p className="font-mono text-[11px] text-[var(--gray-5)]">{formatDate(step.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rendered Body */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Rendered Body</h2>
              <p className="mt-0.5 text-xs text-[var(--gray-6)]">Message body rendered for this notification.</p>
            </div>
            <div className="p-4 sm:p-5">
              <pre className="overflow-x-auto rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] p-4 font-mono text-[12px] leading-relaxed text-[var(--gray-8)]">
                <code>{notification.rendered_body ?? "No rendered body"}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Right: Details */}
        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Details</h2>
            </div>
            <div className="divide-y divide-[var(--gray-3)]">
              {[
                { icon: Mail, label: "Recipient", value: notification.recipient_address },
                { icon: RotateCcw, label: "Attempts", value: `${notification.retry_count} of ${notification.max_retries}` },
                { icon: Clock, label: "Error", value: notification.error_message ?? "None" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--gray-3)] text-[var(--gray-6)]">
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-5)]">{item.label}</p>
                      <p className={`truncate text-[13px] text-[var(--gray-9)] ${(item as any).mono ? "font-mono" : ""}`}>{item.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Source Event</h2>
            </div>
            <div className="p-4 sm:p-5">
              <p className="truncate font-mono text-[12px] text-[var(--gray-7)]">{notification.event_id}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--gray-5)]">{notification.event_id.slice(0, 26)}…</p>
              <Link href={`/events/${notification.event_id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] text-[var(--primary)] hover:text-[#fbbf24] transition-colors">
                View event <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
