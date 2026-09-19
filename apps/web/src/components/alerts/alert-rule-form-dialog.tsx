"use client";

import { FormEvent, useId, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import type { AlertMetric, AlertRule } from "@beaco/control-plane";
import { useCreateProjectAlertRule, useUpdateProjectAlertRule } from "@beaco/control-plane/react";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";

type AlertRuleFormDialogProps = Readonly<{
  open: boolean;
  projectId: string;
  /** A rule to edit, or null to create a new one owned by this project. */
  rule: AlertRule | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}>;

const METRICS: ReadonlyArray<{ value: AlertMetric; label: string; placeholder: string }> = [
  { value: "failure_rate", label: "Failure rate", placeholder: "10" },
  { value: "dead_letter_count", label: "Dead letters", placeholder: "5" },
  { value: "avg_latency_ms", label: "Avg latency", placeholder: "2000" },
];

/**
 * Modal form for creating or editing a project's alert rule. Fires an email
 * when the chosen metric exceeds its threshold over the trailing window, at
 * most once per window (the evaluator's own cooldown).
 *
 * @param props Dialog visibility, the target project, an optional rule to
 *   edit, and success/close callbacks.
 * @returns The create/edit alert rule dialog.
 */
export function AlertRuleFormDialog({
  open,
  projectId,
  rule,
  onOpenChange,
  onSaved,
}: AlertRuleFormDialogProps) {
  const toast = useToast();
  const formId = useId();
  const nameId = useId();
  const thresholdId = useId();
  const windowId = useId();
  const emailId = useId();
  const createRule = useCreateProjectAlertRule();
  const updateRule = useUpdateProjectAlertRule();
  const mutation = rule ? updateRule : createRule;

  const [name, setName] = useState(rule?.name ?? "");
  const [metric, setMetric] = useState<AlertMetric>(rule?.metric ?? "failure_rate");
  const [threshold, setThreshold] = useState(rule ? String(rule.threshold) : "");
  const [windowMinutes, setWindowMinutes] = useState(String(rule?.windowMinutes ?? 60));
  const [notifyEmail, setNotifyEmail] = useState(rule?.notifyEmail ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const activeMetric = METRICS.find((option) => option.value === metric) ?? METRICS[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    mutation.reset();
    if (!name.trim()) return setFormError("Enter a name for this rule.");
    const thresholdValue = Number(threshold);
    if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
      return setFormError("Enter a threshold greater than 0.");
    }
    const windowValue = Number(windowMinutes);
    if (!Number.isInteger(windowValue) || windowValue <= 0) {
      return setFormError("Enter a window in whole minutes, greater than 0.");
    }

    try {
      if (rule) {
        await updateRule.mutateAsync({
          projectId,
          ruleId: rule.id,
          changes: {
            name: name.trim(),
            metric,
            threshold: thresholdValue,
            windowMinutes: windowValue,
            notifyEmail: notifyEmail.trim() || null,
          },
        });
        toast.success(`${name.trim()} updated`);
      } else {
        await createRule.mutateAsync({
          projectId,
          input: {
            name: name.trim(),
            metric,
            threshold: thresholdValue,
            windowMinutes: windowValue,
            notifyEmail: notifyEmail.trim() || null,
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
      eyebrow="Alert rules"
      title={rule ? "Edit alert rule" : "New alert rule"}
      description="Fires an email when this metric exceeds its threshold, at most once per window."
      busy={mutation.isPending}
      formId={formId}
      submitLabel={rule ? "Save changes" : "Create rule"}
      submitDisabled={!name.trim() || !threshold.trim()}
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
            placeholder="High failure rate"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>

      <span className="form-dialog__field-label">Metric</span>
      <div className="form-dialog__segmented" role="radiogroup" aria-label="Metric">
        {METRICS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={metric === option.value}
            data-active={metric === option.value || undefined}
            onClick={() => setMetric(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="form-dialog__field-row">
        <div>
          <label htmlFor={thresholdId}>Threshold</label>
          <input
            id={thresholdId}
            type="number"
            min={0}
            step="any"
            value={threshold}
            placeholder={activeMetric.placeholder}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={windowId}>Window (minutes)</label>
          <input
            id={windowId}
            type="number"
            min={1}
            step={1}
            value={windowMinutes}
            onChange={(event) => setWindowMinutes(event.target.value)}
          />
        </div>
      </div>

      <label htmlFor={emailId}>Notify email (optional)</label>
      <input
        id={emailId}
        type="email"
        value={notifyEmail}
        placeholder="oncall@example.com"
        onChange={(event) => setNotifyEmail(event.target.value)}
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
