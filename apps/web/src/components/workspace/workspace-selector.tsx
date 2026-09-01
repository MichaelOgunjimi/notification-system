"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Buildings,
  Check,
  FolderSimple,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { useOrganizations, useProjects } from "@beaco/control-plane/react";
import type { Organization, Project } from "@beaco/control-plane";
import { SessionRecovery } from "@/components/auth/session-recovery";
import { dashboardPath } from "@/lib/dashboard-route";
import { WorkspaceShell } from "./workspace-shell";
import "./workspace-selector.css";

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
 * selection into the canonical dashboard URL.
 *
 * @returns Workspace selection interface with authenticated loading and error states.
 */
export function WorkspaceSelector() {
  const session = useSession();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
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
      <WorkspaceError
        message="No active organization is attached to this account."
        retry={() => void organizations.refetch()}
      />
    );
  }

  const selectedOrganization = organizations.data.find(
    (organization) => organization.id === activeOrganizationId,
  );
  const selectedProject = projects.data?.find((project) => project.id === activeProjectId);

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
          ) : (
            <div className="workspace-selector__options">
              {projects.data?.length ? (
                projects.data.map((project: Project) => (
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
                ))
              ) : (
                <div className="workspace-selector__loading">
                  <FolderSimple size={16} /> No active projects in this organization
                </div>
              )}
            </div>
          )}
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
    </WorkspaceShell>
  );
}
