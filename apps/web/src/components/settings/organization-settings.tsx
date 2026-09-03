"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Buildings,
  Check,
  EnvelopeSimple,
  FolderSimple,
  GearSix,
  SpinnerGap,
  Trash,
  UserMinus,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  Organization,
  OrganizationMember,
  OrganizationRole,
  Project,
} from "@beaco/control-plane";
import {
  useArchiveOrganization,
  useCreateProject,
  useInviteOrganizationMember,
  useOrganizationInvitations,
  useOrganizationMembers,
  useRemoveOrganizationMember,
  useRevokeOrganizationInvitation,
  useUpdateOrganization,
  useUpdateOrganizationMemberRole,
} from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { AppSelect } from "@/components/ui/app-select";
import { useToast } from "@/components/ui/toast";
import { dashboardPath } from "@/lib/dashboard-route";
import "./organization-settings.css";

type OrganizationSettingsProps = Readonly<{
  userId: string;
  organization: Organization;
  project: Project;
  projects: Project[];
}>;

const memberRoles: OrganizationRole[] = ["viewer", "member", "admin", "owner"];
const invitationRoles: OrganizationRole[] = ["viewer", "member", "admin"];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Renders organization-owned profile, membership, invitation, and project controls.
 *
 * Capabilities from the backend control which mutations are exposed. Backend
 * authorization remains authoritative for every request.
 *
 * @param props Authenticated user and validated organization/project context.
 * @returns Compact organization settings surface backed by control-plane queries.
 */
export function OrganizationSettings({
  userId,
  organization,
  project,
  projects,
}: OrganizationSettingsProps) {
  const router = useRouter();
  const toast = useToast();
  const nameId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const inviteEmailId = useId();
  const inviteRoleId = useId();
  const projectNameId = useId();
  const projectSlugId = useId();
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [description, setDescription] = useState(organization.description ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("member");
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canManageOrganization = capabilities.has("organization:manage");
  const canManageMembers = capabilities.has("organization:members:manage");
  const canCreateProject = capabilities.has("project:create");
  const canManageProject = capabilities.has("project:manage");
  const canDeleteOrganization = capabilities.has("organization:delete");
  const members = useOrganizationMembers(organization.id);
  const invitations = useOrganizationInvitations(canManageMembers ? organization.id : null);
  const updateOrganization = useUpdateOrganization();
  const updateRole = useUpdateOrganizationMemberRole();
  const removeMember = useRemoveOrganizationMember();
  const inviteMember = useInviteOrganizationMember();
  const revokeInvitation = useRevokeOrganizationInvitation();
  const createProject = useCreateProject();
  const archiveOrganization = useArchiveOrganization();
  const profileChanged =
    name.trim() !== organization.name ||
    slug.trim() !== organization.slug ||
    description.trim() !== (organization.description ?? "");
  const activeInvitations = invitations.data?.filter(
    (invitation) => !invitation.acceptedAt && !invitation.revokedAt,
  );

  async function handleOrganizationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    updateOrganization.reset();
    const nextName = name.trim();
    const nextSlug = slug.trim();
    if (!nextName) return setProfileError("Enter an organization name.");
    if (!SLUG_PATTERN.test(nextSlug)) {
      return setProfileError("Use lowercase letters, numbers, and single hyphens for the slug.");
    }
    try {
      const updated = await updateOrganization.mutateAsync({
        organizationId: organization.id,
        changes: { name: nextName, slug: nextSlug, description: description.trim() || null },
      });
      if (updated.slug !== organization.slug) {
        router.replace(`${dashboardPath(updated.slug, project.slug)}/settings/organization`);
      }
    } catch {
      // The structured mutation error is rendered below the form.
    }
  }

  async function handleInvitationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    inviteMember.reset();
    try {
      await inviteMember.mutateAsync({
        organizationId: organization.id,
        invitation: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail("");
      setInviteRole("member");
    } catch {
      // The structured mutation error is rendered beside the invitation form.
    }
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectError(null);
    createProject.reset();
    const nextName = projectName.trim();
    const nextSlug = projectSlug.trim();
    if (!nextName) return setProjectError("Enter a project name.");
    if (!SLUG_PATTERN.test(nextSlug)) {
      return setProjectError("Use lowercase letters, numbers, and single hyphens for the slug.");
    }
    try {
      const created = await createProject.mutateAsync({
        organizationId: organization.id,
        project: { name: nextName, slug: nextSlug },
      });
      router.push(dashboardPath(organization.slug, created.slug));
    } catch {
      // The structured mutation error is rendered beside the project form.
    }
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return;
    try {
      await removeMember.mutateAsync({
        organizationId: organization.id,
        membershipId: memberToRemove.id,
      });
      setMemberToRemove(null);
    } catch {
      // The structured mutation error is rendered inside the confirmation dialog.
    }
  }

  async function handleArchiveOrganization() {
    try {
      await archiveOrganization.mutateAsync({ organizationId: organization.id });
      toast.success(`${organization.name} archived`);
      router.replace("/workspace");
    } catch {
      // The structured mutation error is rendered inside the confirmation dialog.
    }
  }

  return (
    <div className="organization-settings">
      <header className="organization-settings__heading">
        <div>
          <p>Organization control</p>
          <h1>{organization.name}</h1>
          <span>Manage the team boundary shared by every project in this organization.</span>
        </div>
        <span className="organization-settings__role">
          <Buildings size={16} /> {organization.role}
        </span>
      </header>

      <nav className="organization-settings__nav" aria-label="Organization settings sections">
        <a href="#general">01 General</a>
        <a href="#members">02 Members</a>
        <a href="#projects">03 Projects</a>
        {canDeleteOrganization ? <a href="#danger">04 Danger</a> : null}
      </nav>

      <div className="organization-settings__sections">
        <section id="general" className="organization-settings__section">
          <div className="organization-settings__section-heading">
            <span>01</span>
            <div>
              <h2>Organization profile</h2>
              <p>Name, URL identity, and team context.</p>
            </div>
          </div>
          <form className="organization-settings__form" onSubmit={handleOrganizationSubmit}>
            <label htmlFor={nameId}>Name</label>
            <input
              id={nameId}
              value={name}
              disabled={!canManageOrganization}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor={slugId}>URL slug</label>
            <input
              id={slugId}
              value={slug}
              disabled={!canManageOrganization}
              maxLength={100}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
            />
            <label htmlFor={descriptionId}>Description</label>
            <textarea
              id={descriptionId}
              value={description}
              disabled={!canManageOrganization}
              maxLength={1000}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
            {profileError || updateOrganization.isError ? (
              <p className="organization-settings__message" data-tone="error">
                <WarningCircle size={15} />
                {profileError ?? updateOrganization.error?.message}
              </p>
            ) : null}
            {updateOrganization.isSuccess ? (
              <p className="organization-settings__message" data-tone="success">
                <Check size={15} />
                Organization saved
              </p>
            ) : null}
            <div className="organization-settings__actions">
              <span>
                {canManageOrganization
                  ? "Changes apply to every project."
                  : "Your role has read-only access."}
              </span>
              {canManageOrganization ? (
                <button disabled={!profileChanged || updateOrganization.isPending}>
                  {updateOrganization.isPending ? (
                    <SpinnerGap className="animate-spin" size={15} />
                  ) : null}
                  Save organization
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section id="members" className="organization-settings__section">
          <div className="organization-settings__section-heading">
            <span>02</span>
            <div>
              <h2>Members</h2>
              <p>Organization roles determine effective capabilities across its projects.</p>
            </div>
          </div>
          {canManageMembers ? (
            <form className="organization-settings__invite" onSubmit={handleInvitationSubmit}>
              <EnvelopeSimple size={18} />
              <input
                id={inviteEmailId}
                aria-label="Email address"
                type="email"
                required
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <AppSelect
                id={inviteRoleId}
                aria-label="Invitation role"
                value={inviteRole}
                onValueChange={setInviteRole}
                options={invitationRoles.map((role) => ({ value: role, label: role }))}
              />
              <button disabled={inviteMember.isPending}>
                {inviteMember.isPending ? "Sending" : "Invite"}
              </button>
            </form>
          ) : null}
          {inviteMember.isError ? (
            <p className="organization-settings__message" data-tone="error">
              <WarningCircle size={15} />
              {inviteMember.error.message}
            </p>
          ) : null}
          <div className="organization-settings__list">
            {members.isPending ? (
              <p className="organization-settings__empty">
                <SpinnerGap className="animate-spin" size={16} /> Loading members
              </p>
            ) : null}
            {members.isError ? (
              <p className="organization-settings__message" data-tone="error">
                <WarningCircle size={15} />
                {members.error.message}
              </p>
            ) : null}
            {members.data?.map((member) => (
              <article key={member.id} className="organization-settings__row">
                <span className="organization-settings__avatar">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>
                    {member.name}
                    {member.userId === userId ? " · You" : ""}
                  </strong>
                  <small>{member.email}</small>
                </div>
                {canManageMembers ? (
                  <AppSelect
                    containerClassName="organization-settings__member-role"
                    aria-label={`Role for ${member.name}`}
                    value={member.role}
                    disabled={updateRole.isPending}
                    onValueChange={(role) =>
                      updateRole.mutate({
                        organizationId: organization.id,
                        membershipId: member.id,
                        role,
                      })
                    }
                    options={memberRoles.map((role) => ({
                      value: role,
                      label: role,
                      disabled: role === "owner" && organization.role !== "owner",
                    }))}
                  />
                ) : (
                  <span className="organization-settings__tag">{member.role}</span>
                )}
                {canManageMembers ? (
                  <button
                    type="button"
                    className="organization-settings__icon-action"
                    aria-label={`Remove ${member.name}`}
                    onClick={() => {
                      removeMember.reset();
                      setMemberToRemove(member);
                    }}
                  >
                    <UserMinus size={16} />
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {canManageMembers && activeInvitations?.length ? (
            <div className="organization-settings__pending">
              <p>Pending invitations</p>
              {activeInvitations.map((invitation) => (
                <div key={invitation.id}>
                  <span>
                    <strong>{invitation.email}</strong>
                    <small>
                      {invitation.role} · expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </small>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      revokeInvitation.mutate({
                        organizationId: organization.id,
                        invitationId: invitation.id,
                      })
                    }
                  >
                    <Trash size={14} /> Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section id="projects" className="organization-settings__section">
          <div className="organization-settings__section-heading">
            <span>03</span>
            <div>
              <h2>Projects</h2>
              <p>Independent notification environments inside this organization.</p>
            </div>
          </div>
          {canCreateProject ? (
            <form className="organization-settings__project-create" onSubmit={handleProjectSubmit}>
              <FolderSimple size={18} />
              <input
                id={projectNameId}
                aria-label="Project name"
                required
                placeholder="Project name"
                value={projectName}
                onChange={(event) => {
                  setProjectName(event.target.value);
                  if (!projectSlug)
                    setProjectSlug(
                      event.target.value
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    );
                }}
              />
              <input
                id={projectSlugId}
                aria-label="Project slug"
                required
                placeholder="project-slug"
                value={projectSlug}
                onChange={(event) => setProjectSlug(event.target.value.toLowerCase())}
              />
              <button disabled={createProject.isPending}>
                {createProject.isPending ? "Creating" : "Create"}
              </button>
            </form>
          ) : null}
          {projectError || createProject.isError ? (
            <p className="organization-settings__message" data-tone="error">
              <WarningCircle size={15} />
              {projectError ?? createProject.error?.message}
            </p>
          ) : null}
          <div className="organization-settings__list">
            {projects.map((candidate) => (
              <div
                key={candidate.id}
                className="organization-settings__row organization-settings__project"
                data-active={candidate.id === project.id || undefined}
              >
                <button
                  type="button"
                  className="organization-settings__project-open"
                  onClick={() => router.push(dashboardPath(organization.slug, candidate.slug))}
                >
                  <span className="organization-settings__avatar">
                    <FolderSimple size={17} />
                  </span>
                  <div>
                    <strong>{candidate.name}</strong>
                    <small>
                      /{organization.slug}/{candidate.slug}
                    </small>
                  </div>
                </button>
                {canManageProject ? (
                  <Link
                    href={`${dashboardPath(organization.slug, candidate.slug)}/settings/project`}
                    className="organization-settings__icon-action"
                    aria-label={`Settings for ${candidate.name}`}
                  >
                    <GearSix size={16} />
                  </Link>
                ) : null}
                <span className="organization-settings__tag">
                  {candidate.id === project.id ? "current" : "open"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {canDeleteOrganization ? (
          <section
            id="danger"
            className="organization-settings__section organization-settings__section--danger"
          >
            <div className="organization-settings__section-heading">
              <span>04</span>
              <div>
                <h2>Danger zone</h2>
                <p>
                  Archiving removes {organization.name} and every project in it from the workspace.
                </p>
              </div>
            </div>
            <div className="organization-settings__danger-row">
              <div>
                <strong>Archive this organization</strong>
                <small>Members lose access immediately. Delivery data is retained.</small>
              </div>
              <button
                type="button"
                className="organization-settings__danger-action"
                onClick={() => {
                  archiveOrganization.reset();
                  setArchiveOpen(true);
                }}
              >
                <Trash size={15} /> Archive organization
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <AppDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open && !removeMember.isPending) setMemberToRemove(null);
        }}
        eyebrow="Organization access"
        title={`Remove ${memberToRemove?.name ?? "member"}?`}
        description="They will immediately lose access to every project in this organization. Delivery data remains unchanged."
        busy={removeMember.isPending}
        footer={
          <>
            <DialogAction disabled={removeMember.isPending} onClick={() => setMemberToRemove(null)}>
              Keep member
            </DialogAction>
            <DialogAction
              tone="danger"
              disabled={removeMember.isPending}
              onClick={handleRemoveMember}
            >
              <UserMinus size={15} />
              {removeMember.isPending ? "Removing" : "Remove"}
            </DialogAction>
          </>
        }
      >
        {removeMember.isError ? (
          <p className="app-dialog__error" role="alert">
            {removeMember.error.message}
          </p>
        ) : null}
      </AppDialog>

      <AppDialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open && !archiveOrganization.isPending) setArchiveOpen(false);
        }}
        eyebrow="Organization"
        title={`Archive ${organization.name}?`}
        description="Every member loses access and every project is removed from the workspace. Delivery history is retained."
        busy={archiveOrganization.isPending}
        footer={
          <>
            <DialogAction
              disabled={archiveOrganization.isPending}
              onClick={() => setArchiveOpen(false)}
            >
              Keep organization
            </DialogAction>
            <DialogAction
              tone="danger"
              disabled={archiveOrganization.isPending}
              onClick={handleArchiveOrganization}
            >
              <Trash size={15} />
              {archiveOrganization.isPending ? "Archiving" : "Archive"}
            </DialogAction>
          </>
        }
      >
        {archiveOrganization.isError ? (
          <p className="app-dialog__error" role="alert">
            {archiveOrganization.error.message}
          </p>
        ) : null}
      </AppDialog>
    </div>
  );
}
