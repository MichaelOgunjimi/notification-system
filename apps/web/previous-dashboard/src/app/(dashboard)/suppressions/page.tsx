"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSuppression, deleteSuppression, listSuppressions } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const tabs = ["All", "Email", "SMS", "Webhook"];

export default function SuppressionsPage() {
  const [page] = useState(1);
  const [activeTab, setActiveTab] = useState("All");
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms" | "webhook">("email");
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("");
  const channelParam = ["Email", "SMS", "Webhook"].includes(activeTab)
    ? (activeTab.toLowerCase() as "email" | "sms" | "webhook")
    : undefined;
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["suppressions", { page, channel: channelParam }],
    queryFn: () => listSuppressions({ page, per_page: 25, channel: channelParam }),
    placeholderData: keepPreviousData,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSuppression,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
      toast.success("Suppression removed");
    },
    onError: () => toast.error("Failed to remove suppression"),
  });
  const createMutation = useMutation({
    mutationFn: createSuppression,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
      toast.success("Suppression added");
      setOpen(false);
    },
    onError: () => toast.error("Failed to add suppression"),
  });

  if (!data && isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;

  const rows = data?.items ?? [];
  const bounces = rows.filter((r) => r.reason?.toLowerCase().includes("bounce")).length;
  const unsubscribes = rows.filter((r) => r.reason?.toLowerCase().includes("unsubscribe")).length;
  const complaints = rows.filter((r) => r.reason?.toLowerCase().includes("complaint")).length;

  return (
    <div className={cn("space-y-5", "transition-opacity duration-150", isFetching && !isLoading && "opacity-60 pointer-events-none")}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total Suppressed" value={data?.total ?? 0} />
        <StatCard label="Bounces" value={bounces} />
        <StatCard label="Unsubscribes" value={unsubscribes} />
        <StatCard label="Complaints" value={complaints} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${activeTab === tab ? "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[var(--gray-10)]" : "border-[var(--gray-3)] bg-transparent text-[var(--gray-6)] hover:bg-[var(--gray-2)] hover:text-[var(--gray-9)]"}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-black hover:bg-[#fbbf24] transition-colors">
            Add Suppression
          </button>
        </div>

        <div className="divide-y divide-[var(--gray-3)]">
          {rows.length === 0 ? <EmptyState title="No suppressions" description="No suppressed recipients found." /> : null}
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between px-4 py-3.5 sm:px-5">
              <div>
                <p className="text-[13px] text-[var(--gray-9)]">{row.recipient}</p>
                <p className="text-[12px] text-[var(--gray-6)]">
                  {row.channel} · {row.reason ?? "manual"} · {formatDate(row.created_at)}
                </p>
              </div>
              <Button variant="outline" onClick={() => deleteMutation.mutate(row.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Suppression</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Channel</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value as "email" | "sms" | "webhook")}
              >
                <option value="email">email</option>
                <option value="sms">sms</option>
                <option value="webhook">webhook</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Recipient</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMutation.mutate({ channel, recipient, reason: reason || undefined })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
