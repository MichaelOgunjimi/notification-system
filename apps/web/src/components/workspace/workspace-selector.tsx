"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Buildings,
  Check,
  FolderSimple,
  Plus,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { useCreateProject, useOrganizations, useProjects } from "@beaco/control-plane/react";
import type { Organization, Project } from "@beaco/control-plane";
import { SessionRecovery } from "@/components/auth/session-recovery";
import { useToast } from "@/components/ui/toast";
import { dashboardPath } from "@/lib/dashboard-route";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import { WorkspaceShell } from "./workspace-shell";
import "./workspace-selector.css";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function WorkspaceError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <WorkspaceShell>
      <div className="workspace-selector workspace-selector--message">
        <span className="workspace-selector__message-icon">
          <WarningCircle size={24} />
        </span>
        <h2>Workspace unavailable</h2>
        <p role="alert">{message}</p>
        <button type="button" onClick={retry} className="workspace-selector__primary">
          <span>Try again</span>
          <ArrowRight size={17} />
        </button>
      </div>
    </WorkspaceShell>
  );
}

/**
 * Loads the authenticated user's organizations and projects and routes a valid
 * selection into the canonical dashboard URL, with inline recovery for the
 * no-organization and no-project states.
 *
 * @returns Workspace selection interface with authenticated loading and error states.
 */
export function WorkspaceSelector() {
  const toast = useToast();
  const session = useSession();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");
  const [newProjectSlugTouched, setNewProjectSlugTouched] = useState(false);
  const [projectFormError, setProjectFormError] = useState<string | null>(null);

  const organizations = useOrganizations(session.status === "authenticated");
  const activeOrganizationId = organizations.data?.some(
    (organization) => organization.id === organizationId,
  )
    ? organizationId
    : (organizations.data?.[0]?.id ?? null);
  const projects = useProjects(activeOrganizationId);
  const activeProjectId = projects.data?.some((project) => project.id === projectId)
    ? projectId
    : (projects.data?.[0]?.id ?? null);
  const createProject = useCreateProject();

  const newProjectEffectiveSlug = newProjectSlugTouched ? newProjectSlug : slugify(newProjectName);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectFormError(null);
    createProject.reset();
    if (!activeOrganizationId) return;
    const nextName = newProjectName.trim();
    const nextSlug = newProjectEffectiveSlug.trim();
    if (!nextName) return setProjectFormError("Enter a project name.");
    if (!SLUG_PATTERN.test(nextSlug)) {
      return setProjectFormError(
        "Use lowercase letters, numbers, and single hyphens for the slug.",
      );
    }
    try {
      const created = await createProject.mutateAsync({
        organizationId: activeOrganizationId,
        project: { name: nextName, slug: nextSlug },
      });
      setProjectId(created.id);
      setNewProjectName("");
      setNewProjectSlug("");
      setNewProjectSlugTouched(false);
      toast.success(`${created.name} created`);
    } catch {
      // The structured mutation error is rendered beside the form.
    }
  }

  const createOrgDialog = createOrgOpen ? (
    <CreateOrganizationDialog
      open
      onOpenChange={setCreateOrgOpen}
      onCreated={(organization) => {
        setOrganizationId(organization.id);
        setProjectId(null);
        setCreateOrgOpen(false);
      }}
    />
  ) : null;

  if (session.status === "loading") {
    return (
      <WorkspaceShell>
        <div aria-live="polite" className="workspace-selector__loading">
          <SpinnerGap size={19} className="animate-spin" /> Loading workspace context
        </div>
      </WorkspaceShell>
    );
  }
  if (session.status === "error") {
    return (
      <WorkspaceShell>
        <SessionRecovery onRetry={() => void session.refresh()} />
      </WorkspaceShell>
    );
  }
  if (session.status === "anonymous" || !session.user) {
    return (
      <WorkspaceShell>
        <div className="workspace-selector workspace-selector--message">
          <h2>Your session ended</h2>
          <p>Request another private link to return to the workspace.</p>
          <Link href="/login" className="workspace-selector__primary">
            <span>Return to sign in</span>
            <ArrowRight size={17} />
          </Link>
        </div>
      </WorkspaceShell>
    );
  }
  if (organizations.isPending) {
    return (
      <WorkspaceShell>
        <div aria-live="polite" className="workspace-selector__loading">
          <SpinnerGap size={19} className="animate-spin" /> Loading workspace context
        </div>
      </WorkspaceShell>
    );
  }
  if (organizations.isError) {
    return (
      <WorkspaceError
        message={organizations.error.message}
        retry={() => void organizations.refetch()}
      />
    );
  }
  if (organizations.data.length === 0) {
    return (
      <WorkspaceShell>
        <div className="workspace-selector workspace-selector--message">
          <span className="workspace-selector__message-icon">
            <Buildings size={24} />
          </span>
          <h2>Create your first organization</h2>
          <p>
            An organization holds your team, projects, and billing. A first project is created
            automatically.
          </p>
          <button
            type="button"
            className="workspace-selector__primary"
            onClick={() => setCreateOrgOpen(true)}
          >
            <span>Create organization</span>
            <ArrowRight size={17} />
          </button>
        </div>
        {createOrgDialog}
      </WorkspaceShell>
    );
  }

  const selectedOrganization = organizations.data.find(
    (organization) => organization.id === activeOrganizationId,
  );
  const selectedProject = projects.data?.find((project) => project.id === activeProjectId);
  const organizationHasNoProjects = projects.data?.length === 0;

  return (
    <WorkspaceShell>
      <div className="workspace-selector">
        <div className="workspace-selector__eyebrow">
          <Check size={13} weight="bold" /> {session.user.email}
        </div>
        <h2>Select a project</h2>
        <p className="workspace-selector__intro">
          Choose the organization and project that should scope this workspace view.
        </p>

        <section className="workspace-selector__section" aria-labelledby="organization-heading">
          <div className="workspace-selector__section-heading">
            <span className="workspace-selector__step">01</span>
            <div>
              <h3 id="organization-heading">Organization</h3>
              <p>{organizations.data.length} available</p>
            </div>
          </div>
          <div className="workspace-selector__options">
            {organizations.data.map((organization: Organization) => (
              <button
                type="button"
                key={organization.id}
                className="workspace-selector__option"
                data-selected={organization.id === activeOrganizationId}
                onClick={() => {
                  setOrganizationId(organization.id);
                  setProjectId(null);
                }}
              >
                <span className="workspace-selector__option-icon">
                  <Buildings size={17} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <strong>{organization.name}</strong>
                  <small>
                    {organization.slug} · {organization.role}
                  </small>
                </span>
                <span className="workspace-selector__check">
                  <Check size={13} weight="bold" />
                </span>
              </button>
            ))}
            <button
              type="button"
              className="workspace-selector__add"
              onClick={() => setCreateOrgOpen(true)}
            >
              <Plus size={14} weight="bold" /> New organization
            </button>
          </div>
        </section>

        <section className="workspace-selector__section" aria-labelledby="project-heading">
          <div className="workspace-selector__section-heading">
            <span className="workspace-selector__step">02</span>
            <div>
              <h3 id="project-heading">Project</h3>
              <p>{selectedOrganization?.name}</p>
            </div>
          </div>
          {projects.isPending ? (
            <div className="workspace-selector__loading">
              <SpinnerGap size={16} className="animate-spin" /> Loading projects
            </div>
          ) : projects.isError ? (
            <button
              type="button"
              className="workspace-selector__loading"
              onClick={() => void projects.refetch()}
            >
              <WarningCircle size={16} /> {projects.error.message} · Retry
            </button>
          ) : organizationHasNoProjects ? (
            <form className="workspace-selector__create" onSubmit={handleCreateProject}>
              <p>
                <FolderSimple size={15} /> This organization has no projects yet. Create one to
                continue.
              </p>
              <input
                aria-label="Project name"
                value={newProjectName}
                maxLength={255}
                placeholder="Project name"
                onChange={(event) => setNewProjectName(event.target.value)}
              />
              <input
                aria-label="Project slug"
                value={newProjectEffectiveSlug}
                maxLength={100}
                placeholder="project-slug"
                onChange={(event) => {
                  setNewProjectSlugTouched(true);
                  setNewProjectSlug(event.target.value.toLowerCase());
                }}
              />
              {projectFormError || createProject.isError ? (
                <p className="workspace-selector__create-error" role="alert">
                  <WarningCircle size={14} />
                  {projectFormError ?? createProject.error?.message}
                </p>
              ) : null}
              <button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? <SpinnerGap className="animate-spin" size={14} /> : null}
                Create project
              </button>
            </form>
          ) : projects.data && projects.data.length > 0 ? (
            <div className="workspace-selector__options">
              {projects.data.map((project: Project) => (
                <button
                  type="button"
                  key={project.id}
                  className="workspace-selector__option"
                  data-selected={project.id === activeProjectId}
                  onClick={() => setProjectId(project.id)}
                >
                  <span className="workspace-selector__option-icon">
                    <FolderSimple size={17} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <strong>{project.name}</strong>
                    <small>{project.description || project.slug}</small>
                  </span>
                  <span className="workspace-selector__check">
                    <Check size={13} weight="bold" />
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <div className="workspace-selector__context">
          <div>
            <span>Ready to enter</span>
            <strong>
              {selectedOrganization?.name ?? "—"} / {selectedProject?.name ?? "—"}
            </strong>
            <p>The selected project becomes the scope for every dashboard operation.</p>
          </div>
          {selectedOrganization && selectedProject ? (
            <Link
              href={dashboardPath(selectedOrganization.slug, selectedProject.slug)}
              className="workspace-selector__enter"
            >
              Open project <ArrowRight size={16} />
            </Link>
          ) : null}
        </div>
      </div>
      {createOrgDialog}
    </WorkspaceShell>
  );
}
