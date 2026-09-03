"use client";

import { FormEvent, useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import type { Project } from "@beaco/control-plane";
import { useCreateProject } from "@beaco/control-plane/react";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";
import { SLUG_PATTERN, randomSlugSuffix, slugWithSuffix } from "@/lib/slug";

type CreateProjectDialogProps = Readonly<{
  open: boolean;
  organizationId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: Project) => void;
}>;

/**
 * Modal form for creating a project within an organization. The slug is derived
 * from the name with a random suffix so it does not collide; editing the slug
 * field switches to exactly what is typed.
 *
 * @param props Dialog visibility, target organization, and success/close callbacks.
 * @returns The create-project dialog.
 */
export function CreateProjectDialog({
  open,
  organizationId,
  onOpenChange,
  onCreated,
}: CreateProjectDialogProps) {
  const toast = useToast();
  const formId = useId();
  const nameId = useId();
  const slugId = useId();
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [suffix] = useState(randomSlugSuffix);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugWithSuffix(name, suffix);
  const canSubmit = name.trim().length > 0 && SLUG_PATTERN.test(effectiveSlug);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    createProject.reset();
    if (!canSubmit) return setFormError("Enter a name and a valid slug.");
    try {
      const created = await createProject.mutateAsync({
        organizationId,
        project: { name: name.trim(), slug: effectiveSlug.trim() },
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
        if (!createProject.isPending) onOpenChange(next);
      }}
      eyebrow="Project"
      title="Create a project"
      description="A project has its own API keys, delivery data, and settings, isolated from the rest of the organization."
      busy={createProject.isPending}
      formId={formId}
      submitLabel="Create project"
      submitDisabled={!canSubmit}
      onSubmit={handleSubmit}
    >
      <label htmlFor={nameId}>Name</label>
      <input
        id={nameId}
        value={name}
        maxLength={255}
        autoFocus
        placeholder="Production"
        onChange={(event) => setName(event.target.value)}
      />

      <label htmlFor={slugId}>URL slug</label>
      <input
        id={slugId}
        value={effectiveSlug}
        maxLength={100}
        placeholder="production"
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.target.value.toLowerCase());
        }}
      />
      <p className="form-dialog__hint">
        A short random suffix keeps the slug unique. Edit it to set your own.
      </p>

      {formError || createProject.isError ? (
        <p className="form-dialog__error" role="alert">
          <WarningCircle size={14} />
          {formError ?? createProject.error?.message}
        </p>
      ) : null}
    </FormDialog>
  );
}
