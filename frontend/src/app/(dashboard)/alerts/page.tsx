"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAlertRule, deleteAlertRule, listAlertRules, updateAlertRule } from "@/lib/api";
import { StatCard } from "@/components/dashboard/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

export default function AlertsPage() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("");
  const [threshold, setThreshold] = useState("");
  const [windowMinutes, setWindowMinutes] = useState("60");
  const { data: rules, isLoading, error } = useQuery({ queryKey: ["alerts"], queryFn: listAlertRules });
  const queryClient = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => updateAlertRule(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert rule deleted");
    },
    onError: () => toast.error("Failed to delete alert rule"),
  });
  const createMutation = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert rule created");
      setOpen(false);
    },
    onError: () => toast.error("Failed to create alert rule"),
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
  if (error) return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;

  const activeCount = rules?.filter((r) => r.is_active).length ?? 0;
  const disabledCount = rules?.filter((r) => !r.is_active).length ?? 0;
  const today = new Date().toDateString();
  const triggeredToday = rules?.filter((r) => r.last_triggered_at && new Date(r.last_triggered_at).toDateString() === today).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Active Rules" value={activeCount} />
        <StatCard label="Triggered Today" value={triggeredToday} />
        <StatCard label="Disabled Rules" value={disabledCount} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--gray-10)]">Alert Rules</h2>
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-black hover:bg-[#fbbf24] transition-colors">
            New Alert
          </button>
        </div>
        <div className="divide-y divide-[var(--gray-3)]">
          {rules?.length === 0 ? <EmptyState title="No alert rules" description="Create an alert rule to monitor system metrics." /> : null}
          {rules?.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between px-4 py-3.5 sm:px-5">
              <div>
                <p className="text-[13px] font-medium text-[var(--gray-9)]">
                  {rule.name} · {rule.metric} &gt; {rule.threshold}
                </p>
                <p className="text-[12px] text-[var(--gray-6)]">
                  Window {rule.window_minutes}m · {rule.last_triggered_at ? formatRelativeTime(rule.last_triggered_at) : "Never triggered"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active })} className="rounded-lg border border-[var(--gray-3)] px-3 py-1.5 text-[13px] text-[var(--gray-7)]">
                  {rule.is_active ? "Disable" : "Enable"}
                </button>
                <button type="button" onClick={() => deleteMutation.mutate(rule.id)} className="rounded-lg border border-[color:rgba(239,68,68,0.2)] bg-[color:rgba(239,68,68,0.08)] px-3 py-1.5 text-[13px] text-[#fca5a5]">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Alert Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Metric</Label>
              <Input value={metric} onChange={(e) => setMetric(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Threshold</Label>
              <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Window minutes</Label>
              <Input value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMutation.mutate({ name, metric, threshold: Number(threshold), window_minutes: Number(windowMinutes) })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
