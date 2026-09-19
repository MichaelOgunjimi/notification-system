"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderSimple, SpinnerGap, Trash, WarningCircle } from "@phosphor-icons/react";
import type { Organization, Project } from "@beaco/control-plane";
import { useArchiveProject, useUpdateProject } from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { useToast } from "@/components/ui/toast";
import { dashboardPath } from "@/lib/dashboard-route";
import { SLUG_PATTERN } from "@/lib/slug";
import "./project-settings.css";

type ProjectSettingsProps = Readonly<{
  organization: Organization;
  project: Project;
}>;

/**
 * Renders the project profile form and an archive danger zone.
 *
 * Backend authorization (`project:manage`) remains authoritative for every request.
 *
 * @param props Active organization and project scope.
 * @returns Project settings surface backed by control-plane mutations.
 */
export function ProjectSettings({ organization, project }: ProjectSettingsProps) {
  const router = useRouter();
  const toast = useToast();
  const nameId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canManage = capabilities.has("project:manage");

  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [description, setDescription] = useState(project.description ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const updateProject = useUpdateProject();
  const archiveProject = useArchiveProject();

  const profileChanged =
    name.trim() !== project.name ||
    slug.trim() !== project.slug ||
    description.trim() !== (project.description ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    updateProject.reset();
    const nextName = name.trim();
    const nextSlug = slug.trim();
    if (!nextName) return setProfileError("Enter a project name.");
    if (!SLUG_PATTERN.test(nextSlug)) {
      return setProfileError("Use lowercase letters, numbers, and single hyphens for the slug.");
    }
    try {
      const updated = await updateProject.mutateAsync({
        organizationId: organization.id,
        projectId: project.id,
        changes: { name: nextName, slug: nextSlug, description: description.trim() || null },
      });
      toast.success("Project saved");
      if (updated.slug !== project.slug) {
        router.replace(`${dashboardPath(organization.slug, updated.slug)}/settings/project`);
      }
    } catch {
      // The structured mutation error is rendered below the form.
    }
  }

  async function handleArchive() {
    try {
      await archiveProject.mutateAsync({
        organizationId: organization.id,
        projectId: project.id,
      });
      toast.success(`${project.name} archived`);
      router.replace("/workspace");
    } catch {
      // The structured mutation error is rendered inside the confirmation dialog.
    }
  }

  return (
    <div className="project-settings">
      <header className="project-settings__heading">
        <div>
          <p>Project</p>
          <h1>{project.name}</h1>
          <span>
            An isolated set of notification resources, API keys, and delivery history inside{" "}
            <strong>{organization.name}</strong>.
          </span>
        </div>
        <span className="project-settings__tag">
          <FolderSimple size={15} /> {project.slug}
        </span>
      </header>

      <section className="project-settings__section">
        <div className="project-settings__section-heading">
          <span>01</span>
          <div>
            <h2>Profile</h2>
            <p>Name, URL slug, and description. The slug appears in every dashboard link.</p>
          </div>
        </div>
        <form className="project-settings__form" onSubmit={handleSubmit}>
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            value={name}
            disabled={!canManage}
            maxLength={255}
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor={slugId}>URL slug</label>
          <input
            id={slugId}
            value={slug}
            disabled={!canManage}
            maxLength={100}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
          />
          <label htmlFor={descriptionId}>Description</label>
          <textarea
            id={descriptionId}
            value={description}
            disabled={!canManage}
            maxLength={1000}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
          {profileError || updateProject.isError ? (
            <p className="project-settings__message" data-tone="error">
              <WarningCircle size={15} />
              {profileError ?? updateProject.error?.message}
            </p>
          ) : null}
          {updateProject.isSuccess && !updateProject.isPending ? (
            <p className="project-settings__message" data-tone="success">
              <Check size={15} />
              Project saved
            </p>
          ) : null}
          <div className="project-settings__actions">
            <span>
              {canManage
                ? "Slug changes update this project's links."
                : "Your role has read-only access."}
            </span>
            {canManage ? (
              <button disabled={!profileChanged || updateProject.isPending}>
                {updateProject.isPending ? <SpinnerGap className="animate-spin" size={15} /> : null}
                Save project
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {canManage ? (
        <section className="project-settings__section project-settings__section--danger">
          <div className="project-settings__section-heading">
            <span>02</span>
            <div>
              <h2>Danger zone</h2>
              <p>
                Archiving removes the project from the workspace. Delivery data is retained but the
                project stops accepting new events.
              </p>
            </div>
          </div>
          <div className="project-settings__danger-row">
            <div>
              <strong>Archive this project</strong>
              <small>You will be returned to the workspace to pick another project.</small>
            </div>
            <button
              type="button"
              className="project-settings__danger-action"
              onClick={() => {
                archiveProject.reset();
                setArchiveOpen(true);
              }}
            >
              <Trash size={15} /> Archive project
            </button>
          </div>
        </section>
      ) : null}

      <AppDialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open && !archiveProject.isPending) setArchiveOpen(false);
        }}
        eyebrow="Project"
        title={`Archive ${project.name}?`}
        description="The project is removed from the workspace and stops accepting events. Its delivery history and API keys are retained."
        busy={archiveProject.isPending}
        footer={
          <>
            <DialogAction disabled={archiveProject.isPending} onClick={() => setArchiveOpen(false)}>
              Keep project
            </DialogAction>
            <DialogAction tone="danger" disabled={archiveProject.isPending} onClick={handleArchive}>
              <Trash size={15} />
              {archiveProject.isPending ? "Archiving" : "Archive"}
            </DialogAction>
          </>
        }
      >
        {archiveProject.isError ? (
          <p className="app-dialog__error" role="alert">
            {archiveProject.error.message}
          </p>
        ) : null}
      </AppDialog>
    </div>
  );
}
