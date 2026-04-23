"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTemplate, getTemplate, updateTemplate } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAuthInfo } from "@/lib/auth";
import { Globe, Code, Eye } from "lucide-react";
import { CodeBlock } from "@/components/docs/code-block";

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const authInfo = getAuthInfo();
  const isMaster = authInfo?.isMaster ?? false;
  const [isEditing, setIsEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState<"source" | "preview">("source");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [editVariables, setEditVariables] = useState<string[]>([]);
  const [newVariable, setNewVariable] = useState("");
  const { data: template, isLoading, error } = useQuery({
    queryKey: ["templates", id],
    queryFn: () => getTemplate(id),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      subject?: string;
      body: string;
      variables: string[];
    }) =>
      updateTemplate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["templates", id] });
      toast.success("Template updated");
      setIsEditing(false);
    },
    onError: () => toast.error("Failed to update template"),
  });

  const forkMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      channel: "email" | "sms" | "webhook";
      subject?: string;
      body: string;
      variables: string[];
    }) => createTemplate(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Custom copy created");
      router.push(`/templates/${created.id}`);
    },
    onError: () => toast.error("Failed to create custom copy"),
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

  if (error || !template) return <p className="text-sm text-[var(--status-failed)]">Failed to load data</p>;

  const isSystem = template.api_key_id === null;
  // Regular key editing a system template → fork on save
  const willFork = isSystem && !isMaster;

  const handleEditToggle = () => {
    if (!isEditing) {
      setName(template.name);
      setSubject(template.subject ?? "");
      setBody(template.body);
      setEditVariables(template.variables);
      setNewVariable("");
      setIsEditing(true);
      return;
    }

    if (willFork) {
      // Fork: create a project-owned copy with the edited content
      forkMutation.mutate({
        name,
        channel: template.channel as "email" | "sms" | "webhook",
        subject: subject || undefined,
        body,
        variables: editVariables,
      });
    } else {
      updateMutation.mutate({ name, subject: subject || undefined, body, variables: editVariables });
    }
  };

  const sectionLabel = template.channel === "email" ? "Subject" : "Message";

  const addVariable = () => {
    const candidate = newVariable.trim();
    if (!candidate || editVariables.includes(candidate)) {
      return;
    }
    setEditVariables((prev) => [...prev, candidate]);
    setNewVariable("");
  };

  const removeVariable = (variable: string) => {
    setEditVariables((prev) => prev.filter((item) => item !== variable));
  };

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--gray-10)]">{template.name}</h1>
            <span className="rounded-lg border border-[var(--gray-3)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[var(--gray-6)]">{template.channel}</span>
            {isSystem && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gray-3)] bg-[var(--gray-1)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--gray-6)]">
                <Globe className="h-2.5 w-2.5" />
                System Default
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--gray-6)]">Modified {formatDate(template.updated_at)}</p>
        </div>
        <button type="button" onClick={handleEditToggle} className="shrink-0 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-black hover:bg-[#fbbf24] transition-colors">
          {isEditing ? (willFork ? "Save as Custom" : "Save Template") : "Edit Template"}
        </button>
      </div>

      {/* System template info banner */}
      {isSystem && !isMaster && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--gray-3)] bg-[var(--gray-1)] px-4 py-3">
          <Globe className="h-4 w-4 shrink-0 text-[var(--gray-6)]" />
          <p className="text-[12px] text-[var(--gray-7)]">
            This is a system default template. Editing will save a custom copy owned by your project.
          </p>
        </div>
      )}

      <div className="template-detail-grid gap-5">
        <div className="min-w-0 space-y-5">
          {/* Subject */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--gray-10)]">{sectionLabel}</h2>
            </div>
            <div className="px-4 py-3.5 sm:px-5">
              {isEditing ? (
                <div className="space-y-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                  {template.channel === "email" ? (
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                  ) : null}
                </div>
              ) : (
                <p className="break-words font-mono text-[13px] text-[var(--gray-8)]">
                  {template.channel === "email" ? template.subject : template.body}
                </p>
              )}
            </div>
          </div>

          {/* Body — Source / Preview tabs */}
          <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)]">
            <div className="flex items-center justify-between border-b border-[var(--gray-3)] px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-[var(--gray-10)]">Body</h2>
                <p className="mt-0.5 text-xs text-[var(--gray-6)]">
                  {isEditing ? "Edit template body." : previewMode === "source" ? "Source with variable placeholders." : "Rendered preview."}
                </p>
              </div>
              {!isEditing && (
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
              )}
            </div>

            {isEditing ? (
              <div className="p-4 sm:p-5">
                <textarea
                  className="w-full min-h-48 overflow-x-auto rounded-lg border border-[var(--gray-3)] bg-[var(--gray-1)] p-4 font-mono text-[12px] leading-relaxed text-[var(--gray-8)] whitespace-pre-wrap"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            ) : previewMode === "source" ? (
              <div className="[&>div]:my-0 [&>div]:rounded-none [&>div]:border-0 [&_pre]:max-h-[500px]">
                <CodeBlock language={template.channel === "email" ? "html" : template.channel === "webhook" ? "json" : "text"}>
                  {template.body}
                </CodeBlock>
              </div>
            ) : (
              <div className="bg-white">
                {template.channel === "email" ? (
                  <iframe
                    srcDoc={template.body}
                    title="Template preview"
                    className="h-[500px] w-full border-0"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="p-5">
                    <pre className="whitespace-pre-wrap rounded-lg bg-[var(--gray-1)] p-4 font-mono text-[13px] leading-relaxed text-[var(--gray-8)]">
                      {template.body}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Variables */}
        <div className="overflow-hidden rounded-xl border border-[var(--gray-3)] bg-[var(--gray-2)] self-start">
          <div className="border-b border-[var(--gray-3)] px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-semibold text-[var(--gray-10)]">Variables</h2>
            <p className="mt-0.5 text-xs text-[var(--gray-6)]">
              {(isEditing ? editVariables : template.variables).length} declared
            </p>
          </div>
          {isEditing ? (
            <div className="flex gap-2 border-b border-[var(--gray-3)] px-4 py-3 sm:px-5">
              <Input
                value={newVariable}
                onChange={(e) => setNewVariable(e.target.value)}
                placeholder="variable_name"
              />
              <Button type="button" onClick={addVariable}>
                Add
              </Button>
            </div>
          ) : null}
          <div className="divide-y divide-[var(--gray-3)]">
            {(isEditing ? editVariables : template.variables).map((v) => (
              <div key={v} className="px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[12px] font-mono text-[var(--primary)]">{`{{ ${v} }}`}</code>
                  {isEditing ? (
                    <button
                      type="button"
                      className="text-sm text-[var(--gray-6)] hover:text-[var(--status-failed)]"
                      onClick={() => removeVariable(v)}
                      aria-label={`Remove ${v}`}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {isEditing ? (
            <div className="px-4 pb-4 sm:px-5">
              <Button onClick={handleEditToggle} className="w-full">
                {willFork ? "Save as Custom" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
