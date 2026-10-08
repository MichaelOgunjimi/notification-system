"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import type {
  ControlPlaneIssue,
  EventPriority,
  NotificationChannel,
  Organization,
  Project,
} from "@beaco/control-plane";
import { ControlPlaneError } from "@beaco/control-plane";
import {
  useCreateProjectScheduledEvent,
  useProjectApiKeys,
  useProjectTemplateDefaults,
  useProjectTemplates,
} from "@beaco/control-plane/react";
import { AppSelect, type AppSelectOption } from "@/components/ui/app-select";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  buildScheduleRequest,
  describeUtcOffset,
  emptyRecipient,
  keyEligibility,
  routeIssues,
  todayLocal,
  toOffsetIso,
  type FieldErrors,
  type RecipientDraft,
  type ScheduleFormState,
} from "@/lib/schedule-form";
import "./scheduled-motion.css";
import "./scheduled-event-form-page.css";

/** Props for {@link ScheduledEventFormPage}. */
type ScheduledEventFormPageProps = Readonly<{
  organization: Organization;
  project: Project;
}>;

const CHANNELS: readonly NotificationChannel[] = ["email", "sms", "webhook"];
const PRIORITIES: readonly EventPriority[] = ["high", "medium", "low"];
const OFFSET_DAY_MS = 86_400_000;

function tomorrowLocal(): string {
  const next = new Date(Date.now() + OFFSET_DAY_MS);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

const ADDRESS_FIELDS = {
  email: { key: "email", label: "Email", placeholder: "ada@example.com", type: "email" },
  sms: { key: "phone", label: "Phone (E.164)", placeholder: "+15551234567", type: "tel" },
  webhook: {
    key: "webhookUrl",
    label: "Webhook URL",
    placeholder: "https://example.com/hooks/beaco",
    type: "url",
  },
} as const;

/**
 * Schedule an event from the dashboard.
 *
 * The event is created as one of the project's API keys, chosen by name; revoked and under-scoped
 * keys are listed but disabled. The date-time is sent with the user's UTC offset. Validation is the
 * API's, and what it rejects is shown next to the field it concerns.
 *
 * @param props Active organization and project.
 * @returns The schedule form.
 */
export function ScheduledEventFormPage({ organization, project }: ScheduledEventFormPageProps) {
  const router = useRouter();
  const toast = useToast();
  const ids = { form: useId(), key: useId(), type: useId(), template: useId(), time: useId() };
  const recipientCounter = useRef(1);
  const create = useCreateProjectScheduledEvent();

  const backHref = `/app/${organization.slug}/${project.slug}/scheduled-events`;
  const canManage = new Set(organization.capabilities).has("project:deliveries:manage");

  const keysQuery = useProjectApiKeys(project.id, { perPage: 100 });
  const templatesQuery = useProjectTemplates(project.id, { perPage: 100 });
  const defaultsQuery = useProjectTemplateDefaults(project.id, { perPage: 100 });

  const [form, setForm] = useState<ScheduleFormState>(() => ({
    apiKeyId: "",
    eventType: "",
    priority: "medium",
    source: "template",
    templateName: "",
    subject: "",
    html: "",
    text: "",
    recipients: [emptyRecipient("r0")],
    payload: "{}",
    date: tomorrowLocal(),
    time: "09:00",
  }));
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [serverIssues, setServerIssues] = useState<readonly ControlPlaneIssue[]>([]);

  const keys = useMemo(() => keysQuery.data?.items ?? [], [keysQuery.data]);
  const eligibleKeys = keys.filter((key) => keyEligibility(key).eligible);
  // With exactly one usable key there is nothing to decide, so it is preselected.
  const apiKeyId = form.apiKeyId || (eligibleKeys.length === 1 ? eligibleKeys[0]!.id : "");

  const keyOptions: AppSelectOption<string>[] = keys.map((key) => {
    const { eligible, reason } = keyEligibility(key);
    return {
      value: key.id,
      disabled: !eligible,
      label: (
        <span className="schedule-form__key" data-disabled={!eligible || undefined}>
          <strong>{key.name}</strong>
          <code>{key.keyPrefix}…</code>
          <small>{key.environment}</small>
          {reason ? <em>{reason}</em> : null}
        </span>
      ),
    };
  });

  const templateOptions: AppSelectOption<string>[] = useMemo(() => {
    const seen = new Set<string>();
    return [...(templatesQuery.data?.items ?? []), ...(defaultsQuery.data?.items ?? [])]
      .filter(
        (template) => template.isActive && !seen.has(template.name) && seen.add(template.name),
      )
      .map((template) => ({
        value: template.name,
        label: (
          <span className="schedule-form__key">
            <strong>{template.name}</strong>
            <small>{template.channel}</small>
            {template.projectId === null ? <em>default</em> : null}
          </span>
        ),
      }));
  }, [templatesQuery.data, defaultsQuery.data]);

  const serverRouted = useMemo(() => routeIssues(serverIssues), [serverIssues]);
  const errors: FieldErrors = { ...serverRouted.fields, ...clientErrors };
  const when = toOffsetIso(form.date, form.time);

  function patch(next: Partial<ScheduleFormState>) {
    setForm((current) => ({ ...current, ...next }));
    // Editing a field clears its stale message, client or server.
    const touched = Object.keys(next);
    setClientErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !touched.includes(key))),
    );
  }

  function patchRecipient(id: string, next: Partial<RecipientDraft>) {
    setForm((current) => ({
      ...current,
      recipients: current.recipients.map((r) => (r.id === id ? { ...r, ...next } : r)),
    }));
    setClientErrors({});
    setServerIssues([]);
  }

  function toggleChannel(recipient: RecipientDraft, channel: NotificationChannel) {
    const channels = recipient.channels.includes(channel)
      ? recipient.channels.filter((c) => c !== channel)
      : CHANNELS.filter((c) => c === channel || recipient.channels.includes(c));
    patchRecipient(recipient.id, { channels });
  }

  function addRecipient() {
    setForm((current) => ({
      ...current,
      recipients: [...current.recipients, emptyRecipient(`r${recipientCounter.current++}`)],
    }));
  }

  function removeRecipient(id: string) {
    setForm((current) => ({
      ...current,
      recipients: current.recipients.filter((r) => r.id !== id),
    }));
    setClientErrors({});
    setServerIssues([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerIssues([]);
    create.reset();
    const built = buildScheduleRequest({ ...form, apiKeyId });
    if ("errors" in built) {
      setClientErrors(built.errors);
      return;
    }
    setClientErrors({});
    create.mutate(
      { projectId: project.id, input: built.input },
      {
        onSuccess: (created) => {
          toast.success("Event scheduled");
          router.push(`${backHref}/${created.id}`);
        },
        onError: (error) => {
          const issues =
            error instanceof ControlPlaneError && error.issues.length > 0
              ? error.issues
              : [{ field: null, message: error.message }];
          setServerIssues(issues);
        },
      },
    );
  }

  const fieldError = (name: string) =>
    errors[name] ? (
      <p className="schedule-form__error" role="alert" id={`${ids.form}-${name}`}>
        {errors[name]}
      </p>
    ) : null;
  const invalid = (name: string) =>
    errors[name] ? { "aria-invalid": true, "aria-describedby": `${ids.form}-${name}` } : {};

  const generalErrors = [
    ...serverRouted.general,
    ...(create.isError && serverIssues.length === 0 ? [create.error.message] : []),
  ];

  if (!canManage) {
    return (
      <div className="schedule-form">
        <Link href={backHref} className="schedule-form__back">
          <ArrowLeft size={13} />
          All scheduled events
        </Link>
        <p className="schedule-form__notice" role="alert">
          Your role cannot schedule events for this project.
        </p>
      </div>
    );
  }

  return (
    <div className="schedule-form">
      <Link href={backHref} className="schedule-form__back">
        <ArrowLeft size={13} />
        All scheduled events
      </Link>

      <header className="schedule-form__head scheduled-fade-in">
        <p>Operate</p>
        <h1>Schedule an event</h1>
        <span>
          Queue an event for a future time. It is created as the API key you choose and becomes a
          normal event when it is due.
        </span>
      </header>

      <form id={ids.form} onSubmit={handleSubmit} noValidate>
        <section className="schedule-form__card scheduled-fade-in" style={{ "--i": 1 } as never}>
          <h2>Send as</h2>
          <div className="schedule-form__body">
            <label htmlFor={ids.key}>API key</label>
            {keysQuery.isPending ? (
              <Skeleton className="schedule-form__skeleton" />
            ) : keysQuery.isError ? (
              <p className="schedule-form__error" role="alert">
                {keysQuery.error.message}
              </p>
            ) : (
              <AppSelect
                id={ids.key}
                aria-label="API key"
                containerClassName="schedule-form__select"
                value={apiKeyId}
                placeholder="Choose an API key"
                options={keyOptions}
                onValueChange={(value) => patch({ apiKeyId: value })}
              />
            )}
            {fieldError("apiKeyId")}
            {keysQuery.data && eligibleKeys.length === 0 ? (
              <p className="schedule-form__notice" role="status">
                No active key has the <code>scheduled_events:write</code> scope.{" "}
                <Link href={`/app/${organization.slug}/${project.slug}/settings/security`}>
                  Manage API keys
                </Link>
              </p>
            ) : (
              <p className="schedule-form__hint">
                Keys that are revoked or lack <code>scheduled_events:write</code> are disabled. The
                event is owned by, and counted against, the key you pick.
              </p>
            )}
          </div>
        </section>

        <section className="schedule-form__card scheduled-fade-in" style={{ "--i": 2 } as never}>
          <h2>Event</h2>
          <div className="schedule-form__body">
            <div className="schedule-form__row">
              <div>
                <label htmlFor={ids.type}>Event type</label>
                <input
                  id={ids.type}
                  value={form.eventType}
                  maxLength={255}
                  placeholder="renewal.reminder"
                  onChange={(event) => patch({ eventType: event.target.value })}
                  {...invalid("eventType")}
                />
                {fieldError("eventType")}
              </div>
              <div>
                <span className="schedule-form__label">Priority</span>
                <div className="schedule-form__segmented" role="radiogroup" aria-label="Priority">
                  {PRIORITIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={form.priority === value}
                      data-active={form.priority === value || undefined}
                      onClick={() => patch({ priority: value })}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <span className="schedule-form__label">Content</span>
            <div className="schedule-form__segmented" role="radiogroup" aria-label="Content source">
              {(["template", "inline"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.source === value}
                  data-active={form.source === value || undefined}
                  onClick={() => patch({ source: value })}
                >
                  {value === "template" ? "Template" : "Inline email"}
                </button>
              ))}
            </div>

            {form.source === "template" ? (
              <>
                <label htmlFor={ids.template}>Template</label>
                <AppSelect
                  id={ids.template}
                  aria-label="Template"
                  containerClassName="schedule-form__select"
                  value={form.templateName}
                  placeholder={
                    templatesQuery.isPending ? "Loading templates…" : "Choose a template by name"
                  }
                  options={templateOptions}
                  onValueChange={(value) => patch({ templateName: value })}
                />
                {fieldError("templateName")}
                <p className="schedule-form__hint">
                  Rendered when the event is due, so edits made before then apply.
                </p>
              </>
            ) : (
              <>
                <label htmlFor={`${ids.form}-subject`}>Subject</label>
                <input
                  id={`${ids.form}-subject`}
                  value={form.subject}
                  maxLength={500}
                  placeholder="Your plan renews soon"
                  onChange={(event) => patch({ subject: event.target.value })}
                  {...invalid("subject")}
                />
                {fieldError("subject")}
                <label htmlFor={`${ids.form}-html`}>Body (HTML)</label>
                <textarea
                  id={`${ids.form}-html`}
                  rows={6}
                  value={form.html}
                  placeholder="<p>Hi, your plan renews on…</p>"
                  onChange={(event) => patch({ html: event.target.value })}
                  {...invalid("html")}
                />
                {fieldError("html")}
                <label htmlFor={`${ids.form}-text`}>Plain-text body (optional)</label>
                <textarea
                  id={`${ids.form}-text`}
                  rows={3}
                  value={form.text}
                  onChange={(event) => patch({ text: event.target.value })}
                  {...invalid("text")}
                />
                {fieldError("text")}
              </>
            )}

            <label htmlFor={`${ids.form}-payload`}>Payload / template variables (JSON)</label>
            <textarea
              id={`${ids.form}-payload`}
              rows={4}
              value={form.payload}
              spellCheck={false}
              placeholder='{"name": "Ada", "renewal_date": "2026-11-01"}'
              onChange={(event) => patch({ payload: event.target.value })}
              {...invalid("payload")}
            />
            {fieldError("payload")}
          </div>
        </section>

        <section className="schedule-form__card scheduled-fade-in" style={{ "--i": 3 } as never}>
          <h2>
            Recipients <span>{form.recipients.length}</span>
          </h2>
          <div className="schedule-form__body">
            {form.recipients.map((recipient, index) => (
              <fieldset key={recipient.id} className="schedule-form__recipient">
                <legend>Recipient {index + 1}</legend>
                <div className="schedule-form__row">
                  <div>
                    <label htmlFor={`${ids.form}-user-${recipient.id}`}>User ID (optional)</label>
                    <input
                      id={`${ids.form}-user-${recipient.id}`}
                      value={recipient.userId}
                      placeholder="user_123"
                      onChange={(event) =>
                        patchRecipient(recipient.id, { userId: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <span className="schedule-form__label">Channels</span>
                    <div className="schedule-form__segmented" role="group" aria-label="Channels">
                      {CHANNELS.map((channel) => (
                        <button
                          key={channel}
                          type="button"
                          aria-pressed={recipient.channels.includes(channel)}
                          data-active={recipient.channels.includes(channel) || undefined}
                          onClick={() => toggleChannel(recipient, channel)}
                        >
                          {channel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {fieldError(`recipients.${index}.channels`)}
                {CHANNELS.filter((channel) => recipient.channels.includes(channel)).map(
                  (channel) => {
                    const field = ADDRESS_FIELDS[channel];
                    const name = `recipients.${index}.${field.key}`;
                    const inputId = `${ids.form}-${field.key}-${recipient.id}`;
                    return (
                      <div key={channel}>
                        <label htmlFor={inputId}>{field.label}</label>
                        <input
                          id={inputId}
                          type={field.type}
                          value={recipient[field.key]}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            patchRecipient(recipient.id, { [field.key]: event.target.value })
                          }
                          {...invalid(name)}
                        />
                        {fieldError(name)}
                      </div>
                    );
                  },
                )}
                {form.recipients.length > 1 ? (
                  <button
                    type="button"
                    className="schedule-form__link-button"
                    onClick={() => removeRecipient(recipient.id)}
                  >
                    <Trash size={13} /> Remove recipient
                  </button>
                ) : null}
              </fieldset>
            ))}
            <button type="button" className="schedule-form__add" onClick={addRecipient}>
              <Plus size={13} /> Add recipient
            </button>
          </div>
        </section>

        <section className="schedule-form__card scheduled-fade-in" style={{ "--i": 4 } as never}>
          <h2>When</h2>
          <div className="schedule-form__body">
            <div className="schedule-form__row schedule-form__row--when">
              <div>
                <span className="schedule-form__label">Date</span>
                <AppDatePicker
                  label="Date"
                  value={form.date}
                  min={todayLocal()}
                  onChange={(value) => patch({ date: value })}
                />
              </div>
              <div>
                <label htmlFor={ids.time}>Time</label>
                <input
                  id={ids.time}
                  type="time"
                  value={form.time}
                  onChange={(event) => patch({ time: event.target.value })}
                  {...invalid("scheduledFor")}
                />
              </div>
            </div>
            {fieldError("scheduledFor")}
            <p className="schedule-form__hint">
              {when
                ? `Your local time, ${describeUtcOffset(form.date)}. Sent as ${when}.`
                : "Pick a date and a time."}{" "}
              Events more than an hour overdue are expired rather than sent.
            </p>
          </div>
        </section>

        {generalErrors.length > 0 ? (
          <div className="schedule-form__alert" role="alert">
            <WarningCircle size={15} />
            <ul>
              {generalErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="schedule-form__actions">
          <Link href={backHref} className="schedule-form__secondary">
            Cancel
          </Link>
          <button type="submit" className="schedule-form__submit" disabled={create.isPending}>
            <CalendarCheck size={15} />
            {create.isPending ? "Scheduling" : "Schedule event"}
          </button>
        </div>
      </form>
    </div>
  );
}
