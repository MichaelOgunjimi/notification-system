"use client";

import { ArrowUpRight, CheckCircle2, Circle, Clock, Code, Eye, Mail, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { CodeBlock } from "@/components/docs/code-block";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { getNotification } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function NotificationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [previewMode, setPreviewMode] = useState<"source" | "preview">("source");
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

  const channelColor = { email: "text-[#60a5fa]", sms: "text-[#4ade80]", webhook: "text-[#a78bfa]" };
  const detailItems = [
    { icon: Mail, iconColor: "text-[#60a5fa]", label: "Recipient", value: notification.recipient_address },
    { icon: RotateCcw, iconColor: "text-[#fbbf24]", label: "Attempts", value: `${notification.retry_count} of ${notification.max_retries}` },
    { icon: Clock, iconColor: "text-[#f87171]", label: "Error", value: notification.error_message ?? "None" },
  ];
  const stepIcon = (status: string) => {
    if (status === "delivered") return <CheckCircle2 className="h-4 w-4 text-[#4ade80]" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-[#f87171]" />;
    if (status === "processing") return <Clock className="h-4 w-4 text-[#fbbf24]" />;
    if (status === "queued") return <Circle className="h-4 w-4 text-[#60a5fa]" />;
    return <Circle className="h-4 w-4 text-[var(--gray-5)]" />;
  };

  const stepBgColor = (status: string) => {
    if (status === "delivered") return "bg-[color:rgba(74,222,128,0.12)]";
    if (status === "failed") return "bg-[color:rgba(248,113,113,0.12)]";
    if (status === "processing") return "bg-[color:rgba(251,191,36,0.12)]";
    if (status === "queued") return "bg-[color:rgba(96,165,250,0.12)]";
    return "bg-[var(--gray-3)]";
  };

  const stepLineColor = (status: string) => {
    if (status === "delivered") return "bg-[#4ade80]";
    if (status === "failed") return "bg-[#f87171]";
    if (status === "processing") return "bg-[#fbbf24]";
    if (status === "queued") return "bg-[#60a5fa]";
    return "bg-[var(--gray-4)]";
  };

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
          <span className={`rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] ${channelColor[notification.channel] ?? "text-[var(--gray-6)]"}`}>{notification.channel}</span>
        </div>
      </div>

      {/* Top row: Timeline + Details side-by-side */}
      <div className="notification-detail-grid gap-5">
        {/* Delivery Timeline */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
          <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Delivery Timeline</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-7)]">Step-by-step delivery trace.</p>
          </div>
          <div className="p-4 sm:p-5">
            <div className="space-y-0">
              {(notification.notification_logs ?? []).map((step, i) => (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${stepBgColor(step.status)}`}>
                      {stepIcon(step.status)}
                    </span>
                    {i < (notification.notification_logs ?? []).length - 1 && (
                      <div className={`my-1 h-5 w-px ${stepLineColor(step.status)}`} />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className={`text-[13px] font-medium leading-6 ${step.status === "delivered" ? "text-[var(--gray-9)]" : "text-[var(--gray-6)]"}`}>{step.message ?? step.status}</p>
                    <p className="font-mono text-[11px] text-[var(--gray-6)]">{formatDate(step.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Details + Source Event */}
        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">Details</h2>
            </div>
            <div className="divide-y divide-[var(--gray-3)]">
              {detailItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--gray-3)] ${item.iconColor}`}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-7)]">{item.label}</p>
                      <p className="truncate text-[13px] text-[var(--gray-9)]">{item.value}</p>
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
              <Link href={`/events/${notification.event_id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] text-[var(--primary)] hover:text-[#fbbf24] transition-colors">
                View event <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width: Rendered Body — Source / Preview tabs */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Rendered Body</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">
              {previewMode === "source" ? "Message source as delivered." : "Rendered preview."}
            </p>
          </div>
          <div className="flex rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] p-0.5">
            <button
              type="button"
              onClick={() => setPreviewMode("source")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${previewMode === "source" ? "bg-[var(--gray-3)] text-[var(--gray-10)]" : "text-[var(--gray-6)] hover:text-[var(--gray-8)]"}`}
            >
              <Code className="size-3" />
              Source
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("preview")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${previewMode === "preview" ? "bg-[var(--gray-3)] text-[var(--gray-10)]" : "text-[var(--gray-6)] hover:text-[var(--gray-8)]"}`}
            >
              <Eye className="size-3" />
              Preview
            </button>
          </div>
        </div>

        {previewMode === "source" ? (
          <div className="[&>div]:my-0 [&>div]:rounded-none [&>div]:border-0 [&_pre]:max-h-[600px]">
            <CodeBlock language={notification.channel === "email" ? "html" : notification.channel === "webhook" ? "json" : "text"}>
              {notification.rendered_body ?? "No rendered body"}
            </CodeBlock>
          </div>
        ) : (
          <div className="bg-white">
            {notification.channel === "email" ? (
              <iframe
                srcDoc={notification.rendered_body ?? ""}
                title="Notification body preview"
                className="h-[600px] w-full border-0"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="p-5">
                <pre className="whitespace-pre-wrap rounded-lg bg-[var(--gray-1)] p-4 font-mono text-[13px] leading-relaxed text-[var(--gray-8)]">
                  {notification.rendered_body ?? "No rendered body"}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
