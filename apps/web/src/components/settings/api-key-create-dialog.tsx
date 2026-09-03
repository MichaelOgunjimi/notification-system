"use client";

import { FormEvent, useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import type { ApiKeyScope, CreatedProjectApiKey } from "@beaco/control-plane";
import { useCreateProjectApiKey } from "@beaco/control-plane/react";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";
import { ScopeGrid } from "./api-key-scopes";

type ApiKeyCreateDialogProps = Readonly<{
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (apiKey: CreatedProjectApiKey) => void;
}>;

function parseRateLimit(raw: string): { value: number | null } | { error: string } {
  if (!raw.trim()) return { value: null };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { error: "Rate limit must be a whole number of at least 1." };
  }
  return { value: parsed };
}

/**
 * Modal form for creating a project API key: name, optional description,
 * environment, an optional rate limit, and a per-resource scope grid. The
 * caller renders the one-time secret on success.
 *
 * @param props Dialog visibility, target project, and success/close callbacks.
 * @returns The create-key dialog.
 */
export function ApiKeyCreateDialog({
  open,
  projectId,
  onOpenChange,
  onCreated,
}: ApiKeyCreateDialogProps) {
  const toast = useToast();
  const formId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const rateLimitId = useId();
  const createKey = useCreateProjectApiKey();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState<"test" | "live">("live");
  const [scopes, setScopes] = useState<Set<ApiKeyScope>>(new Set());
  const [rateLimit, setRateLimit] = useState("");
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
    createKey.reset();
    if (!name.trim()) return setFormError("Enter a name for this key.");
    if (scopes.size === 0) return setFormError("Select at least one scope.");
    const rate = parseRateLimit(rateLimit);
    if ("error" in rate) return setFormError(rate.error);
    try {
      const created = await createKey.mutateAsync({
        projectId,
        input: {
          name: name.trim(),
          description: description.trim() || null,
          scopes: [...scopes],
          environment,
          rateLimitPerMin: rate.value,
        },
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
      wide
      onOpenChange={(next) => {
        if (!createKey.isPending) onOpenChange(next);
      }}
      eyebrow="Project security"
      title="Create an API key"
      description="Name it for where it runs, then grant the narrowest set of scopes it needs. The secret is shown once, right after creation."
      busy={createKey.isPending}
      formId={formId}
      submitLabel="Create key"
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
            placeholder="Production ingest"
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

      <span className="form-dialog__field-label">Environment</span>
      <div className="form-dialog__segmented" role="radiogroup" aria-label="Environment">
        {(["live", "test"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={environment === value}
            data-active={environment === value || undefined}
            onClick={() => setEnvironment(value)}
          >
            {value}
          </button>
        ))}
      </div>

      <span className="form-dialog__field-label">
        Scopes {scopes.size ? `· ${scopes.size} selected` : ""}
      </span>
      <ScopeGrid value={scopes} onToggle={toggleScope} />

      {formError || createKey.isError ? (
        <p className="form-dialog__error" role="alert">
          <WarningCircle size={14} />
          {formError ?? createKey.error?.message}
        </p>
      ) : null}
    </FormDialog>
  );
}
