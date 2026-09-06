"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CaretRight,
  Check,
  CirclesFour,
  GearSix,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import type { User } from "@beaco/auth";
import type { Organization, Project } from "@beaco/control-plane";
import { dashboardPath } from "@/lib/dashboard-route";
import { CONFIGURE_NAV, OPERATE_NAV, type DashboardNavItem } from "./dashboard-navigation";
import "./mobile-nav-sheet.css";

/** Props for {@link MobileNavSheet}. */
type MobileNavSheetProps = Readonly<{
  open: boolean;
  onClose: () => void;
  user: User;
  organization: Organization;
  project: Project;
  projects: readonly Project[];
  /** `/app/{orgSlug}/{projectSlug}` — the active project's route root. */
  currentDashboardPath: string;
  /** Path segment after the project root, e.g. `"usage"` or `""` for the overview. */
  activeSuffix: string;
  /** Dashboard-scoped account settings path. */
  accountSettingsPath: string;
}>;

type Panel = "root" | "projects";

/**
 * The mobile replacement for the desktop sidebar: a near-full-height sheet
 * that slides up over the current page. The root panel carries the user
 * context and every navigation destination; contextual choices (switching
 * project) slide a second panel into the same sheet behind a Back button —
 * never a stacked modal. The current project stays marked while moving
 * between panels.
 *
 * @param props Visibility, the resolved dashboard scope, and the active route.
 * @returns The navigation sheet.
 */
export function MobileNavSheet({
  open,
  onClose,
  user,
  organization,
  project,
  projects,
  currentDashboardPath,
  activeSuffix,
  accountSettingsPath,
}: MobileNavSheetProps) {
  const [panel, setPanel] = useState<Panel>("root");
  const capabilities = new Set(organization.capabilities);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(1);

  /** Distance past which releasing the drag dismisses instead of snapping back. */
  const dismissThreshold = 120;

  function handleDragStart(event: ReactPointerEvent<HTMLElement>) {
    dragStartY.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: ReactPointerEvent<HTMLElement>) {
    if (dragStartY.current === null) return;
    setDragY(Math.max(0, event.clientY - dragStartY.current));
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLElement>) {
    if (dragStartY.current === null) return;
    const distance = Math.max(0, event.clientY - dragStartY.current);
    dragStartY.current = null;
    setDragging(false);
    setDragY(0);
    if (distance > dismissThreshold) onClose();
  }

  useEffect(() => {
    if (!open) {
      // Re-arm the root panel for the next open once the slide-down finishes.
      const timer = window.setTimeout(() => {
        setPanel("root");
        setDragY(0);
        setDragging(false);
        dragStartY.current = null;
      }, 240);
      return () => window.clearTimeout(timer);
    }
    if (surfaceRef.current) setSheetHeight(surfaceRef.current.offsetHeight);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  function renderNavItem(item: DashboardNavItem) {
    if (item.capability && !capabilities.has(item.capability)) return null;
    const Icon = item.icon;

    if (item.comingSoon) {
      return (
        <span key={item.label} className="mobile-nav-sheet__row" aria-disabled="true">
          <Icon size={18} />
          <span>{item.label}</span>
          <small>soon</small>
        </span>
      );
    }

    const href = item.path ? `${currentDashboardPath}/${item.path}` : currentDashboardPath;
    const isActive = activeSuffix === item.path;
    return (
      <Link
        key={item.label}
        href={href}
        className="mobile-nav-sheet__row"
        data-active={isActive || undefined}
        aria-current={isActive ? "page" : undefined}
        onClick={onClose}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="mobile-nav-sheet" data-open={open || undefined}>
      <button
        type="button"
        className="mobile-nav-sheet__scrim"
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        style={dragging ? { opacity: Math.max(0, 1 - dragY / sheetHeight) } : undefined}
      />
      <div
        ref={surfaceRef}
        className="mobile-nav-sheet__surface"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!open}
        style={
          dragY > 0
            ? { transform: `translateY(${dragY}px)`, transition: dragging ? "none" : undefined }
            : undefined
        }
      >
        <div
          className="mobile-nav-sheet__handle"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <span className="mobile-nav-sheet__grabber" aria-hidden />
        </div>
        <div className="mobile-nav-sheet__viewport">
          <div className="mobile-nav-sheet__track" data-panel={panel}>
            <section
              className="mobile-nav-sheet__panel"
              aria-hidden={panel !== "root"}
              inert={panel !== "root"}
            >
              <div className="mobile-nav-sheet__identity">
                <span className="mobile-nav-sheet__avatar">
                  {user.avatarUrl ? (
                    <Image
                      unoptimized
                      src={user.avatarUrl}
                      alt=""
                      aria-hidden="true"
                      width={40}
                      height={40}
                    />
                  ) : (
                    <UserCircle size={26} />
                  )}
                </span>
                <span className="mobile-nav-sheet__identity-text">
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <button
                  type="button"
                  className="mobile-nav-sheet__close"
                  aria-label="Close navigation"
                  onClick={onClose}
                >
                  <X size={17} />
                </button>
              </div>

              <button
                type="button"
                className="mobile-nav-sheet__switcher"
                onClick={() => setPanel("projects")}
              >
                <span className="mobile-nav-sheet__switcher-icon">
                  <Buildings size={17} />
                </span>
                <span className="mobile-nav-sheet__switcher-selection">
                  <small>{organization.name}</small>
                  <strong>{project.name}</strong>
                </span>
                <CaretRight size={15} />
              </button>

              <nav className="mobile-nav-sheet__nav" aria-label="Project navigation">
                <p>Operate</p>
                {OPERATE_NAV.map(renderNavItem)}
                <p>Configure</p>
                {CONFIGURE_NAV.map(renderNavItem)}
              </nav>

              <div className="mobile-nav-sheet__footer">
                <Link
                  href={accountSettingsPath}
                  className="mobile-nav-sheet__row"
                  onClick={onClose}
                >
                  <GearSix size={18} />
                  <span>Account settings</span>
                </Link>
                <Link href="/workspace" className="mobile-nav-sheet__row" onClick={onClose}>
                  <CirclesFour size={18} />
                  <span>Change workspace</span>
                </Link>
              </div>
            </section>

            <section
              className="mobile-nav-sheet__panel"
              aria-hidden={panel !== "projects"}
              inert={panel !== "projects"}
            >
              <div className="mobile-nav-sheet__panel-head">
                <button
                  type="button"
                  className="mobile-nav-sheet__back"
                  onClick={() => setPanel("root")}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <strong>{organization.name}</strong>
              </div>

              <div className="mobile-nav-sheet__projects">
                {projects.map((candidate) => (
                  <Link
                    key={candidate.id}
                    href={dashboardPath(organization.slug, candidate.slug)}
                    className="mobile-nav-sheet__project"
                    data-active={candidate.id === project.id || undefined}
                    onClick={onClose}
                  >
                    <span className="mobile-nav-sheet__project-mark">
                      {candidate.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="mobile-nav-sheet__project-text">
                      <strong>{candidate.name}</strong>
                      <small>{candidate.slug}</small>
                    </span>
                    {candidate.id === project.id ? <Check size={14} /> : <ArrowRight size={14} />}
                  </Link>
                ))}
              </div>

              <Link href="/workspace" className="mobile-nav-sheet__row" onClick={onClose}>
                <CirclesFour size={18} />
                <span>All organizations &amp; projects</span>
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
