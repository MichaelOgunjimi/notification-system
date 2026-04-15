"use client";

import { FileText, Mail, MessageSquareText, Plus, Trash2, Webhook } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const channelIcon = { email: Mail, sms: MessageSquareText, webhook: Webhook };

export default function TemplatesPage() {
  const [page] = useState(1);
  const [channel] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newChannel, setNewChannel] = useState<"email" | "sms" | "webhook">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["templates", { page, channel }],
    queryFn: () => listTemplates({ page, per_page: 20, channel: channel || undefined }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted");
    },
    onError: () => toast.error("Failed to delete template"),
  });
  const createMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template created");
      setOpen(false);
      setName("");
      setSubject("");
      setBody("");
      setNewChannel("email");
    },
    onError: () => toast.error("Failed to create template"),
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

  const templates = data?.items ?? [];
  const emailCount = templates.filter((t) => t.channel === "email").length;
  const smsCount = templates.filter((t) => t.channel === "sms").length;
  const webhookCount = templates.filter((t) => t.channel === "webhook").length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Email Templates" value={emailCount} icon={<Mail className="h-3.5 w-3.5" />} />
        <StatCard label="SMS Templates" value={smsCount} icon={<MessageSquareText className="h-3.5 w-3.5" />} />
        <StatCard label="Webhook Templates" value={webhookCount} icon={<Webhook className="h-3.5 w-3.5" />} />
      </div>

      {/* Template library */}
      <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
        <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Template Library</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">Reusable content blocks across delivery channels.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-black hover:bg-[#fbbf24] transition-colors">
            <Plus className="h-3.5 w-3.5" />
            New Template
          </button>
        </div>

        <div className="grid gap-px bg-[var(--gray-3)] sm:grid-cols-2">
          {templates.length === 0 ? (
            <EmptyState title="No templates found" description="Create your first template to get started." />
          ) : null}
          {templates.map((t) => {
            const Icon = channelIcon[t.channel as keyof typeof channelIcon] ?? FileText;
            return (
              <Link
                key={t.id}
                href={`/templates/${t.id}`}
                className="group flex flex-col gap-3 bg-[var(--gray-2)] p-4 transition-colors hover:bg-[var(--gray-1)] sm:p-5"
              >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--gray-3)] text-[var(--primary)]">
                        <Icon className="h-4 w-4" />
                      </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--gray-10)]">{t.name}</p>
                      <span className="rounded border border-[var(--gray-3)] px-1.5 py-px text-[10px] uppercase tracking-[0.12em] text-[var(--gray-6)]">
                        {t.channel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      deleteMutation.mutate(t.id);
                    }}
                    className="rounded-lg border border-[var(--gray-3)] px-2 py-1 text-[11px] text-[var(--gray-6)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="truncate font-mono text-[12px] text-[var(--gray-8)]">{t.subject}</p>
                <div className="flex flex-wrap gap-1">
                  {t.variables.slice(0, 3).map((v) => (
                    <span key={v} className="rounded bg-[var(--gray-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--gray-8)]">{`{{${v}}}`}</span>
                  ))}
                  {t.variables.length > 3 && (
                    <span className="rounded bg-[var(--gray-3)] px-1.5 py-0.5 text-[11px] text-[var(--gray-6)]">+{t.variables.length - 3}</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--gray-5)]">
                  <span>{t.variables.length} vars</span>
                  <span>Modified {formatRelativeTime(t.updated_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Channel</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as "email" | "sms" | "webhook")}
              >
                <option value="email">email</option>
                <option value="sms">sms</option>
                <option value="webhook">webhook</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Subject <span className="text-[var(--gray-5)]">(email only)</span></Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Welcome to {{app_name}}" />
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!name.trim() || !body.trim()) {
                  toast.error("Name and body are required");
                  return;
                }
                createMutation.mutate({ name, channel: newChannel, subject: subject || undefined, body });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
