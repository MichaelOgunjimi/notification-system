"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { SpinnerGap, WarningCircle, X } from "@phosphor-icons/react";
import type { Organization } from "@beaco/control-plane";
import { useCreateOrganization } from "@beaco/control-plane/react";
import { useToast } from "@/components/ui/toast";
import "./create-organization-dialog.css";

type CreateOrganizationDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (organization: Organization) => void;
}>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Modal form for creating an organization together with its first project. Both
 * are required; the create action is disabled until every field is valid.
 *
 * @param props Dialog visibility and success/close callbacks.
 * @returns The create-organization dialog.
 */
export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateOrganizationDialogProps) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const nameId = useId();
  const slugId = useId();
  const projectNameId = useId();
  const projectSlugId = useId();
  const createOrganization = useCreateOrganization();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [projectSlugTouched, setProjectSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose() {
    if (!createOrganization.isPending) onOpenChange(false);
  }

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const effectiveProjectSlug = projectSlugTouched ? projectSlug : slugify(projectName);
  const canSubmit =
    name.trim().length > 0 &&
    SLUG_PATTERN.test(effectiveSlug) &&
    projectName.trim().length > 0 &&
    SLUG_PATTERN.test(effectiveProjectSlug);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    createOrganization.reset();
    if (!canSubmit) {
      return setFormError("Complete the organization and project details.");
    }
    try {
      const created = await createOrganization.mutateAsync({
        name: name.trim(),
        slug: effectiveSlug.trim(),
        project: { name: projectName.trim(), slug: effectiveProjectSlug.trim() },
      });
      toast.success(`${created.name} created`);
      onCreated(created);
    } catch {
      // The structured mutation error is rendered below the form.
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="create-org-dialog"
      aria-labelledby={titleId}
      aria-busy={createOrganization.isPending || undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="create-org-dialog__surface">
        <header className="create-org-dialog__header">
          <div>
            <p>Workspace</p>
            <h2 id={titleId}>Create an organization</h2>
          </div>
          <button
            type="button"
            className="create-org-dialog__close"
            aria-label="Close dialog"
            disabled={createOrganization.isPending}
            onClick={requestClose}
          >
            <X size={17} />
          </button>
        </header>

        <p className="create-org-dialog__description">
          An organization holds your team, projects, and billing. Its first project is created with
          the details below.
        </p>

        <form id="create-org-form" className="create-org-dialog__body" onSubmit={handleSubmit}>
          <span className="create-org-dialog__group">Organization</span>
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            value={name}
            maxLength={255}
            autoFocus
            placeholder="Acme Inc"
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor={slugId}>URL slug</label>
          <input
            id={slugId}
            value={effectiveSlug}
            maxLength={100}
            placeholder="acme"
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value.toLowerCase());
            }}
          />

          <span className="create-org-dialog__group">First project</span>
          <label htmlFor={projectNameId}>Name</label>
          <input
            id={projectNameId}
            value={projectName}
            maxLength={255}
            placeholder="Production"
            onChange={(event) => setProjectName(event.target.value)}
          />
          <label htmlFor={projectSlugId}>URL slug</label>
          <input
            id={projectSlugId}
            value={effectiveProjectSlug}
            maxLength={100}
            placeholder="production"
            onChange={(event) => {
              setProjectSlugTouched(true);
              setProjectSlug(event.target.value.toLowerCase());
            }}
          />

          {formError || createOrganization.isError ? (
            <p className="create-org-dialog__error" role="alert">
              <WarningCircle size={14} />
              {formError ?? createOrganization.error?.message}
            </p>
          ) : null}
        </form>

        <footer className="create-org-dialog__footer">
          <button
            type="button"
            disabled={createOrganization.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-org-form"
            className="create-org-dialog__submit"
            disabled={!canSubmit || createOrganization.isPending}
          >
            {createOrganization.isPending ? (
              <SpinnerGap className="animate-spin" size={15} />
            ) : null}
            Create organization
          </button>
        </footer>
      </div>
    </dialog>
  );
}
