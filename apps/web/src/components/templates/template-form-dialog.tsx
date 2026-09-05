"use client";

import { FormEvent, useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import type { Template, TemplateChannel } from "@beaco/control-plane";
import { useCreateProjectTemplate, useUpdateProjectTemplate } from "@beaco/control-plane/react";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";

type TemplateFormDialogProps = Readonly<{
  open: boolean;
  projectId: string;
  /** A template to edit, or null to create a new one owned by this project. */
  template: Template | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}>;

const CHANNELS: readonly TemplateChannel[] = ["email", "sms", "webhook"];

/** Pulls every `{{ variable }}` placeholder out of a template's text, in first-seen order. */
function extractVariables(...text: string[]): string[] {
  const pattern = /\{\{\s*(\w+)\s*\}\}/g;
  const seen = new Set<string>();
  for (const source of text) {
    for (const match of source.matchAll(pattern)) seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Modal form for creating or editing a template owned by a project. Channel,
 * subject, and body are freeform; `{{ variable }}` placeholders are
 * extracted from the subject and body automatically on save.
 *
 * @param props Dialog visibility, the target project, an optional template
 *   to edit, and success/close callbacks.
 * @returns The create/edit template dialog.
 */
export function TemplateFormDialog({
  open,
  projectId,
  template,
  onOpenChange,
  onSaved,
}: TemplateFormDialogProps) {
  const toast = useToast();
  const formId = useId();
  const nameId = useId();
  const subjectId = useId();
  const bodyId = useId();
  const createTemplate = useCreateProjectTemplate();
  const updateTemplate = useUpdateProjectTemplate();
  const mutation = template ? updateTemplate : createTemplate;

  const [name, setName] = useState(template?.name ?? "");
  const [channel, setChannel] = useState<TemplateChannel>(template?.channel ?? "email");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    mutation.reset();
    if (!name.trim()) return setFormError("Enter a name for this template.");
    if (!body.trim()) return setFormError("Enter a body for this template.");

    const variables = extractVariables(subject, body);
    try {
      if (template) {
        await updateTemplate.mutateAsync({
          projectId,
          templateId: template.id,
          changes: {
            name: name.trim(),
            channel,
            subject: channel === "email" ? subject || null : null,
            body,
            variables,
          },
        });
        toast.success(`${name.trim()} updated`);
      } else {
        await createTemplate.mutateAsync({
          projectId,
          input: {
            name: name.trim(),
            channel,
            subject: channel === "email" ? subject || null : null,
            body,
            variables,
          },
        });
        toast.success(`${name.trim()} created`);
      }
      onSaved();
    } catch {
      // The structured mutation error is rendered below the form.
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
      eyebrow="Templates"
      title={template ? "Edit template" : "New template"}
      description="Reusable content for a delivery channel. {{ variables }} are picked up automatically from the subject and body."
      busy={mutation.isPending}
      formId={formId}
      submitLabel={template ? "Save changes" : "Create template"}
      submitDisabled={!name.trim() || !body.trim()}
      onSubmit={handleSubmit}
    >
      <div className="form-dialog__field-row">
        <div>
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            value={name}
            maxLength={255}
            autoFocus
            placeholder="Welcome email"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>

      <span className="form-dialog__field-label">Channel</span>
      <div className="form-dialog__segmented" role="radiogroup" aria-label="Channel">
        {CHANNELS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={channel === value}
            data-active={channel === value || undefined}
            onClick={() => setChannel(value)}
          >
            {value}
          </button>
        ))}
      </div>

      {channel === "email" ? (
        <>
          <label htmlFor={subjectId}>Subject</label>
          <input
            id={subjectId}
            value={subject}
            maxLength={500}
            placeholder="Welcome to {{ app_name }}, {{ first_name }}!"
            onChange={(event) => setSubject(event.target.value)}
          />
        </>
      ) : null}

      <label htmlFor={bodyId}>Body</label>
      <textarea
        id={bodyId}
        value={body}
        rows={8}
        placeholder="Hi {{ first_name }}, ..."
        onChange={(event) => setBody(event.target.value)}
      />

      {formError || mutation.isError ? (
        <p className="form-dialog__error" role="alert">
          <WarningCircle size={14} />
          {formError ?? mutation.error?.message}
        </p>
      ) : null}
    </FormDialog>
  );
}
