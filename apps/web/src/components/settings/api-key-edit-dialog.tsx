"use client";

import { FormEvent, useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import type { ApiKeyScope, ProjectApiKey } from "@beaco/control-plane";
import { useUpdateProjectApiKey } from "@beaco/control-plane/react";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";
import { ScopeGrid } from "./api-key-scopes";

type ApiKeyEditDialogProps = Readonly<{
  open: boolean;
  projectId: string;
  apiKey: ProjectApiKey;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}>;

/**
 * Modal form for editing an active API key's name, description, scopes, and
 * rate limit. The environment cannot change after creation.
 *
 * @param props Dialog visibility, target project and key, and success/close callbacks.
 * @returns The edit-key dialog.
 */
export function ApiKeyEditDialog({
  open,
  projectId,
  apiKey,
  onOpenChange,
  onSaved,
}: ApiKeyEditDialogProps) {
  const toast = useToast();
  const formId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const rateLimitId = useId();
  const updateKey = useUpdateProjectApiKey();

  const [name, setName] = useState(apiKey.name);
  const [description, setDescription] = useState(apiKey.description ?? "");
  const [scopes, setScopes] = useState<Set<ApiKeyScope>>(new Set(apiKey.scopes));
  const [rateLimit, setRateLimit] = useState(
    apiKey.rateLimitPerMin === null ? "" : String(apiKey.rateLimitPerMin),
  );
  const [formError, setFormError] = useState<string | null>(null);

  function toggleScope(scope: ApiKeyScope) {
    setScopes((current) => {
      const next = new Set(current);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    updateKey.reset();
    if (!name.trim()) return setFormError("Enter a name for this key.");
    if (scopes.size === 0) return setFormError("Select at least one scope.");
    let parsedRateLimit: number | null = null;
    if (rateLimit.trim()) {
      parsedRateLimit = Number(rateLimit);
      if (!Number.isInteger(parsedRateLimit) || parsedRateLimit < 1) {
        return setFormError("Rate limit must be a whole number of at least 1.");
      }
    }
    try {
      await updateKey.mutateAsync({
        projectId,
        apiKeyId: apiKey.id,
        changes: {
          name: name.trim(),
          description: description.trim() || null,
          scopes: [...scopes],
          rateLimitPerMin: parsedRateLimit,
        },
      });
      toast.success(`${name.trim()} updated`);
      onSaved();
    } catch {
      // The structured mutation error is rendered below the form.
    }
  }

  return (
    <FormDialog
      open={open}
      wide
      onOpenChange={(next) => {
        if (!updateKey.isPending) onOpenChange(next);
      }}
      eyebrow="API key"
      title={`Edit ${apiKey.name}`}
      description="Changes take effect immediately. Rotate the key instead if the secret may be compromised."
      busy={updateKey.isPending}
      formId={formId}
      submitLabel="Save changes"
      submitDisabled={!name.trim() || scopes.size === 0}
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
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={rateLimitId}>Rate limit / min</label>
          <input
            id={rateLimitId}
            value={rateLimit}
            inputMode="numeric"
            placeholder="1000"
            onChange={(event) => setRateLimit(event.target.value)}
          />
        </div>
      </div>

      <label htmlFor={descriptionId}>Description</label>
      <input
        id={descriptionId}
        value={description}
        maxLength={1000}
        placeholder="Optional — what this key is for"
        onChange={(event) => setDescription(event.target.value)}
      />

      <span className="form-dialog__field-label">
        Scopes {scopes.size ? `· ${scopes.size} selected` : ""}
      </span>
      <ScopeGrid value={scopes} onToggle={toggleScope} />

      {formError || updateKey.isError ? (
        <p className="form-dialog__error" role="alert">
          <WarningCircle size={14} />
          {formError ?? updateKey.error?.message}
        </p>
      ) : null}
    </FormDialog>
  );
}
