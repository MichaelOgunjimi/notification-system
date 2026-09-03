"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@beaco/auth/react";
import { useOrganizations, useProjects } from "@beaco/control-plane/react";
import { SessionRecovery } from "@/components/auth/session-recovery";
import { FullPageLoading } from "@/components/ui/full-page-loading";
import { useToast } from "@/components/ui/toast";
import { dashboardPath, rememberDashboardPath } from "@/lib/dashboard-route";
import { DashboardShell } from "./dashboard-shell";
import { DashboardScopeProvider } from "./dashboard-scope-context";

type DashboardScopeProps = Readonly<{
  organizationSlug: string;
  projectSlug: string;
  children: React.ReactNode;
}>;

/**
 * Validates the URL organization and project slugs against the authenticated
 * user's live memberships, then provides the resolved scope to nested routes.
 *
 * Unresolvable scope is not a dead end: the user is sent to `/workspace`, the
 * canonical surface for choosing an organization and project, with a toast
 * explaining which resource went missing.
 *
 * @param props Route slugs and the routed surface to render once resolved.
 * @returns Loading, session recovery, or the dashboard shell wrapping the surface.
 */
export function DashboardScope({ organizationSlug, projectSlug, children }: DashboardScopeProps) {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const organizations = useOrganizations(session.status === "authenticated");
  const organization = organizations.data?.find((item) => item.slug === organizationSlug);
  const projects = useProjects(organization?.id ?? null);
  const project = projects.data?.find((item) => item.slug === projectSlug);
  const userId = session.user?.id;
  const validatedPath =
    organization && project ? dashboardPath(organization.slug, project.slug) : null;

  // Only conclude a slug is missing once the query is both fresh and idle.
  // Right after creating or renaming an org/project the query is invalidated:
  // it briefly reports success with stale data that does not yet reflect the
  // change, and there is a render tick before `isFetching` flips — `isStale`
  // covers that window because invalidation marks it synchronously.
  const organizationsSettled =
    organizations.isSuccess && !organizations.isFetching && !organizations.isStale;
  const projectsSettled = projects.isSuccess && !projects.isFetching && !projects.isStale;
  const organizationMissing = organizationsSettled && !organization;
  const projectMissing = Boolean(organization) && projectsSettled && !project;
  const connectionFailed = organizations.isError || (Boolean(organization) && projects.isError);

  const redirectTo =
    session.status === "anonymous"
      ? "/login"
      : organizationMissing || projectMissing || connectionFailed
        ? "/workspace"
        : null;
  const redirectNotice = organizationMissing
    ? `The organization “${organizationSlug}” isn’t available — it may have been archived, or your access was removed.`
    : projectMissing
      ? `The project “${projectSlug}” isn’t available — it may have been archived or moved. Pick another below.`
      : null;

  // A slug can look missing for a beat right after a create/rename while caches
  // settle. Hold the redirect for a short grace period and only fire it if the
  // scope is still unresolved — the shell keeps this mounted across slug
  // changes, so the guard resets whenever scope becomes healthy again.
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!redirectTo) {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;
    const timer = setTimeout(() => {
      redirectedRef.current = true;
      if (redirectNotice) toast.error(redirectNotice);
      router.replace(redirectTo);
    }, 600);
    return () => clearTimeout(timer);
  }, [redirectTo, redirectNotice, router, toast]);

  useEffect(() => {
    if (!userId || !validatedPath) return;
    rememberDashboardPath(userId, validatedPath);
  }, [userId, validatedPath]);

  if (session.status === "error") {
    return <SessionRecovery fullPage onRetry={() => void session.refresh()} />;
  }

  if (redirectTo === "/login") {
    return <FullPageLoading label="Redirecting to sign in" />;
  }

  if (redirectTo) {
    return <FullPageLoading label="Returning to workspace" />;
  }

  if (session.status === "loading" || organizations.isPending) {
    return <FullPageLoading label="Loading workspace" />;
  }

  if (!session.user || !organization || !projects.data || !project) {
    return <FullPageLoading label={`Loading ${organization?.name ?? "workspace"}`} />;
  }

  return (
    <DashboardScopeProvider
      value={{ user: session.user, organization, project, projects: projects.data }}
    >
      <DashboardShell>{children}</DashboardShell>
    </DashboardScopeProvider>
  );
}
