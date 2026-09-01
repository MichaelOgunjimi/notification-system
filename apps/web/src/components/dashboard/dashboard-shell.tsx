import Link from "next/link";
import {
  ArrowRight,
  BellRinging,
  Buildings,
  CaretDown,
  ChartLineUp,
  Check,
  CirclesFour,
  Code,
  EnvelopeSimple,
  Key,
  ListBullets,
  PaperPlaneTilt,
  Pulse,
  SquaresFour,
  UserCircle,
} from "@phosphor-icons/react";
import type { User } from "@beaco/auth";
import type { Organization, Project } from "@beaco/control-plane";
import { ThemeToggle } from "@beaco/theme";
import BrandLogo from "@/components/brand/brand-logo";
import { dashboardPath } from "@/lib/dashboard-route";
import "./dashboard-shell.css";

type DashboardShellProps = Readonly<{
  user: User;
  organization: Organization;
  project: Project;
  projects: Project[];
}>;

const primaryNavigation = [
  { label: "Overview", icon: SquaresFour, active: true },
  { label: "Events", icon: Pulse, active: false },
  { label: "Templates", icon: Code, active: false },
  { label: "Delivery", icon: PaperPlaneTilt, active: false },
] as const;

const projectNavigation = [
  { label: "API keys", icon: Key },
  { label: "Activity log", icon: ListBullets },
] as const;

/**
 * Renders the authenticated application chrome for one validated organization
 * and project, including a compact project switcher.
 *
 * @param props Validated user, organization, active project, and sibling projects.
 * @returns Dashboard navigation shell and context-aware overview surface.
 */
export function DashboardShell({ user, organization, project, projects }: DashboardShellProps) {
  return (
    <main id="main-content" className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar__brand">
          <Link href="/" aria-label="Beaco home">
            <BrandLogo
              priority
              markClassName="size-8"
              labelClassName="text-[15px] font-semibold tracking-[-0.03em]"
            />
          </Link>
          <span>Control plane</span>
        </div>

        <details className="dashboard-switcher">
          <summary>
            <span className="dashboard-switcher__icon">
              <Buildings size={16} />
            </span>
            <span>
              <small>{organization.name}</small>
              <strong>{project.name}</strong>
            </span>
            <CaretDown size={14} />
          </summary>
          <div className="dashboard-switcher__menu">
            <p>Projects in {organization.name}</p>
            {projects.map((candidate) => (
              <Link
                key={candidate.id}
                href={dashboardPath(organization.slug, candidate.slug)}
                data-active={candidate.id === project.id}
              >
                <span>{candidate.name}</span>
                {candidate.id === project.id ? <Check size={13} /> : <ArrowRight size={13} />}
              </Link>
            ))}
            <Link href="/workspace" className="dashboard-switcher__all">
              <CirclesFour size={14} /> Change organization
            </Link>
          </div>
        </details>

        <nav className="dashboard-nav" aria-label="Project navigation">
          <p>Operate</p>
          {primaryNavigation.map(({ label, icon: Icon, active }) => (
            <span
              key={label}
              data-active={active || undefined}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={16} /> {label}
              {!active ? <small>soon</small> : null}
            </span>
          ))}
          <p>Configure</p>
          {projectNavigation.map(({ label, icon: Icon }) => (
            <span key={label}>
              <Icon size={16} /> {label}
              <small>soon</small>
            </span>
          ))}
        </nav>

        <div className="dashboard-sidebar__identity">
          <UserCircle size={24} />
          <span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </span>
        </div>
      </aside>

      <section className="dashboard-stage">
        <header className="dashboard-stage__header">
          <div>
            <span>Project / {project.slug}</span>
            <strong>Overview</strong>
          </div>
          <ThemeToggle />
        </header>

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
                This shell is now scoped to {organization.name} / {project.name}. The next dashboard
                modules can consume this canonical context without relying on temporary selection
                state.
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
      </section>
    </main>
  );
}
