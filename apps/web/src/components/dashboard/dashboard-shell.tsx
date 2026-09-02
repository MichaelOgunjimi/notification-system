"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BellRinging,
  Buildings,
  CaretDown,
  CaretRight,
  ChartLineUp,
  Check,
  CirclesFour,
  Code,
  EnvelopeSimple,
  GearSix,
  House,
  Key,
  List,
  ListBullets,
  PaperPlaneTilt,
  Pulse,
  SidebarSimple,
  SignOut,
  SquaresFour,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import type { User } from "@beaco/auth";
import { useSignOut } from "@beaco/auth/react";
import type { Organization, Project } from "@beaco/control-plane";
import { ThemeToggle } from "@beaco/theme";
import BrandLogo from "@/components/brand/brand-logo";
import { AccountSettings } from "@/components/settings/account-settings";
import { OrganizationSettings } from "@/components/settings/organization-settings";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { dashboardPath } from "@/lib/dashboard-route";
import {
  readSidebarCollapsedPreference,
  rememberSidebarCollapsedPreference,
} from "@/lib/sidebar-preference";
import "./dashboard-shell.css";

type DashboardShellProps = Readonly<{
  user: User;
  organization: Organization;
  project: Project;
  projects: Project[];
  surface?: "overview" | "account-settings" | "organization-settings";
}>;

const primaryNavigation = [
  { label: "Overview", icon: SquaresFour, active: true },
  { label: "Events", icon: Pulse, active: false },
  { label: "Templates", icon: Code, active: false },
  { label: "Delivery", icon: PaperPlaneTilt, active: false },
] as const;

const projectNavigation = [
  { label: "Organization", icon: Buildings, surface: "organization-settings" },
  { label: "API keys", icon: Key, surface: null },
  { label: "Activity log", icon: ListBullets, surface: null },
] as const;

/**
 * Renders the authenticated application chrome for one validated organization
 * and project, including a compact project switcher.
 *
 * @param props Validated user, organization, active project, and sibling projects.
 * @returns Dashboard navigation shell and context-aware overview surface.
 */
export function DashboardShell({
  user,
  organization,
  project,
  projects,
  surface = "overview",
}: DashboardShellProps) {
  const router = useRouter();
  const sidebarId = useId();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const signOut = useSignOut();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const currentDashboardPath = dashboardPath(organization.slug, project.slug);
  const accountSettingsPath = `${currentDashboardPath}/settings/account`;
  const stageTitle =
    surface === "account-settings"
      ? "Account settings"
      : surface === "organization-settings"
        ? "Organization settings"
        : "Overview";
  const organizationSettingsPath = `${currentDashboardPath}/settings/organization`;
  const userInitials = (user.name || user.email)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function closeAccountMenu(event: PointerEvent) {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }

    function closeAccountMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeAccountMenu);
    window.addEventListener("keydown", closeAccountMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeAccountMenu);
      window.removeEventListener("keydown", closeAccountMenuOnEscape);
    };
  }, [accountMenuOpen]);

  async function handleSignOut() {
    try {
      await signOut.mutateAsync();
      setSignOutDialogOpen(false);
      router.replace("/login");
    } catch {
      // The mutation exposes the recoverable error beside the account controls.
    }
  }

  function closeMobileSidebar() {
    setMobileSidebarOpen(false);
    setSwitcherOpen(false);
  }

  function updateSidebarCollapsed(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    rememberSidebarCollapsedPreference(collapsed);
  }

  return (
    <main
      id="main-content"
      className="dashboard-shell"
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-sidebar-peeking={sidebarPeeking || switcherOpen || undefined}
      data-mobile-sidebar-open={mobileSidebarOpen || undefined}
    >
      {mobileSidebarOpen ? (
        <button
          type="button"
          className="dashboard-sidebar__backdrop"
          aria-label="Close navigation"
          onClick={closeMobileSidebar}
        />
      ) : null}

      <aside
        id={sidebarId}
        className="dashboard-sidebar"
        aria-label="Dashboard navigation"
        onMouseLeave={() => setSidebarPeeking(false)}
      >
        <div className="dashboard-sidebar__brand">
          <Link href={currentDashboardPath} aria-label={`${project.name} dashboard overview`}>
            <BrandLogo
              priority
              className="dashboard-sidebar__logo"
              markClassName="size-8"
              labelClassName="text-[15px] font-semibold tracking-[-0.03em]"
            />
          </Link>
          <span>Control plane</span>
          <button
            type="button"
            className="dashboard-sidebar__collapse"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={sidebarCollapsed}
            onClick={() => {
              updateSidebarCollapsed(!sidebarCollapsed);
              setSidebarPeeking(false);
              setSwitcherOpen(false);
            }}
          >
            <SidebarSimple size={17} />
          </button>
          <button
            type="button"
            className="dashboard-sidebar__mobile-close"
            aria-label="Close navigation"
            onClick={closeMobileSidebar}
          >
            <X size={17} />
          </button>
        </div>

        <div className="dashboard-switcher" data-open={switcherOpen || undefined}>
          <button
            type="button"
            className="dashboard-switcher__trigger"
            aria-label={`Switch project. Current project: ${project.name}`}
            aria-expanded={switcherOpen}
            aria-controls={`${sidebarId}-switcher`}
            onClick={() => setSwitcherOpen((open) => !open)}
          >
            <span className="dashboard-switcher__icon">
              <Buildings size={16} />
            </span>
            <span className="dashboard-switcher__selection">
              <small>{organization.name}</small>
              <strong>{project.name}</strong>
            </span>
            <CaretDown size={14} />
          </button>
          {switcherOpen ? (
            <div id={`${sidebarId}-switcher`} className="dashboard-switcher__menu">
              <div className="dashboard-switcher__heading">
                <span>Projects</span>
                <strong>{organization.name}</strong>
              </div>
              <div className="dashboard-switcher__projects">
                {projects.map((candidate) => (
                  <Link
                    key={candidate.id}
                    href={dashboardPath(organization.slug, candidate.slug)}
                    data-active={candidate.id === project.id}
                    onClick={closeMobileSidebar}
                  >
                    <span className="dashboard-switcher__project-mark">
                      {candidate.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>{candidate.slug}</small>
                    </span>
                    {candidate.id === project.id ? <Check size={13} /> : <ArrowRight size={13} />}
                  </Link>
                ))}
              </div>
              <Link
                href="/workspace"
                className="dashboard-switcher__all"
                onClick={closeMobileSidebar}
              >
                <CirclesFour size={15} />
                <span>
                  <strong>Change workspace</strong>
                  <small>Organizations and projects</small>
                </span>
                <ArrowRight size={13} />
              </Link>
            </div>
          ) : null}
        </div>

        <nav className="dashboard-nav" aria-label="Project navigation">
          <p>Operate</p>
          {primaryNavigation.map(({ label, icon: Icon, active }) => {
            const isActive = active && surface === "overview";
            return (
              <Link
                key={label}
                href={active ? currentDashboardPath : currentDashboardPath}
                title={label}
                data-active={isActive || undefined}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={!active}
                tabIndex={active ? undefined : -1}
                onClick={(event) => {
                  if (!active) event.preventDefault();
                  closeMobileSidebar();
                }}
              >
                <Icon size={17} />
                <span>{label}</span>
                {!active ? <small>soon</small> : null}
              </Link>
            );
          })}
          <p>Configure</p>
          {projectNavigation.map(({ label, icon: Icon, surface: navigationSurface }) =>
            navigationSurface ? (
              <Link
                key={label}
                href={organizationSettingsPath}
                title={label}
                data-active={surface === navigationSurface || undefined}
                aria-current={surface === navigationSurface ? "page" : undefined}
                onClick={closeMobileSidebar}
              >
                <Icon size={17} />
                <span>{label}</span>
              </Link>
            ) : (
              <span key={label} aria-disabled="true">
                <Icon size={17} />
                <span>{label}</span>
                <small>soon</small>
              </span>
            ),
          )}
        </nav>

        <div className="dashboard-sidebar__identity">
          <span className="dashboard-sidebar__avatar">
            {user.avatarUrl ? (
              <Image
                unoptimized
                src={user.avatarUrl}
                alt=""
                aria-hidden="true"
                width={36}
                height={36}
              />
            ) : (
              <UserCircle size={22} />
            )}
          </span>
          <span className="dashboard-sidebar__user">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </span>
        </div>
      </aside>

      {sidebarCollapsed ? (
        <button
          type="button"
          className="dashboard-sidebar__edge-peek"
          aria-label="Preview sidebar"
          onMouseEnter={() => setSidebarPeeking(true)}
          onFocus={() => setSidebarPeeking(true)}
          onClick={() => updateSidebarCollapsed(false)}
        >
          <CaretRight size={13} />
        </button>
      ) : null}

      <section className="dashboard-stage">
        <header className="dashboard-stage__header">
          <div className="dashboard-stage__context">
            <button
              type="button"
              className="dashboard-stage__menu"
              aria-label="Open navigation"
              aria-controls={sidebarId}
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <List size={19} />
            </button>
            <div>
              <span>Project / {project.slug}</span>
              <strong>{stageTitle}</strong>
            </div>
          </div>
          <div className="dashboard-stage__actions">
            <ThemeToggle />
            <div
              ref={accountMenuRef}
              className="dashboard-account-menu"
              data-open={accountMenuOpen || undefined}
            >
              <button
                type="button"
                className="dashboard-account-menu__trigger"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((open) => !open)}
              >
                <span>
                  {user.avatarUrl ? (
                    <Image
                      unoptimized
                      src={user.avatarUrl}
                      alt=""
                      aria-hidden="true"
                      width={28}
                      height={28}
                    />
                  ) : (
                    userInitials
                  )}
                </span>
                <CaretDown size={12} />
              </button>

              {accountMenuOpen ? (
                <div className="dashboard-account-menu__popover" role="menu">
                  <div className="dashboard-account-menu__identity" role="presentation">
                    <span>
                      {user.avatarUrl ? (
                        <Image
                          unoptimized
                          src={user.avatarUrl}
                          alt=""
                          aria-hidden="true"
                          width={34}
                          height={34}
                        />
                      ) : (
                        userInitials
                      )}
                    </span>
                    <div>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </div>
                  </div>

                  <div className="dashboard-account-menu__items">
                    <Link
                      href={accountSettingsPath}
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <GearSix size={16} />
                      <span>
                        <strong>Account settings</strong>
                        <small>Profile and connections</small>
                      </span>
                    </Link>
                    <Link
                      href="/workspace"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <Buildings size={16} />
                      <span>
                        <strong>Switch workspace</strong>
                        <small>Organizations and projects</small>
                      </span>
                    </Link>
                    <Link href="/" role="menuitem" onClick={() => setAccountMenuOpen(false)}>
                      <House size={16} />
                      <span>
                        <strong>Visit public site</strong>
                        <small>Return to Beaco</small>
                      </span>
                    </Link>
                  </div>

                  <button
                    type="button"
                    className="dashboard-account-menu__signout"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setSignOutDialogOpen(true);
                    }}
                  >
                    <SignOut size={16} />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {surface === "account-settings" ? (
          <AccountSettings user={user} returnPath={accountSettingsPath} />
        ) : surface === "organization-settings" ? (
          <OrganizationSettings
            key={organization.id}
            userId={user.id}
            organization={organization}
            project={project}
            projects={projects}
          />
        ) : (
          <div className="dashboard-overview">
            <div className="dashboard-overview__heading">
              <div>
                <p>Operational workspace</p>
                <h1>{project.name}</h1>
              </div>
              <span className="dashboard-overview__status">
                <i /> Context verified
              </span>
            </div>

            <section className="dashboard-overview__intro">
              <div>
                <span className="dashboard-overview__index">01 / Foundation</span>
                <h2>Your delivery surface starts here.</h2>
                <p>
                  This shell is now scoped to {organization.name} / {project.name}. The next
                  dashboard modules can consume this canonical context without relying on temporary
                  selection state.
                </p>
              </div>
              <div className="dashboard-overview__route" aria-label="Notification delivery path">
                <span>
                  <Code size={17} /> Event
                </span>
                <i />
                <span>
                  <BellRinging size={17} /> Beaco
                </span>
                <i />
                <span>
                  <EnvelopeSimple size={17} /> Channel
                </span>
              </div>
            </section>

            <div className="dashboard-overview__grid">
              <article>
                <span>
                  <Pulse size={18} /> Live context
                </span>
                <strong>URL-backed scope</strong>
                <p>
                  Organization and project slugs can now survive reloads, links, and browser tabs.
                </p>
              </article>
              <article>
                <span>
                  <Key size={18} /> Session boundary
                </span>
                <strong>Credentials stay server-side</strong>
                <p>The dashboard continues through the cookie-backed application boundary.</p>
              </article>
              <article>
                <span>
                  <ChartLineUp size={18} /> Next module
                </span>
                <strong>Real delivery data</strong>
                <p>Events and delivery status will replace this foundation panel next.</p>
              </article>
            </div>
          </div>
        )}
      </section>

      <AppDialog
        open={signOutDialogOpen}
        onOpenChange={(open) => {
          if (signOut.isPending) return;
          setSignOutDialogOpen(open);
          if (!open) signOut.reset();
        }}
        eyebrow="Session control"
        title="Sign out of Beaco?"
        description="You’ll need another magic link or GitHub sign-in to return to this dashboard. Your projects and delivery data will remain unchanged."
        busy={signOut.isPending}
        footer={
          <>
            <DialogAction disabled={signOut.isPending} onClick={() => setSignOutDialogOpen(false)}>
              Stay signed in
            </DialogAction>
            <DialogAction tone="danger" disabled={signOut.isPending} onClick={handleSignOut}>
              <SignOut size={16} />
              {signOut.isPending ? "Signing out" : "Sign out"}
            </DialogAction>
          </>
        }
      >
        {signOut.isError ? (
          <p className="app-dialog__error" role="alert">
            {signOut.error.message}
          </p>
        ) : null}
      </AppDialog>
    </main>
  );
}
