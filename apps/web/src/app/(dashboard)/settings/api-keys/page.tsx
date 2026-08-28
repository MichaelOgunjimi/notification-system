"use client";

import { Copy, KeyRound, Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeTime } from "@/lib/utils";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "text-[var(--status-delivered)] bg-[color:rgba(34,197,94,0.08)] border-[color:rgba(34,197,94,0.2)]" },
  revoked: { label: "Revoked", className: "text-[#fca5a5] bg-[color:rgba(239,68,68,0.08)] border-[color:rgba(239,68,68,0.2)]" },
};

export default function ApiKeysPage() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rateLimit, setRateLimit] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: () => listApiKeys(),
    placeholderData: keepPreviousData,
  });
  const queryClient = useQueryClient();
  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "api-keys"] });
      toast.success("API key revoked");
    },
    onError: () => toast.error("Failed to revoke key"),
  });
  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "api-keys"] });
      setCreatedKey(created.key);
      setOpen(false);
      toast.success("API key created");
    },
    onError: () => toast.error("Failed to create key"),
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

  const keys = data?.items ?? [];
  const activeCount = keys.filter((k) => k.is_active).length;
  const revokedCount = keys.filter((k) => !k.is_active).length;

  return (
    <div className={cn("space-y-5", "transition-opacity duration-150", isFetching && !isLoading && "opacity-60 pointer-events-none")}>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Active Keys" value={activeCount} icon={<KeyRound className="h-3.5 w-3.5" />} />
        <StatCard label="Revoked" value={revokedCount} icon={<ShieldOff className="h-3.5 w-3.5" />} />
        <StatCard label="Created This Month" value={keys.length} icon={<Plus className="h-3.5 w-3.5" />} />
      </div>

      {/* Keys table */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Project Credentials</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Issue, rotate, and revoke ingestion keys.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-black hover:bg-[#fbbf24] transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Create API Key
          </button>
        </div>

        <div className="divide-y divide-[var(--gray-3)]">
          {keys.map((key) => {
            const sc = statusConfig[key.is_active ? "active" : "revoked"];
            return (
              <div key={key.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-[var(--gray-10)]">{key.name}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] ${sc.className}`}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="font-mono text-[12px] text-[var(--gray-7)]">{key.key_prefix}…</code>
                      <button type="button" aria-label="Copy key" className="text-[var(--gray-5)] hover:text-[var(--gray-8)] transition-colors">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
                      <span className="text-[var(--gray-5)]">
                        Key ID <span className="font-mono text-[var(--gray-7)]">{`${key.id.slice(0, 6)}...`}</span>
                      </span>
                      <span className="text-[var(--gray-5)]">
                        Rate limit{" "}
                        <span className="font-mono text-[var(--gray-7)]">
                          {key.rate_limit_per_min ? `${key.rate_limit_per_min}/min` : "Unlimited"}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[12px] text-[var(--gray-5)]">Last used {formatRelativeTime(key.last_used_at ?? key.created_at)}</span>
                    <button type="button" onClick={() => revokeMutation.mutate(key.id)} className="rounded-lg border border-[color:rgba(239,68,68,0.2)] bg-[color:rgba(239,68,68,0.08)] px-3 py-1.5 text-[13px] text-[#fca5a5] hover:bg-[color:rgba(239,68,68,0.14)] transition-colors">
                      Revoke
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 rounded-xl border border-[color:rgba(245,158,11,0.15)] bg-[color:rgba(245,158,11,0.05)] px-4 py-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#fbbf24]" />
        <p className="text-[13px] text-[var(--gray-7)]">
          API keys grant full access to this project. Never expose them in client-side code or public repositories.
          <span className="ml-1 text-[var(--primary)]">Learn about key security →</span>
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Rate limit per min (optional)</Label>
              <Input value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                createMutation.mutate({
                  name,
                  rate_limit_per_min: rateLimit ? Number(rateLimit) : undefined,
                })
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(createdKey)} onOpenChange={() => setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
          </DialogHeader>
          <p className="font-mono text-xs break-all">{createdKey}</p>
          <DialogFooter>
            <Button
              onClick={() => {
                if (createdKey) {
                  navigator.clipboard.writeText(createdKey);
                  toast.success("Copied API key");
                }
              }}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
