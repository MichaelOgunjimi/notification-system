"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { SpinnerGap, WarningCircle, X } from "@phosphor-icons/react";
import type { ApiKeyScope, CreatedProjectApiKey } from "@beaco/control-plane";
import { useCreateProjectApiKey } from "@beaco/control-plane/react";
import { useToast } from "@/components/ui/toast";
import "./api-key-create-dialog.css";

type ApiKeyCreateDialogProps = Readonly<{
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (apiKey: CreatedProjectApiKey) => void;
}>;

const SCOPE_GROUPS: ReadonlyArray<{ label: string; scopes: readonly ApiKeyScope[] }> = [
  { label: "Events", scopes: ["events:read", "events:write"] },
  { label: "Templates", scopes: ["templates:read", "templates:write"] },
  { label: "Notifications", scopes: ["notifications:read"] },
  { label: "Scheduled events", scopes: ["scheduled_events:read", "scheduled_events:write"] },
  { label: "Suppressions", scopes: ["suppressions:read", "suppressions:write"] },
  { label: "Alerts", scopes: ["alerts:read", "alerts:write"] },
  { label: "Analytics", scopes: ["analytics:read"] },
  { label: "Dead letters", scopes: ["dead_letters:read", "dead_letters:write"] },
  { label: "Usage", scopes: ["usage:read"] },
  { label: "Audit", scopes: ["audit:read"] },
  { label: "Settings", scopes: ["settings:read"] },
];

function scopeAction(scope: ApiKeyScope): string {
  return scope.split(":")[1] ?? scope;
}

/**
 * Modal form for creating a project API key: name, optional description,
 * environment, an optional rate limit, and a per-resource scope grid.
 *
 * Uses the native dialog top layer with focus trapping, Escape, and backdrop
 * dismissal. The caller renders the one-time secret on success.
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose() {
    if (!createKey.isPending) onOpenChange(false);
  }

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
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError("Enter a name for this key.");
    if (scopes.size === 0) return setFormError("Select at least one scope.");
    let parsedRateLimit: number | null = null;
    if (rateLimit.trim()) {
      parsedRateLimit = Number(rateLimit);
      if (!Number.isInteger(parsedRateLimit) || parsedRateLimit < 1) {
        return setFormError("Rate limit must be a whole number of at least 1.");
      }
    }
    try {
      const created = await createKey.mutateAsync({
        projectId,
        input: {
          name: trimmedName,
          description: description.trim() || null,
          scopes: [...scopes],
          environment,
          rateLimitPerMin: parsedRateLimit,
        },
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
      className="api-key-dialog"
      aria-labelledby={titleId}
      aria-busy={createKey.isPending || undefined}
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
      <div className="api-key-dialog__surface">
        <header className="api-key-dialog__header">
          <div>
            <p>Project security</p>
            <h2 id={titleId}>Create an API key</h2>
          </div>
          <button
            type="button"
            className="api-key-dialog__close"
            aria-label="Close dialog"
            disabled={createKey.isPending}
            onClick={requestClose}
          >
            <X size={17} />
          </button>
        </header>

        <p className="api-key-dialog__description">
          Name it for where it runs, then grant the narrowest set of scopes it needs. The secret is
          shown once, right after creation.
        </p>

        <form id="api-key-create-form" className="api-key-dialog__body" onSubmit={handleSubmit}>
          <div className="api-key-dialog__field-row">
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

          <span className="api-key-dialog__label">Environment</span>
          <div className="api-key-dialog__segmented" role="radiogroup" aria-label="Environment">
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

          <span className="api-key-dialog__label">
            Scopes {scopes.size ? `· ${scopes.size} selected` : ""}
          </span>
          <div className="api-key-dialog__scopes">
            {SCOPE_GROUPS.map((group) => (
              <div key={group.label} className="api-key-dialog__scope-group">
                <p>{group.label}</p>
                {group.scopes.map((scope) => (
                  <label key={scope}>
                    <input
                      type="checkbox"
                      checked={scopes.has(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    {scopeAction(scope)}
                  </label>
                ))}
              </div>
            ))}
          </div>

          {formError || createKey.isError ? (
            <p className="api-key-dialog__error" role="alert">
              <WarningCircle size={14} />
              {formError ?? createKey.error?.message}
            </p>
          ) : null}
        </form>

        <footer className="api-key-dialog__footer">
          <button type="button" disabled={createKey.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="submit"
            form="api-key-create-form"
            className="api-key-dialog__submit"
            disabled={createKey.isPending}
          >
            {createKey.isPending ? <SpinnerGap className="animate-spin" size={15} /> : null}
            Create key
          </button>
        </footer>
      </div>
    </dialog>
  );
}
