"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowRight,
  Buildings,
  Check,
  FolderSimple,
  Plus,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import {
  useOrganizations,
  useProjects,
  useRestoreOrganization,
  useRestoreProject,
} from "@beaco/control-plane/react";
import type { Organization, Project } from "@beaco/control-plane";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { SessionRecovery } from "@/components/auth/session-recovery";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { dashboardPath } from "@/lib/dashboard-route";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import { CreateProjectDialog } from "./create-project-dialog";
import { WorkspaceShell } from "./workspace-shell";
import "./workspace-selector.css";

type RestoreTarget =
  | { kind: "organization"; id: string; name: string }
  | { kind: "project"; id: string; organizationId: string; name: string };

/** Disclosure listing archived organizations or projects, each restorable on its own. */
function ArchivedSection({
  label,
  items,
  onRestore,
}: {
  label: string;
  items: ReadonlyArray<{ id: string; name: string; slug: string }>;
  onRestore: (id: string, name: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <details className="workspace-selector__archived">
      <summary>
        <Archive size={13} />
        {label} ({items.length})
      </summary>
      <div className="workspace-selector__archived-list">
        {items.map((item) => (
          <div key={item.id} className="workspace-selector__archived-row">
            <span className="min-w-0 flex-1">
              <strong>{item.name}</strong>
              <small>{item.slug}</small>
            </span>
            <button type="button" onClick={() => onRestore(item.id, item.name)}>
              <ArrowCounterClockwise size={13} />
              Restore
            </button>
          </div>
        ))}
      </div>
    </details>
  );
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

function WorkspaceSelectorSkeleton() {
  return (
    <WorkspaceShell>
      <div className="workspace-selector workspace-selector__skeleton" aria-busy="true">
        <span className="sr-only" role="status">
          Loading workspace context
        </span>
        <Skeleton className="workspace-selector__skeleton-eyebrow" />
        <Skeleton className="workspace-selector__skeleton-title" />
        <Skeleton className="workspace-selector__skeleton-intro" />
        {["organization", "project"].map((section) => (
          <div className="workspace-selector__section" key={section} aria-hidden="true">
            <div className="workspace-selector__skeleton-heading">
              <Skeleton />
              <div>
                <Skeleton />
                <Skeleton />
              </div>
            </div>
            <div className="workspace-selector__skeleton-options">
              <Skeleton />
              <Skeleton />
            </div>
          </div>
        ))}
      </div>
    </WorkspaceShell>
  );
}

/**
 * Loads the authenticated user's organizations and projects and routes a valid
 * selection into the canonical dashboard URL, with modal recovery for the
 * no-organization and no-project states.
 *
 * @returns Workspace selection interface with authenticated loading and error states.
 */
export function WorkspaceSelector() {
  const session = useSession();
  const toast = useToast();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const restoreOrganization = useRestoreOrganization();
  const restoreProject = useRestoreProject();
  const restoreMutation =
    restoreTarget?.kind === "organization" ? restoreOrganization : restoreProject;

  const organizations = useOrganizations(session.status === "authenticated", true);
  const activeOrganizations = organizations.data?.filter((org) => !org.archivedAt) ?? [];
  const archivedOrganizations = organizations.data?.filter((org) => org.archivedAt) ?? [];
  const activeOrganizationId = activeOrganizations.some(
    (organization) => organization.id === organizationId,
  )
    ? organizationId
    : (activeOrganizations[0]?.id ?? null);
  const projects = useProjects(activeOrganizationId, true);
  const activeProjects = projects.data?.filter((project) => !project.archivedAt) ?? [];
  const archivedProjects = projects.data?.filter((project) => project.archivedAt) ?? [];
  const activeProjectId = activeProjects.some((project) => project.id === projectId)
    ? projectId
    : (activeProjects[0]?.id ?? null);

  async function handleRestore() {
    if (!restoreTarget) return;
    try {
      if (restoreTarget.kind === "organization") {
        await restoreOrganization.mutateAsync({ organizationId: restoreTarget.id });
        setOrganizationId(restoreTarget.id);
      } else {
        await restoreProject.mutateAsync({
          organizationId: restoreTarget.organizationId,
          projectId: restoreTarget.id,
        });
        setProjectId(restoreTarget.id);
      }
      toast.success(`${restoreTarget.name} restored`);
      setRestoreTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to restore this");
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

  const createProjectDialog =
    createProjectOpen && activeOrganizationId ? (
      <CreateProjectDialog
        open
        organizationId={activeOrganizationId}
        onOpenChange={setCreateProjectOpen}
        onCreated={(project) => {
          setProjectId(project.id);
          setCreateProjectOpen(false);
        }}
      />
    ) : null;

  const restoreDialog = (
    <AppDialog
      open={restoreTarget !== null}
      onOpenChange={(open) => {
        if (!open && !restoreMutation.isPending) setRestoreTarget(null);
      }}
      eyebrow={restoreTarget?.kind === "organization" ? "Organizations" : "Projects"}
      title={`Restore ${restoreTarget?.name ?? "this"}?`}
      description={
        restoreTarget?.kind === "organization"
          ? "This brings the organization back. Any projects archived along with it stay archived until restored on their own."
          : "This brings the project back into the active list."
      }
      busy={restoreMutation.isPending}
      footer={
        <>
          <DialogAction disabled={restoreMutation.isPending} onClick={() => setRestoreTarget(null)}>
            Cancel
          </DialogAction>
          <DialogAction disabled={restoreMutation.isPending} onClick={handleRestore}>
            {restoreMutation.isPending ? "Restoring…" : "Restore"}
          </DialogAction>
        </>
      }
    />
  );

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
    return <WorkspaceSelectorSkeleton />;
  }
  if (organizations.isError && !organizations.data) {
    return (
      <WorkspaceError
        message={organizations.error.message}
        retry={() => void organizations.refetch()}
      />
    );
  }
  if (activeOrganizations.length === 0) {
    return (
      <WorkspaceShell>
        <div className="workspace-selector workspace-selector--message">
          <span className="workspace-selector__message-icon">
            <Buildings size={24} />
          </span>
          <h2>Create your first organization</h2>
          <p>
            An organization holds your team, projects, and billing. Its first project is created
            alongside it.
          </p>
          <button
            type="button"
            className="workspace-selector__primary"
            onClick={() => setCreateOrgOpen(true)}
          >
            <span>Create organization</span>
            <ArrowRight size={17} />
          </button>
          <ArchivedSection
            label="Archived organizations"
            items={archivedOrganizations}
            onRestore={(id, name) => setRestoreTarget({ kind: "organization", id, name })}
          />
        </div>
        {createOrgDialog}
        {restoreDialog}
      </WorkspaceShell>
    );
  }

  const selectedOrganization = activeOrganizations.find(
    (organization) => organization.id === activeOrganizationId,
  );
  const selectedProject = activeProjects.find((project) => project.id === activeProjectId);
  const organizationHasNoProjects = activeProjects.length === 0;

  return (
    <WorkspaceShell>
      <div className="workspace-selector" aria-busy={organizations.isFetching || undefined}>
        <div className="workspace-selector__eyebrow">
          <Check size={13} weight="bold" /> {session.user.email}
        </div>
        <h2>Select a project</h2>
        <p className="workspace-selector__intro">
          Choose the organization and project that should scope this workspace view.
        </p>
        {organizations.isError ? (
          <p className="workspace-selector__refresh-error" role="alert">
            <WarningCircle size={15} /> {organizations.error.message}
            <button type="button" onClick={() => void organizations.refetch()}>
              Retry
            </button>
          </p>
        ) : null}

        <section className="workspace-selector__section" aria-labelledby="organization-heading">
          <div className="workspace-selector__section-heading">
            <span className="workspace-selector__step">01</span>
            <div>
              <h3 id="organization-heading">Organization</h3>
              <p>{activeOrganizations.length} available</p>
            </div>
          </div>
          <div className="workspace-selector__options">
            {activeOrganizations.map((organization: Organization) => (
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
          <ArchivedSection
            label="Archived organizations"
            items={archivedOrganizations}
            onRestore={(id, name) => setRestoreTarget({ kind: "organization", id, name })}
          />
        </section>

        <section
          className="workspace-selector__section"
          aria-labelledby="project-heading"
          aria-busy={projects.isFetching || undefined}
        >
          <div className="workspace-selector__section-heading">
            <span className="workspace-selector__step">02</span>
            <div>
              <h3 id="project-heading">Project</h3>
              <p>{selectedOrganization?.name}</p>
            </div>
          </div>
          {projects.isPending ? (
            <div className="workspace-selector__skeleton-options" aria-busy="true">
              <span className="sr-only" role="status">
                Loading projects
              </span>
              <Skeleton />
              <Skeleton />
            </div>
          ) : projects.isError && !projects.data ? (
            <button
              type="button"
              className="workspace-selector__loading"
              onClick={() => void projects.refetch()}
            >
              <WarningCircle size={16} /> {projects.error.message} · Retry
            </button>
          ) : organizationHasNoProjects ? (
            <div className="workspace-selector__empty-projects">
              <p>
                <FolderSimple size={15} /> This organization has no projects yet. Create one to
                continue.
              </p>
              <button type="button" onClick={() => setCreateProjectOpen(true)}>
                <Plus size={14} weight="bold" /> Create a project
              </button>
              {activeOrganizationId ? (
                <ArchivedSection
                  label="Archived projects"
                  items={archivedProjects}
                  onRestore={(id, name) =>
                    setRestoreTarget({
                      kind: "project",
                      id,
                      organizationId: activeOrganizationId,
                      name,
                    })
                  }
                />
              ) : null}
            </div>
          ) : (
            <div
              className="workspace-selector__options"
              aria-busy={projects.isFetching || undefined}
            >
              {activeProjects.map((project: Project) => (
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
              <button
                type="button"
                className="workspace-selector__add"
                onClick={() => setCreateProjectOpen(true)}
              >
                <Plus size={14} weight="bold" /> New project
              </button>
            </div>
          )}
          {!organizationHasNoProjects && activeOrganizationId ? (
            <ArchivedSection
              label="Archived projects"
              items={archivedProjects}
              onRestore={(id, name) =>
                setRestoreTarget({
                  kind: "project",
                  id,
                  organizationId: activeOrganizationId,
                  name,
                })
              }
            />
          ) : null}
          {projects.isError && projects.data ? (
            <p className="workspace-selector__refresh-error" role="alert">
              <WarningCircle size={15} /> {projects.error.message}
              <button type="button" onClick={() => void projects.refetch()}>
                Retry
              </button>
            </p>
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
      {createProjectDialog}
      {restoreDialog}
    </WorkspaceShell>
  );
}
