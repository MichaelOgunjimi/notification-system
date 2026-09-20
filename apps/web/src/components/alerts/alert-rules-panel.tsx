"use client";

import { useMemo, useState } from "react";
import { PencilSimple, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import type { AlertMetric, AlertRule, Organization, Project } from "@beaco/control-plane";
import { useDeleteProjectAlertRule, useProjectAlertRules } from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { AlertRuleFormDialog } from "./alert-rule-form-dialog";
import "./alert-rules-panel.css";

type AlertRulesPanelProps = Readonly<{ organization: Organization; project: Project }>;

const METRIC_LABELS: Record<AlertMetric, string> = {
  failure_rate: "Failure rate",
  dead_letter_count: "Dead letters",
  avg_latency_ms: "Avg latency",
};

function formatThreshold(metric: AlertMetric, threshold: number): string {
  if (metric === "failure_rate") return `${threshold}%`;
  if (metric === "avg_latency_ms") return `${threshold}ms`;
  return String(threshold);
}

/** Config panel for a project's alert rules — sits above the issue list on /alerts. */
export function AlertRulesPanel({ organization, project }: AlertRulesPanelProps) {
  const toast = useToast();
  const rules = useProjectAlertRules(project.id);
  const deleteRule = useDeleteProjectAlertRule();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);

  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canManage = capabilities.has("project:deliveries:manage");

  function openCreate() {
    setEditingRule(null);
    setFormOpen(true);
  }

  function openEdit(rule: AlertRule) {
    setEditingRule(rule);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRule.mutateAsync({ projectId: project.id, ruleId: deleteTarget.id });
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete this rule");
    }
  }

  const items = rules.data?.items ?? [];

  return (
    <section className="alert-rules-panel" aria-busy={rules.isFetching || undefined}>
      <header>
        <div>
          <h2>Alert rules</h2>
          <p>Get an email when a metric crosses its threshold.</p>
        </div>
        {canManage ? (
          <button type="button" className="alert-rules-panel__new" onClick={openCreate}>
            <Plus size={14} weight="bold" />
            New rule
          </button>
        ) : null}
      </header>

      {rules.isPending ? (
        <>
          <span className="sr-only" role="status">
            Loading alert rules
          </span>
          <ul className="alert-rules-panel__list" aria-busy="true">
            {[0, 1, 2].map((row) => (
              <li className="alert-rules-panel__skeleton-row" key={row} aria-hidden="true">
                <span className="alert-rules-panel__skeleton-summary">
                  <Skeleton />
                  <Skeleton />
                </span>
                <span className="alert-rules-panel__skeleton-meta">
                  <Skeleton />
                  {canManage ? <Skeleton /> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : rules.isError && items.length === 0 ? (
        <div className="alert-rules-panel__error" role="alert">
          <WarningCircle size={15} />
          <span>{rules.error.message}</span>
          <button type="button" onClick={() => void rules.refetch()}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="alert-rules-panel__empty">No alert rules yet.</p>
      ) : (
        <ul className="alert-rules-panel__list" aria-busy={rules.isFetching || undefined}>
          {items.map((rule) => (
            <li key={rule.id}>
              <div className="alert-rules-panel__summary">
                <strong>{rule.name}</strong>
                <span>
                  {METRIC_LABELS[rule.metric]} &gt; {formatThreshold(rule.metric, rule.threshold)}{" "}
                  over {rule.windowMinutes}m
                </span>
              </div>
              <div className="alert-rules-panel__meta">
                <span
                  className="alert-rules-panel__status"
                  data-tone={rule.isActive ? "success" : "muted"}
                >
                  <i />
                  {rule.isActive ? "Active" : "Paused"}
                </span>
                {canManage ? (
                  <span className="alert-rules-panel__actions">
                    <button
                      type="button"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => openEdit(rule)}
                    >
                      <PencilSimple size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setDeleteTarget(rule)}
                    >
                      <Trash size={13} />
                    </button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rules.isError && items.length > 0 ? (
        <div className="alert-rules-panel__error" role="alert">
          <WarningCircle size={15} />
          <span>{rules.error.message}</span>
          <button type="button" onClick={() => void rules.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {formOpen ? (
        <AlertRuleFormDialog
          open={formOpen}
          projectId={project.id}
          rule={editingRule}
          onOpenChange={setFormOpen}
          onSaved={() => setFormOpen(false)}
        />
      ) : null}

      <AppDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteRule.isPending) setDeleteTarget(null);
        }}
        eyebrow="Alert rules"
        title={`Delete ${deleteTarget?.name ?? "this rule"}?`}
        description="This stops monitoring immediately. It can't be undone."
        busy={deleteRule.isPending}
        footer={
          <>
            <DialogAction disabled={deleteRule.isPending} onClick={() => setDeleteTarget(null)}>
              Cancel
            </DialogAction>
            <DialogAction tone="danger" disabled={deleteRule.isPending} onClick={handleDelete}>
              {deleteRule.isPending ? "Deleting…" : "Delete rule"}
            </DialogAction>
          </>
        }
      />
    </section>
  );
}
