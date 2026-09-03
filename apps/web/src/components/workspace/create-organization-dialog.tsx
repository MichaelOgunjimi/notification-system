"use client";

import { FormEvent, useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import type { Organization } from "@beaco/control-plane";
import { useCreateOrganization } from "@beaco/control-plane/react";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";
import { SLUG_PATTERN, randomSlugSuffix, slugWithSuffix } from "@/lib/slug";

type CreateOrganizationDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (organization: Organization) => void;
}>;

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
  const formId = useId();
  const nameId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const projectNameId = useId();
  const projectSlugId = useId();
  const createOrganization = useCreateOrganization();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugSuffix] = useState(randomSlugSuffix);
  const [description, setDescription] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [projectSlugTouched, setProjectSlugTouched] = useState(false);
  const [projectSuffix] = useState(randomSlugSuffix);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugWithSuffix(name, slugSuffix);
  const effectiveProjectSlug = projectSlugTouched
    ? projectSlug
    : slugWithSuffix(projectName, projectSuffix);
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
        description: description.trim() || null,
        project: { name: projectName.trim(), slug: effectiveProjectSlug.trim() },
      });
      toast.success(`${created.name} created`);
      onCreated(created);
    } catch {
      // The structured mutation error is rendered below the form.
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!createOrganization.isPending) onOpenChange(next);
      }}
      eyebrow="Workspace"
      title="Create an organization"
      description="An organization holds your team, projects, and billing. Its first project is created with the details below."
      busy={createOrganization.isPending}
      formId={formId}
      submitLabel="Create organization"
      submitDisabled={!canSubmit}
      onSubmit={handleSubmit}
    >
      <span className="form-dialog__group">Organization</span>
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
      <p className="form-dialog__hint">
        A short random suffix keeps the slug unique. Edit it to set your own.
      </p>
      <label htmlFor={descriptionId}>Description</label>
      <input
        id={descriptionId}
        value={description}
        maxLength={1000}
        placeholder="Optional"
        onChange={(event) => setDescription(event.target.value)}
      />

      <span className="form-dialog__group">First project</span>
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
      <p className="form-dialog__hint">
        A short random suffix keeps the project slug unique. Edit it to set your own.
      </p>

      {formError || createOrganization.isError ? (
        <p className="form-dialog__error" role="alert">
          <WarningCircle size={14} />
          {formError ?? createOrganization.error?.message}
        </p>
      ) : null}
    </FormDialog>
  );
}
