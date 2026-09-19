"use client";

import { ArrowUpRight, AlertTriangle, CheckCircle2, Circle, Clock, Hash, Mail, Shield, Zap } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { getEvent } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export default function EventDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const {
    data: event,
    isLoading,
    error,
  } = useQuery({ queryKey: ["events", id], queryFn: () => getEvent(id) });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error || !event) {
    return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;
  }

  const timeline = [
    { step: "Accepted", done: true },
    { step: "Processing", done: event.status !== "accepted" },
    { step: "Completed", done: event.status === "completed" || event.status === "partially_failed" },
  ];
  const statusIconColor =
    event.status === "completed"
      ? "text-[#4ade80]"
      : event.status === "failed"
        ? "text-[#f87171]"
        : event.status === "processing"
          ? "text-[#fbbf24]"
          : "text-[var(--gray-6)]";

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--gray-10)]">{event.event_type}</h1>
            <StatusBadge status={event.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] text-[var(--gray-6)]">{event.id}</span>
            <span className="text-[var(--gray-4)]">·</span>
            <span className="text-[12px] text-[var(--gray-6)]">{formatDate(event.created_at)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg border border-[color:rgba(245,158,11,0.2)] bg-[color:rgba(245,158,11,0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#fbbf24]">
            {event.priority.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Event Metadata</h2>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[var(--gray-3)] sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          {[
            { icon: Hash, iconColor: "text-[var(--gray-6)]", label: "Event ID", value: event.id, mono: true },
            { icon: Zap, iconColor: "text-[#60a5fa]", label: "Event Type", value: event.event_type, mono: true },
            { icon: Mail, iconColor: "text-[#fbbf24]", label: "Priority", value: event.priority.toUpperCase(), mono: false },
            { icon: Clock, iconColor: "text-[var(--gray-6)]", label: "Created At", value: formatDate(event.created_at), mono: false },
            { icon: Shield, iconColor: statusIconColor, label: "Status", value: event.status, mono: true },
            { icon: Hash, iconColor: "text-[var(--gray-6)]", label: "Idempotency Key", value: event.idempotency_key ?? "—", mono: true },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--gray-3)] ${item.iconColor}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-6)]">{item.label}</p>
                  <p className={`mt-0.5 truncate text-[13px] text-[var(--gray-9)] ${item.mono ? "font-mono" : ""}`}>{item.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fan-out notifications */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div>
             <h2 className="text-sm font-semibold text-[var(--gray-10)]">Fan-out Notifications</h2>
             <p className="mt-0.5 text-xs text-[var(--gray-6)]">Notifications spawned from this event.</p>
           </div>
           <span className="rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] text-[var(--gray-6)]">
            {event.notifications.length} notification{event.notifications.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-[var(--gray-3)]">
                {["Notification ID", "Channel", "Recipient", "Status", "Created", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gray-6)] sm:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gray-3)]">
              {event.notifications.map((n) => (
                <tr
                  key={n.id}
                  className="group cursor-pointer transition-colors hover:bg-[var(--gray-1)]"
                  onClick={() => router.push(`/notifications/${n.id}`)}
                >
                  <td className="px-4 py-3.5 sm:px-5">
                    <p className="font-mono text-[12px] text-[var(--gray-7)]">{n.id.slice(0, 24)}…</p>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-[var(--gray-7)] sm:px-5">{n.channel}</td>
                  <td className="px-4 py-3.5 text-[13px] text-[var(--gray-7)] sm:px-5">{n.recipient_address}</td>
                  <td className="px-4 py-3.5 sm:px-5"><StatusBadge status={n.status} /></td>
                  <td className="px-4 py-3.5 text-[13px] text-[var(--gray-6)] sm:px-5">{formatRelativeTime(n.created_at)}</td>
                  <td className="px-4 py-3.5 text-right sm:px-5">
                    <Link
                      href={`/notifications/${n.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[13px] text-[var(--primary)] opacity-0 group-hover:opacity-100 hover:text-[#fbbf24] transition-all"
                    >
                      View <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payload */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Delivery Timeline</h2>
          <p className="mt-0.5 text-xs text-[var(--gray-6)]">Status progression for this event.</p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="space-y-0">
            {timeline.map((step, i) => (
              <div key={step.step} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[color:rgba(34,197,94,0.12)] text-[var(--status-delivered)]" : "bg-[var(--gray-3)] text-[var(--gray-5)]"}`}>
                    {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  </span>
                  {i < timeline.length - 1 && (
                    <div className="my-1 h-5 w-px bg-[var(--gray-3)]" />
                  )}
                </div>
                <div className="pb-4">
                  <p className={`text-[13px] font-medium leading-6 ${step.done ? "text-[var(--gray-9)]" : "text-[var(--gray-5)]"}`}>{step.step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Provider Response</h2>
          <p className="mt-0.5 text-xs text-[var(--gray-6)]">Raw payload for this event.</p>
        </div>
        <div className="p-4 sm:p-5">
          <pre className="overflow-x-auto rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] p-4 font-mono text-[12px] leading-relaxed text-[var(--gray-8)]">
            <code>{JSON.stringify(event.payload, null, 2)}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
