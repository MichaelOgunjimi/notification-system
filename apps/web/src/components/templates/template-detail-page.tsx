"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChatText,
  Code,
  Envelope,
  Eye,
  Globe,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import type { Organization, Project, TemplateChannel } from "@beaco/control-plane";
import {
  useDeleteProjectTemplate,
  useForkProjectTemplate,
  useProjectTemplate,
} from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { absoluteFormatter } from "@/lib/audit-log";
import { TemplateFormDialog } from "./template-form-dialog";
import "./template-detail-page.css";

/** Props for {@link TemplateDetailPage}. */
type TemplateDetailPageProps = Readonly<{
  organization: Organization;
  project: Project;
  templateId: string;
}>;

const CHANNEL_ICON: Record<TemplateChannel, typeof Envelope> = {
  email: Envelope,
  sms: ChatText,
  webhook: Code,
};

function TemplateDetailSkeleton({ backHref }: Readonly<{ backHref: string }>) {
  return (
    <div
      className="template-detail-page template-detail-page--skeleton"
      aria-busy="true"
      role="status"
    >
      <Link href={backHref} className="template-detail-page__back">
        <ArrowLeft size={13} />
        All templates
      </Link>
      <span className="sr-only">Loading template</span>
      <header className="template-detail-page__head" aria-hidden="true">
        <div className="template-detail-page__title-row">
          <Skeleton className="template-detail-page__skeleton-icon" />
          <div>
            <Skeleton className="template-detail-page__skeleton-title" />
            <Skeleton className="template-detail-page__skeleton-meta" />
          </div>
        </div>
        <Skeleton className="template-detail-page__skeleton-action" />
      </header>
      <div className="template-detail-page__grid" aria-hidden="true">
        <div className="template-detail-page__col">
          <section className="template-detail-page__card">
            <Skeleton className="template-detail-page__skeleton-heading" />
            <Skeleton className="template-detail-page__skeleton-line" />
          </section>
          <section className="template-detail-page__card">
            <Skeleton className="template-detail-page__skeleton-heading" />
            <Skeleton className="template-detail-page__skeleton-body" />
          </section>
        </div>
        <section className="template-detail-page__card template-detail-page__variables">
          <Skeleton className="template-detail-page__skeleton-heading" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="template-detail-page__skeleton-variable" key={index} />
          ))}
        </section>
      </div>
    </div>
  );
}

/**
 * A single template's source, variables, and (for an owned template) edit —
 * or, for a system default, a fork action that copies it into an editable,
 * project-owned template without ever touching the original.
 *
 * @param props Active organization and project, and the template to show.
 * @returns The template detail surface.
 */
export function TemplateDetailPage({ organization, project, templateId }: TemplateDetailPageProps) {
  const toast = useToast();
  const router = useRouter();
  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canManage = capabilities.has("project:templates:manage");
  const query = useProjectTemplate(project.id, templateId);
  const forkTemplate = useForkProjectTemplate();
  const deleteTemplate = useDeleteProjectTemplate();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"source" | "preview">("source");

  const backHref = `/app/${organization.slug}/${project.slug}/templates`;

  async function handleFork() {
    try {
      const forked = await forkTemplate.mutateAsync({ projectId: project.id, templateId });
      toast.success(`${forked.name} copied to this project`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fork template");
    }
  }

  async function handleDelete() {
    try {
      await deleteTemplate.mutateAsync({ projectId: project.id, templateId });
      toast.success(`${template.name} deleted`);
      setDeleteOpen(false);
      router.push(backHref);
    } catch {
      // The structured mutation error remains visible in the confirmation dialog.
    }
  }

  if (query.isPending) {
    return <TemplateDetailSkeleton backHref={backHref} />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="template-detail-page">
        <Link href={backHref} className="template-detail-page__back">
          <ArrowLeft size={13} />
          All templates
        </Link>
        <p className="template-detail-page__empty">
          {query.error instanceof Error ? query.error.message : "Template not found."}
        </p>
      </div>
    );
  }

  const template = query.data;
  const isDefault = template.projectId === null;
  const Icon = CHANNEL_ICON[template.channel];

  return (
    <div className="template-detail-page" aria-busy={query.isFetching || undefined}>
      <Link href={backHref} className="template-detail-page__back">
        <ArrowLeft size={13} />
        All templates
      </Link>

      <header className="template-detail-page__head">
        <div className="template-detail-page__title-row">
          <span className="template-detail-page__icon">
            <Icon size={16} />
          </span>
          <div>
            <div className="template-detail-page__name-row">
              <h1>{template.name}</h1>
              <span className="template-detail-page__channel">{template.channel}</span>
              {isDefault ? (
                <span className="template-detail-page__system-pill">
                  <Globe size={9} />
                  System default
                </span>
              ) : null}
            </div>
            <p className="template-detail-page__meta">
              {isDefault
                ? "Shared across every project"
                : `Modified ${absoluteFormatter.format(new Date(template.updatedAt))}`}
            </p>
          </div>
        </div>
        {canManage ? (
          isDefault ? (
            <button
              type="button"
              className="template-detail-page__primary-btn"
              onClick={handleFork}
              disabled={forkTemplate.isPending}
            >
              Fork this template
            </button>
          ) : (
            <div className="template-detail-page__head-actions">
              <button
                type="button"
                className="template-detail-page__secondary-btn"
                data-tone="danger"
                onClick={() => {
                  deleteTemplate.reset();
                  setDeleteOpen(true);
                }}
                disabled={deleteTemplate.isPending}
              >
                <Trash size={13} />
                Delete
              </button>
              <button
                type="button"
                className="template-detail-page__primary-btn"
                onClick={() => setEditing(true)}
              >
                <PencilSimple size={13} />
                Edit
              </button>
            </div>
          )
        ) : null}
      </header>

      {isDefault ? (
        <div className="template-detail-page__banner">
          <Globe size={14} />
          This is a system default template. Forking creates an editable copy owned by this project
          — the original is never changed.
        </div>
      ) : null}

      <div className="template-detail-page__grid">
        <div className="template-detail-page__col">
          {template.channel === "email" ? (
            <section className="template-detail-page__card">
              <h2>Subject</h2>
              <p className="template-detail-page__source">{template.subject || "—"}</p>
            </section>
          ) : null}
          <section className="template-detail-page__card">
            <div className="template-detail-page__body-head">
              <h2>Body</h2>
              <div className="template-detail-page__toggle" role="tablist" aria-label="Body view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewMode === "source"}
                  data-active={previewMode === "source" || undefined}
                  onClick={() => setPreviewMode("source")}
                >
                  <Code size={12} />
                  Source
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewMode === "preview"}
                  data-active={previewMode === "preview" || undefined}
                  onClick={() => setPreviewMode("preview")}
                >
                  <Eye size={12} />
                  Preview
                </button>
              </div>
            </div>
            {previewMode === "source" || template.channel !== "email" ? (
              <pre className="template-detail-page__source template-detail-page__source--block">
                {template.body}
              </pre>
            ) : (
              <iframe
                className="template-detail-page__preview-frame"
                title={`${template.name} preview`}
                srcDoc={template.body}
                sandbox="allow-same-origin"
              />
            )}
          </section>
        </div>
        <section className="template-detail-page__card template-detail-page__variables">
          <h2>
            Variables <span>{template.variables.length} declared</span>
          </h2>
          {template.variables.length === 0 ? (
            <p className="template-detail-page__empty-inline">None declared.</p>
          ) : (
            <ul>
              {template.variables.map((variable) => (
                <li key={variable}>
                  <code>{`{{ ${variable} }}`}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing ? (
        <TemplateFormDialog
          open={editing}
          projectId={project.id}
          template={template}
          onOpenChange={setEditing}
          onSaved={() => setEditing(false)}
        />
      ) : null}

      <AppDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) deleteTemplate.reset();
          setDeleteOpen(open);
        }}
        eyebrow="Project template"
        title={`Delete ${template.name}?`}
        description="This removes the project-owned template from every API key in this project. A matching system default, when available, becomes the resolution fallback."
        busy={deleteTemplate.isPending}
        footer={
          <>
            <DialogAction disabled={deleteTemplate.isPending} onClick={() => setDeleteOpen(false)}>
              Cancel
            </DialogAction>
            <DialogAction tone="danger" disabled={deleteTemplate.isPending} onClick={handleDelete}>
              {deleteTemplate.isPending ? "Deleting…" : "Delete template"}
            </DialogAction>
          </>
        }
      >
        {deleteTemplate.isError ? (
          <p className="app-dialog__error">
            {deleteTemplate.error instanceof Error
              ? deleteTemplate.error.message
              : "Failed to delete template"}
          </p>
        ) : null}
      </AppDialog>
    </div>
  );
}
