"use client";

import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  Check,
  Copy,
  Key,
  Plus,
  SpinnerGap,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  CreatedProjectApiKey,
  Organization,
  Project,
  ProjectApiKey,
} from "@beaco/control-plane";
import {
  useProjectApiKeys,
  useRevokeProjectApiKey,
  useRotateProjectApiKey,
} from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { useToast } from "@/components/ui/toast";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import "./api-keys-settings.css";

type ApiKeysSettingsProps = Readonly<{
  organization: Organization;
  project: Project;
}>;

const PER_PAGE = 10;

function CreatedKeyPanel({ apiKey, onDone }: { apiKey: CreatedProjectApiKey; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the key stays visible for manual copy.
    }
  }

  return (
    <div className="api-keys__reveal" role="alert">
      <p className="api-keys__reveal-title">
        <Check size={15} weight="bold" /> {apiKey.name} ready
      </p>
      <p className="api-keys__reveal-hint">
        Copy this secret now — it is shown once and cannot be retrieved later.
      </p>
      <div className="api-keys__reveal-key">
        <code>{apiKey.key}</code>
        <button type="button" onClick={copy}>
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button type="button" className="api-keys__reveal-done" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

/**
 * Renders project API key management: a paginated list with rotation and
 * revocation for active keys, and a modal create form.
 *
 * Backend authorization (`api_key:manage`) remains authoritative for every request.
 *
 * @param props Active organization and project scope.
 * @returns API key settings surface backed by control-plane queries.
 */
export function ApiKeysSettings({ organization, project }: ApiKeysSettingsProps) {
  const toast = useToast();
  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canManage = capabilities.has("api_key:manage");

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedProjectApiKey | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<ProjectApiKey | null>(null);
  const [keyToRotate, setKeyToRotate] = useState<ProjectApiKey | null>(null);

  const apiKeys = useProjectApiKeys(canManage ? project.id : null, page, PER_PAGE);
  const revokeKey = useRevokeProjectApiKey();
  const rotateKey = useRotateProjectApiKey();

  async function handleRevoke() {
    if (!keyToRevoke) return;
    try {
      await revokeKey.mutateAsync({ projectId: project.id, apiKeyId: keyToRevoke.id });
      toast.success(`${keyToRevoke.name} revoked`);
      setKeyToRevoke(null);
    } catch {
      // The structured mutation error is rendered inside the confirmation dialog.
    }
  }

  async function handleRotate() {
    if (!keyToRotate) return;
    try {
      const rotated = await rotateKey.mutateAsync({
        projectId: project.id,
        apiKeyId: keyToRotate.id,
      });
      setCreatedKey(rotated);
      toast.success(`${rotated.name} rotated`);
      setKeyToRotate(null);
    } catch {
      // The structured mutation error is rendered inside the confirmation dialog.
    }
  }

  if (!canManage) {
    return (
      <div className="api-keys">
        <header className="api-keys__heading">
          <div>
            <p>Project security</p>
            <h1>API keys</h1>
          </div>
        </header>
        <p className="api-keys__message" data-tone="error">
          <WarningCircle size={15} />
          Your role has read-only access. An organization admin or owner can manage API keys.
        </p>
      </div>
    );
  }

  const items = apiKeys.data?.items ?? [];
  const totalPages = apiKeys.data?.totalPages ?? 1;
  const isEmpty = Boolean(apiKeys.data) && items.length === 0;

  return (
    <div className="api-keys">
      <header className="api-keys__heading">
        <div>
          <p>Project security</p>
          <h1>API keys</h1>
          <span>
            Credentials software uses to call the notification API for{" "}
            <strong>{project.name}</strong>. Each key carries only the scopes you grant it.
          </span>
        </div>
        {!isEmpty ? (
          <button type="button" className="api-keys__create" onClick={() => setCreateOpen(true)}>
            <Plus size={14} weight="bold" /> Create key
          </button>
        ) : null}
      </header>

      {createdKey ? (
        <CreatedKeyPanel apiKey={createdKey} onDone={() => setCreatedKey(null)} />
      ) : null}

      {apiKeys.isPending ? (
        <p className="api-keys__empty">
          <SpinnerGap className="animate-spin" size={16} /> Loading keys
        </p>
      ) : null}

      {apiKeys.isError ? (
        <p className="api-keys__message" data-tone="error">
          <WarningCircle size={15} />
          {apiKeys.error.message}
        </p>
      ) : null}

      {isEmpty ? (
        <div className="api-keys__empty-state">
          <span>
            <Key size={22} />
          </span>
          <strong>No API keys yet</strong>
          <p>
            Create a key to start sending events, rendering templates, or reading delivery data.
          </p>
          <button type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={14} weight="bold" /> Create your first key
          </button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="api-keys__list">
          {items.map((apiKey) => (
            <article
              key={apiKey.id}
              className="api-keys__row"
              data-revoked={!apiKey.isActive || undefined}
            >
              <div className="api-keys__row-main">
                <strong>
                  {apiKey.name}
                  <span className="api-keys__env" data-env={apiKey.environment}>
                    {apiKey.environment}
                  </span>
                  {apiKey.isActive ? null : <span className="api-keys__tag">revoked</span>}
                </strong>
                <code>{apiKey.keyPrefix}…</code>
                {apiKey.description ? <small>{apiKey.description}</small> : null}
                <small>
                  {apiKey.scopes.length} scope{apiKey.scopes.length === 1 ? "" : "s"} ·{" "}
                  {apiKey.lastUsedAt
                    ? `last used ${new Date(apiKey.lastUsedAt).toLocaleDateString()}`
                    : "never used"}
                </small>
              </div>
              {apiKey.isActive ? (
                <div className="api-keys__row-actions">
                  <button
                    type="button"
                    aria-label={`Rotate ${apiKey.name}`}
                    onClick={() => {
                      rotateKey.reset();
                      setKeyToRotate(apiKey);
                    }}
                  >
                    <ArrowClockwise size={15} /> Rotate
                  </button>
                  <button
                    type="button"
                    className="api-keys__danger"
                    aria-label={`Revoke ${apiKey.name}`}
                    onClick={() => {
                      revokeKey.reset();
                      setKeyToRevoke(apiKey);
                    }}
                  >
                    <Trash size={15} /> Revoke
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="api-keys__pagination">
          <button
            type="button"
            disabled={page <= 1 || apiKeys.isFetching}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || apiKeys.isFetching}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next
          </button>
        </div>
      ) : null}

      {createOpen ? (
        <ApiKeyCreateDialog
          open
          projectId={project.id}
          onOpenChange={setCreateOpen}
          onCreated={(created) => {
            setCreatedKey(created);
            setCreateOpen(false);
            setPage(1);
          }}
        />
      ) : null}

      <AppDialog
        open={Boolean(keyToRotate)}
        onOpenChange={(open) => {
          if (!open && !rotateKey.isPending) setKeyToRotate(null);
        }}
        eyebrow="API key"
        title={`Rotate ${keyToRotate?.name ?? "key"}?`}
        description="The current secret stops working immediately and a new one is issued. Update every service using this key."
        busy={rotateKey.isPending}
        footer={
          <>
            <DialogAction disabled={rotateKey.isPending} onClick={() => setKeyToRotate(null)}>
              Keep current key
            </DialogAction>
            <DialogAction tone="danger" disabled={rotateKey.isPending} onClick={handleRotate}>
              <ArrowClockwise size={15} />
              {rotateKey.isPending ? "Rotating" : "Rotate"}
            </DialogAction>
          </>
        }
      >
        {rotateKey.isError ? (
          <p className="app-dialog__error" role="alert">
            {rotateKey.error.message}
          </p>
        ) : null}
      </AppDialog>

      <AppDialog
        open={Boolean(keyToRevoke)}
        onOpenChange={(open) => {
          if (!open && !revokeKey.isPending) setKeyToRevoke(null);
        }}
        eyebrow="API key"
        title={`Revoke ${keyToRevoke?.name ?? "key"}?`}
        description="Requests using this key start failing immediately. This cannot be undone; the record is kept for audit history."
        busy={revokeKey.isPending}
        footer={
          <>
            <DialogAction disabled={revokeKey.isPending} onClick={() => setKeyToRevoke(null)}>
              Keep key
            </DialogAction>
            <DialogAction tone="danger" disabled={revokeKey.isPending} onClick={handleRevoke}>
              <Trash size={15} />
              {revokeKey.isPending ? "Revoking" : "Revoke"}
            </DialogAction>
          </>
        }
      >
        {revokeKey.isError ? (
          <p className="app-dialog__error" role="alert">
            {revokeKey.error.message}
          </p>
        ) : null}
      </AppDialog>
    </div>
  );
}
