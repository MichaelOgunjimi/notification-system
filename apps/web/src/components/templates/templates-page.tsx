"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretRight, ChatText, Code, Envelope, Globe, Plus } from "@phosphor-icons/react";
import type { Organization, Project, Template, TemplateChannel } from "@beaco/control-plane";
import {
  useForkProjectTemplate,
  useOrganizationTemplateDefaults,
  useOrganizationTemplates,
  useProjectTemplateDefaults,
  useProjectTemplates,
} from "@beaco/control-plane/react";
import { AppSelect } from "@/components/ui/app-select";
import { TablePager } from "@/components/ui/table-pager";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/audit-log";
import { TemplateFormDialog } from "./template-form-dialog";
import "./templates-page.css";

/** Props for {@link TemplatesPage}. */
type TemplatesPageProps = Readonly<{
  organization: Organization;
  project: Project;
  projects: readonly Project[];
}>;

const PER_PAGE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PER_PAGE = PER_PAGE_OPTIONS[1];

const CHANNEL_OPTIONS: ReadonlyArray<{ value: TemplateChannel | ""; label: string }> = [
  { value: "", label: "All channels" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "webhook", label: "Webhook" },
];

const CHANNEL_ICON: Record<TemplateChannel, typeof Envelope> = {
  email: Envelope,
  sms: ChatText,
  webhook: Code,
};

type TemplatesUrlState = Readonly<{
  project: string;
  channel: TemplateChannel | "";
  page: number;
  perPage: number;
}>;

function useTemplatesUrlState(): {
  state: TemplatesUrlState;
  patch: (next: Partial<TemplatesUrlState>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo<TemplatesUrlState>(() => {
    const perPage = Number(params.get("perPage"));
    const channel = params.get("channel");
    return {
      project: params.get("project") ?? "",
      channel: channel === "email" || channel === "sms" || channel === "webhook" ? channel : "",
      page: Math.max(1, Number(params.get("page")) || 1),
      perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
        ? perPage
        : DEFAULT_PER_PAGE,
    };
  }, [params]);

  function patch(next: Partial<TemplatesUrlState>) {
    const merged = { ...state, ...next };
    const pagingOnly = Object.keys(next).every((key) => key === "page" || key === "perPage");
    if (!pagingOnly && next.page === undefined) merged.page = 1;

    const search = new URLSearchParams();
    if (merged.project) search.set("project", merged.project);
    if (merged.channel) search.set("channel", merged.channel);
    if (merged.page > 1) search.set("page", String(merged.page));
    if (merged.perPage !== DEFAULT_PER_PAGE) search.set("perPage", String(merged.perPage));

    const query = search.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return { state, patch };
}

/**
 * A project's shared template library — every key in the project draws from
 * the same pool. Shows this scope's own templates plus the shared system
 * defaults, which fork into an owned copy rather than being edited in place.
 *
 * @param props Active organization, project, and the sibling project list.
 * @returns The templates surface.
 */
export function TemplatesPage({ organization, project, projects }: TemplatesPageProps) {
  const toast = useToast();
  const { state, patch } = useTemplatesUrlState();
  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canReadOrganization = capabilities.has("organization:templates:read");
  const canManage = capabilities.has("project:templates:manage");

  // No project param in the URL means "this project" — org-wide is only ever
  // reached by explicitly picking "All projects" (the "all" sentinel below),
  // never the default state.
  const wantsAllProjects = canReadOrganization && state.project === "all";
  const scopeProjectId = wantsAllProjects
    ? ""
    : canReadOrganization
      ? state.project || project.id
      : project.id;
  const orgWide = wantsAllProjects ? organization.id : null;

  // The detail route is slug-based (`/app/{orgSlug}/{projectSlug}/...`), but
  // scoping/org-wide browsing works in ids — this resolves whichever
  // project actually owns a given card (which can be a sibling project, not
  // just the one the URL happens to be on) back to its slug.
  const projectsById = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p] as const));
    map.set(project.id, project);
    return map;
  }, [projects, project]);

  const [defaultsOpen, setDefaultsOpen] = useState(true);
  const [creating, setCreating] = useState(false);

  const forkTemplate = useForkProjectTemplate();

  const listOptions = {
    page: state.page,
    perPage: state.perPage,
    channel: state.channel || undefined,
  };

  // Both scopes are always queried (each gated by its own `enabled`) so hook
  // order stays stable as the project filter toggles between a specific
  // project and org-wide — conditionally calling one or the other would
  // violate the rules of hooks.
  const projectQuery = useProjectTemplates(scopeProjectId || null, listOptions);
  const orgQuery = useOrganizationTemplates(orgWide, listOptions);
  const query = scopeProjectId ? projectQuery : orgQuery;

  const projectDefaults = useProjectTemplateDefaults(scopeProjectId || null, { perPage: 50 });
  const orgDefaults = useOrganizationTemplateDefaults(orgWide, { perPage: 50 });
  const defaults = scopeProjectId ? projectDefaults : orgDefaults;

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data ? Math.max(1, query.data.totalPages) : 1;
  const defaultItems = defaults.data?.items ?? [];

  // Forking always lands in whichever project is currently in scope,
  // falling back to the dashboard's active project in org-wide view — the
  // same project a name/channel collision would be checked against.
  const forkTargetProjectId = scopeProjectId || project.id;
  const forkTargetOwned = useProjectTemplates(forkTargetProjectId, { perPage: 100 });
  const forkTargetOwnedKeys = useMemo(
    () =>
      new Set(
        (forkTargetOwned.data?.items ?? []).map(
          (template) => `${template.name.toLowerCase()}|${template.channel}`,
        ),
      ),
    [forkTargetOwned.data],
  );

  async function handleFork(template: Template) {
    try {
      await forkTemplate.mutateAsync({ projectId: forkTargetProjectId, templateId: template.id });
      toast.success(`${template.name} copied to this project`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fork template");
    }
  }

  function renderCard(template: Template, options: { isDefault: boolean }) {
    const Icon = CHANNEL_ICON[template.channel];
    // The detail route needs a project *slug*, not an id — an owned
    // template links through its own project (which may be a sibling
    // project shown in the org-wide list, not the one the URL is on); a
    // default links through whichever project is currently in scope, since
    // any project can view it. Only a project outside `projects` (should
    // not happen — that list is every project this user can pick) leaves a
    // card unable to navigate.
    const ownerProject = template.projectId
      ? projectsById.get(template.projectId)
      : projectsById.get(scopeProjectId || project.id);
    const href = ownerProject
      ? `/app/${organization.slug}/${ownerProject.slug}/templates/${template.id}`
      : "";

    const content = (
      <>
        <div className="templates-page__card-top">
          <div className="templates-page__card-id">
            <span className="templates-page__icon">
              <Icon size={15} />
            </span>
            <div>
              <div className="templates-page__name-row">
                <span className="templates-page__name">{template.name}</span>
                {options.isDefault ? (
                  <span className="templates-page__system-pill">
                    <Globe size={9} />
                    System
                  </span>
                ) : null}
              </div>
              <span className="templates-page__channel">{template.channel}</span>
            </div>
          </div>
          {options.isDefault ? (
            canManage ? (
              forkTargetOwnedKeys.has(`${template.name.toLowerCase()}|${template.channel}`) ? (
                <span
                  className="templates-page__already-pill"
                  title="This project already has a template with this name and channel"
                >
                  Already added
                </span>
              ) : (
                <button
                  type="button"
                  className="templates-page__fork-btn"
                  onClick={() => handleFork(template)}
                  disabled={forkTemplate.isPending}
                >
                  Fork
                </button>
              )
            ) : null
          ) : canManage ? (
            <span className="templates-page__manage-hint" aria-hidden title="Manage">
              <CaretRight size={13} weight="bold" />
            </span>
          ) : null}
        </div>
        <p className="templates-page__subject">
          {template.channel === "email" ? (template.subject ?? template.body) : template.body}
        </p>
        {template.variables.length > 0 ? (
          <div className="templates-page__vars">
            {template.variables.slice(0, 4).map((variable) => (
              <span key={variable} className="templates-page__var-pill">{`{{${variable}}}`}</span>
            ))}
            {template.variables.length > 4 ? (
              <span className="templates-page__var-pill">+{template.variables.length - 4}</span>
            ) : null}
          </div>
        ) : null}
        <span className="templates-page__footer">
          {options.isDefault ? "System default" : `Modified ${relativeTime(template.updatedAt)}`}
        </span>
      </>
    );

    return (
      <div
        className="templates-page__card"
        data-default={options.isDefault || undefined}
        key={template.id}
      >
        {ownerProject ? (
          <Link
            href={href}
            className="templates-page__card-link"
            aria-label={`View ${template.name} template`}
          />
        ) : null}
        {content}
      </div>
    );
  }

  return (
    <div className="templates-page">
      <header className="templates-page__heading">
        <div>
          <p>Configure</p>
          <h1>Templates</h1>
          <span>
            Reusable content across delivery channels. Every key in a project draws from the same
            library.
          </span>
        </div>
      </header>

      <div className="templates-page__filters">
        {canReadOrganization ? (
          <AppSelect
            aria-label="Project"
            value={state.project === "all" ? "all" : scopeProjectId}
            onValueChange={(value) => patch({ project: value === project.id ? "" : value })}
            options={[
              { value: "all", label: "All projects" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        ) : null}
        <AppSelect
          aria-label="Channel"
          value={state.channel}
          onValueChange={(value) => patch({ channel: value as TemplateChannel | "" })}
          options={CHANNEL_OPTIONS}
        />
        {canManage ? (
          <button
            type="button"
            className="templates-page__new"
            onClick={() => setCreating(true)}
            disabled={!scopeProjectId}
            title={scopeProjectId ? undefined : "Pick a single project to create a template"}
          >
            <Plus size={13} weight="bold" />
            New template
          </button>
        ) : null}
      </div>

      <section className="templates-page__section">
        <div className="templates-page__section-head">
          <h2>{scopeProjectId ? "Owned by this project" : "Across all projects"}</h2>
          <span>{total.toLocaleString()}</span>
        </div>
        {items.length === 0 ? (
          <p className="templates-page__empty">
            {query.isPending ? "Loading…" : "No templates yet."}
          </p>
        ) : (
          <div className="templates-page__grid">
            {items.map((template) => renderCard(template, { isDefault: false }))}
          </div>
        )}
        {total > 0 ? (
          <div className="templates-page__pager">
            <TablePager
              page={state.page}
              totalPages={totalPages}
              total={total}
              perPage={state.perPage}
              perPageOptions={PER_PAGE_OPTIONS}
              busy={query.isFetching}
              onPageChange={(page) => patch({ page })}
              onPerPageChange={(perPage) => patch({ perPage, page: 1 })}
            />
          </div>
        ) : null}
      </section>

      <section className="templates-page__section templates-page__section--defaults">
        <button
          type="button"
          className="templates-page__defaults-toggle"
          data-open={defaultsOpen || undefined}
          onClick={() => setDefaultsOpen((open) => !open)}
        >
          <CaretRight size={10} weight="bold" aria-hidden />
          <h2>Shared defaults</h2>
          <span>{defaultItems.length}</span>
        </button>
        {defaultsOpen ? (
          <>
            <p className="templates-page__section-note">
              System templates every project can use. Forking makes an editable copy owned by this
              project — the original is never changed.
            </p>
            {defaultItems.length === 0 ? (
              <p className="templates-page__empty">No system defaults yet.</p>
            ) : (
              <div className="templates-page__grid">
                {defaultItems.map((template) => renderCard(template, { isDefault: true }))}
              </div>
            )}
          </>
        ) : null}
      </section>

      {creating ? (
        <TemplateFormDialog
          open={creating}
          projectId={scopeProjectId || project.id}
          template={null}
          onOpenChange={setCreating}
          onSaved={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
