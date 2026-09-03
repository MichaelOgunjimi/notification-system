"use client";

import { BellRinging, ChartLineUp, Code, EnvelopeSimple, Key, Pulse } from "@phosphor-icons/react";
import { useDashboardScope } from "./dashboard-scope-context";

/**
 * Renders the project overview surface for the resolved dashboard scope.
 *
 * @returns Foundation overview panel until real delivery modules replace it.
 */
export function DashboardOverview() {
  const { organization, project } = useDashboardScope();

  return (
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
            modules can consume this canonical context without relying on temporary selection state.
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
          <p>Organization and project slugs can now survive reloads, links, and browser tabs.</p>
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
  );
}
