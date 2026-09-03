"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Buildings,
  CaretDown,
  CaretRight,
  Check,
  CirclesFour,
  GearSix,
  House,
  List,
  SidebarSimple,
  SignOut,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import { useSignOut } from "@beaco/auth/react";
import { ThemeToggle } from "@beaco/theme";
import BrandLogo from "@/components/brand/brand-logo";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { dashboardPath } from "@/lib/dashboard-route";
import {
  readSidebarCollapsedPreference,
  rememberSidebarCollapsedPreference,
} from "@/lib/sidebar-preference";
import {
  AUXILIARY_ROUTES,
  CONFIGURE_NAV,
  OPERATE_NAV,
  stageTitleForSuffix,
  type DashboardNavItem,
} from "./dashboard-navigation";
import { useDashboardScope } from "./dashboard-scope-context";
import "./dashboard-shell.css";

type DashboardShellProps = Readonly<{
  children: React.ReactNode;
}>;

/**
 * Renders the authenticated application chrome for the organization and project
 * resolved by the dashboard layout, with the active route rendered in the stage.
 *
 * @param props Nested route content for the active surface.
 * @returns Dashboard navigation shell wrapping the routed surface.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  const { user, organization, project, projects } = useDashboardScope();
  const router = useRouter();
  const pathname = usePathname();
  const sidebarId = useId();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const signOut = useSignOut();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const currentDashboardPath = dashboardPath(organization.slug, project.slug);
  const accountSettingsPath = `${currentDashboardPath}/${AUXILIARY_ROUTES.accountSettings.path}`;
  const activeSuffix = pathname.startsWith(currentDashboardPath)
    ? pathname.slice(currentDashboardPath.length).replace(/^\//, "")
    : "";
  const stageTitle = stageTitleForSuffix(activeSuffix);
  const capabilities = new Set(organization.capabilities);
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
    if (!switcherOpen) return;

    function closeSwitcher(event: PointerEvent) {
      if (event.target instanceof Node && !switcherRef.current?.contains(event.target)) {
        setSwitcherOpen(false);
      }
    }

    function closeSwitcherOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSwitcherOpen(false);
    }

    document.addEventListener("pointerdown", closeSwitcher);
    window.addEventListener("keydown", closeSwitcherOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSwitcher);
      window.removeEventListener("keydown", closeSwitcherOnEscape);
    };
  }, [switcherOpen]);

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
    setSidebarPeeking(false);
    setSwitcherOpen(false);
    rememberSidebarCollapsedPreference(collapsed);
  }

  function toggleSwitcher() {
    if (sidebarCollapsed) {
      updateSidebarCollapsed(false);
      setSwitcherOpen(true);
      return;
    }
    setSwitcherOpen((open) => !open);
  }

  function renderNavItem(item: DashboardNavItem) {
    if (item.capability && !capabilities.has(item.capability)) return null;
    const isActive = activeSuffix === item.path;
    const Icon = item.icon;

    if (item.comingSoon) {
      return (
        <span key={item.label} aria-disabled="true">
          <Icon size={17} />
          <span>{item.label}</span>
          <small>soon</small>
        </span>
      );
    }

    const href = item.path ? `${currentDashboardPath}/${item.path}` : currentDashboardPath;
    return (
      <Link
        key={item.label}
        href={href}
        title={item.label}
        data-active={isActive || undefined}
        aria-current={isActive ? "page" : undefined}
        onClick={closeMobileSidebar}
      >
        <Icon size={17} />
        <span>{item.label}</span>
      </Link>
    );
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
            onClick={() => updateSidebarCollapsed(!sidebarCollapsed)}
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

        <div ref={switcherRef} className="dashboard-switcher" data-open={switcherOpen || undefined}>
          <button
            type="button"
            className="dashboard-switcher__trigger"
            aria-label={`Switch project. Current project: ${project.name}`}
            aria-expanded={switcherOpen}
            aria-controls={`${sidebarId}-switcher`}
            onClick={toggleSwitcher}
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
          {OPERATE_NAV.map(renderNavItem)}
          <p>Configure</p>
          {CONFIGURE_NAV.map(renderNavItem)}
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

        {children}
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
