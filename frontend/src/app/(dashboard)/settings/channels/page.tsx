"use client";

import { Mail, MessageSquareText, Settings, Webhook } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { listChannelConfigs } from "@/lib/api";
import { cn } from "@/lib/utils";

const channelLabels: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  webhook: "Webhook",
};

export default function ChannelsPage() {
  const { data: channels, isLoading, isFetching, error } = useQuery({
    queryKey: ["settings", "channels"],
    queryFn: listChannelConfigs,
    placeholderData: keepPreviousData,
  });

  if (!channels && isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;

  return (
    <div
      className={cn(
        "space-y-5",
        "transition-opacity duration-150",
        isFetching && !isLoading && "opacity-60 pointer-events-none",
      )}
    >
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">
            Channel Configuration
          </h2>
          <p className="mt-0.5 text-xs text-[var(--gray-6)]">
            Manage delivery channels, providers, and rate limits.
          </p>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          {channels?.map((ch) => {
            const Icon = ch.channel === "email" ? Mail : ch.channel === "sms" ? MessageSquareText : Webhook;
            return (
              <div
                key={ch.channel}
                className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--gray-3)] text-[var(--primary)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-[var(--gray-10)]">
                        {channelLabels[ch.channel] ?? ch.channel}
                      </p>
                      <span className="rounded bg-[var(--gray-3)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--gray-6)]">
                        default
                      </span>
                      {ch.is_enabled ? (
                        <span className="flex items-center gap-1 rounded-full border border-[color:rgba(34,197,94,0.2)] bg-[color:rgba(34,197,94,0.07)] px-2 py-0.5 text-[10px] font-medium text-[var(--status-delivered)]">
                          <span className="h-1 w-1 rounded-full bg-[var(--status-delivered)]" />
                          Enabled
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full border border-[var(--gray-3)] bg-[var(--gray-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--gray-5)]">
                          <span className="h-1 w-1 rounded-full bg-[var(--gray-4)]" />
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-[var(--gray-6)]">
                      Channel delivery configuration.
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--gray-6)]">
                      Rate limit:{" "}
                      <span className="font-mono text-[var(--gray-8)]">
                        {ch.rate_limit_per_min ?? "Unlimited"} req/min
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--gray-3)] bg-[var(--gray-2)] px-3 py-1.5 text-[13px] text-[var(--gray-7)] transition-colors hover:bg-[var(--gray-3)] hover:text-[var(--gray-9)]"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Configure
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[color:rgba(245,158,11,0.15)] bg-[color:rgba(245,158,11,0.05)] px-4 py-3.5">
        <Settings className="mt-0.5 h-4 w-4 shrink-0 text-[#fbbf24]" />
        <p className="text-[13px] text-[var(--gray-7)]">
          Channel credentials (API keys, webhooks secrets) are configured via
          environment variables and are never exposed through this interface.
        </p>
      </div>
    </div>
  );
}
