"use client";

import { useMemo, useState } from "react";
import { CaretRight, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { AlertRule, Organization, Project } from "@beaco/control-plane";
import {
  useDeleteProjectAlertRule,
  useForkProjectAlertRule,
  useProjectAlertRuleDefaults,
  useProjectAlertRules,
} from "@beaco/control-plane/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { useToast } from "@/components/ui/toast";
import { AlertRuleFormDialog } from "./alert-rule-form-dialog";
import { formatThreshold, METRIC_LABELS } from "./alert-rule-format";
import "./alert-rules-panel.css";

type AlertRulesPanelProps = Readonly<{ organization: Organization; project: Project }>;

/** Config panel for a project's alert rules — sits above the issue list on /alerts. */
export function AlertRulesPanel({ organization, project }: AlertRulesPanelProps) {
  const toast = useToast();
  const rules = useProjectAlertRules(project.id);
  const defaults = useProjectAlertRuleDefaults(project.id, { perPage: 50 });
  const deleteRule = useDeleteProjectAlertRule();
  const forkRule = useForkProjectAlertRule();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);
  const [defaultsOpen, setDefaultsOpen] = useState(true);

  const capabilities = useMemo(
    () => new Set(organization.capabilities),
    [organization.capabilities],
  );
  const canManage = capabilities.has("project:deliveries:manage");

  const items = rules.data?.items ?? [];
  const defaultItems = defaults.data?.items ?? [];
  // A project's own rule for a metric overrides the org-wide default for
  // that same metric — mirrors the evaluator's "project-owned wins" check.
  const ownedMetrics = new Set(items.map((rule) => rule.metric));

  async function handleFork(rule: AlertRule) {
    try {
      await forkRule.mutateAsync({ projectId: project.id, ruleId: rule.id });
      toast.success(`${rule.name} forked into this project`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to fork this rule");
    }
  }

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

  return (
    <section className="alert-rules-panel">
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

      {items.length === 0 ? (
        <p className="alert-rules-panel__empty">
          {rules.isPending ? "Loading rules…" : "No alert rules yet."}
        </p>
      ) : (
        <ul className="alert-rules-panel__list">
          {items.map((rule) => (
            <li key={rule.id}>
              <div className="alert-rules-panel__summary">
                <strong>{rule.name}</strong>
                <span>
                  {METRIC_LABELS[rule.metric]} {rule.comparison === "lt" ? "<" : ">"}{" "}
                  {formatThreshold(rule.metric, rule.threshold)} over {rule.windowMinutes}m
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

      <div className="alert-rules-panel__defaults">
        <button
          type="button"
          className="alert-rules-panel__defaults-toggle"
          data-open={defaultsOpen || undefined}
          onClick={() => setDefaultsOpen((open) => !open)}
        >
          <CaretRight size={10} weight="bold" aria-hidden />
          <h3>Shared from organization</h3>
          <span>{defaultItems.length}</span>
        </button>
        {defaultsOpen ? (
          defaultItems.length === 0 ? (
            <p className="alert-rules-panel__empty">No org-wide rules yet.</p>
          ) : (
            <ul className="alert-rules-panel__list">
              {defaultItems.map((rule) => (
                <li key={rule.id}>
                  <div className="alert-rules-panel__summary">
                    <strong>{rule.name}</strong>
                    <span>
                      {METRIC_LABELS[rule.metric]} {rule.comparison === "lt" ? "<" : ">"}{" "}
                      {formatThreshold(rule.metric, rule.threshold)} over {rule.windowMinutes}m
                    </span>
                  </div>
                  <div className="alert-rules-panel__meta">
                    {canManage ? (
                      ownedMetrics.has(rule.metric) ? (
                        <span
                          className="alert-rules-panel__already"
                          title="This project already has a rule for this metric"
                        >
                          Already added
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="alert-rules-panel__fork-btn"
                          onClick={() => handleFork(rule)}
                          disabled={forkRule.isPending}
                        >
                          Fork
                        </button>
                      )
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {formOpen ? (
        <AlertRuleFormDialog
          open={formOpen}
          scope={{ projectId: project.id }}
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
