"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useSession } from "@beaco/auth/react";
import { useOrganizations, useProjects } from "@beaco/control-plane/react";
import { DashboardShell } from "./dashboard-shell";
import { dashboardPath, rememberDashboardPath } from "@/lib/dashboard-route";
import "./dashboard-context.css";

type DashboardContextProps = Readonly<{
  organizationSlug: string;
  projectSlug: string;
}>;

function DashboardContextMessage({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <main className="dashboard-context-message">
      <div className="dashboard-context-message__panel">
        <WarningCircle size={24} />
        <p className="dashboard-context-message__kicker">Context unavailable</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link href={href}>
          {action} <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  );
}

/**
 * Validates URL slugs against the authenticated user's live memberships before
 * rendering the dashboard shell.
 *
 * @param props Organization and project slugs carried by the canonical route.
 * @returns Loading, recovery, or validated dashboard UI.
 */
export function DashboardContext({ organizationSlug, projectSlug }: DashboardContextProps) {
  const session = useSession();
  const organizations = useOrganizations(session.status === "authenticated");
  const organization = organizations.data?.find((item) => item.slug === organizationSlug);
  const projects = useProjects(organization?.id ?? null);
  const project = projects.data?.find((item) => item.slug === projectSlug);
  const userId = session.user?.id;
  const validatedPath =
    organization && project ? dashboardPath(organization.slug, project.slug) : null;

  useEffect(() => {
    if (!userId || !validatedPath) return;
    rememberDashboardPath(userId, validatedPath);
  }, [userId, validatedPath]);

  if (session.status === "loading") {
    return (
      <main className="dashboard-context-loading" aria-live="polite">
        <SpinnerGap size={18} className="animate-spin" /> Resolving project context
      </main>
    );
  }

  if (!session.user) {
    return (
      <DashboardContextMessage
        title="Your session has ended."
        description="Sign in again before entering this protected project."
        href="/login"
        action="Return to sign in"
      />
    );
  }

  if (organizations.isPending) {
    return (
      <main className="dashboard-context-loading" aria-live="polite">
        <SpinnerGap size={18} className="animate-spin" /> Resolving project context
      </main>
    );
  }

  if (organizations.isError) {
    return (
      <DashboardContextMessage
        title="We could not verify your organizations."
        description={organizations.error.message}
        href="/workspace"
        action="Return to workspace"
      />
    );
  }

  if (!organization) {
    return (
      <DashboardContextMessage
        title="This organization is not available."
        description="It may have been archived, renamed, or removed from your membership."
        href="/workspace"
        action="Choose another workspace"
      />
    );
  }

  if (projects.isPending) {
    return (
      <main className="dashboard-context-loading" aria-live="polite">
        <SpinnerGap size={18} className="animate-spin" /> Loading {organization.name}
      </main>
    );
  }

  if (projects.isError || !project) {
    return (
      <DashboardContextMessage
        title="This project is not available."
        description={
          projects.isError
            ? projects.error.message
            : "It may have been archived or moved to another organization."
        }
        href="/workspace"
        action="Choose another project"
      />
    );
  }

  return (
    <DashboardShell
      user={session.user}
      organization={organization}
      project={project}
      projects={projects.data}
    />
  );
}
