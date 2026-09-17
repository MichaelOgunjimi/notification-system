"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react";
import type {
  NotificationChannel,
  NotificationStatus,
  Organization,
  Project,
  TenantNotification,
} from "@beaco/control-plane";
import { useProjectNotifications } from "@beaco/control-plane/react";
import { AppSelect } from "@/components/ui/app-select";
import { TablePager } from "@/components/ui/table-pager";
import { useRememberedSearchParams } from "@/components/ui/use-remembered-search-params";
import { relativeTime } from "@/lib/audit-log";
import "./delivery-page.css";

type DeliveryPageProps = Readonly<{
  organization: Organization;
  project: Project;
  /** Scopes the surface to failed/dead-lettered deliveries for the Alerts nav item, sharing every other behavior with Delivery. */
  restrictToIssues?: boolean;
}>;

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
const STATUS_OPTIONS: ReadonlyArray<{ value: NotificationStatus | ""; label: string }> = [
  { value: "", label: "All states" },
  { value: "delivered", label: "Delivered" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
  { value: "dead_letter", label: "Dead letter" },
];
const ISSUE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  statuses: readonly NotificationStatus[];
}> = [
  { value: "all", label: "All issues", statuses: ["failed", "dead_letter"] },
  { value: "dead_letter", label: "Dead letter", statuses: ["dead_letter"] },
  { value: "failed", label: "Failed", statuses: ["failed"] },
];
const CHANNEL_CHIPS: ReadonlyArray<{ value: NotificationChannel | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "webhook", label: "Webhook" },
];
const RANGE_MS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 } as const;

function statusTone(status: NotificationStatus): "success" | "danger" | "warning" | "muted" {
  if (status === "delivered") return "success";
  if (status === "failed" || status === "dead_letter") return "danger";
  if (status === "queued" || status === "processing") return "warning";
  return "muted";
}

function rangeStart(range: keyof typeof RANGE_MS | "all"): string | undefined {
  return range === "all" ? undefined : new Date(Date.now() - RANGE_MS[range]).toISOString();
}

/** Project delivery stream linking every notification back to its source event. */
export function DeliveryPage({ organization, project, restrictToIssues }: DeliveryPageProps) {
  const router = useRouter();
  const { params, replace } = useRememberedSearchParams();
  const status = STATUS_OPTIONS.some((option) => option.value === params.get("status"))
    ? (params.get("status") as NotificationStatus | "")
    : "";
  const issue = ISSUE_OPTIONS.some((option) => option.value === params.get("issue"))
    ? params.get("issue")!
    : "all";
  const channel = CHANNEL_CHIPS.some((option) => option.value === params.get("channel"))
    ? (params.get("channel") as NotificationChannel | "")
    : "";
  const rangeValue = params.get("range");
  const defaultRange = restrictToIssues ? "all" : "7d";
  const range =
    rangeValue === "24h" || rangeValue === "7d" || rangeValue === "30d" || rangeValue === "all"
      ? rangeValue
      : defaultRange;
  const search = params.get("search") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const requestedPerPage = Number(params.get("perPage"));
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(requestedPerPage)
    ? requestedPerPage
    : 25;
  const from = useMemo(() => rangeStart(range), [range]);
  const query = useProjectNotifications(project.id, {
    page,
    perPage,
    status: restrictToIssues
      ? ISSUE_OPTIONS.find((option) => option.value === issue)!.statuses
      : status || undefined,
    channel: channel || undefined,
    search: search || undefined,
    from,
  });

  function patch(next: Record<string, string | number | undefined>) {
    const updated = new URLSearchParams(params.toString());
    const pagingOnly = Object.keys(next).every((key) => key === "page" || key === "perPage");
    if (!pagingOnly) updated.delete("page");
    for (const [key, value] of Object.entries(next)) {
      if (
        value === undefined ||
        value === "" ||
        value === 1 ||
        (key === "range" && value === defaultRange) ||
        (key === "issue" && value === "all")
      ) {
        updated.delete(key);
      } else {
        updated.set(key, String(value));
      }
    }
    replace(updated);
  }

  function notificationHref(notification: TenantNotification) {
    const basePath = restrictToIssues ? "alerts" : "delivery";
    return `/app/${organization.slug}/${project.slug}/${basePath}/${notification.id}`;
  }

  const notifications = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  return (
    <div className="delivery-page">
      <header className="delivery-page__heading">
        <p>Operate</p>
        <h1>{restrictToIssues ? "Alerts" : "Delivery"}</h1>
        <span>
          {restrictToIssues
            ? "Every failed or dead-lettered delivery that needs attention."
            : "Every channel-specific message spawned from your events, with retries attached."}
        </span>
      </header>

      <section className="delivery-page__scope">
        <CaretRight size={16} weight="bold" aria-hidden />
        <span>
          <small>Project</small>
          <strong>{project.name}</strong>
        </span>
        <em>
          {query.data
            ? `${total.toLocaleString()} ${restrictToIssues ? "needing attention" : "deliveries"}`
            : "Counting…"}
        </em>
      </section>

      <div className="delivery-page__filters">
        <span className="delivery-page__chips">
          {CHANNEL_CHIPS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              data-active={channel === option.value || undefined}
              onClick={() => patch({ channel: option.value })}
            >
              {option.label}
            </button>
          ))}
        </span>
        {restrictToIssues ? (
          <span className="delivery-page__chips">
            {ISSUE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={issue === option.value || undefined}
                onClick={() => patch({ issue: option.value })}
              >
                {option.label}
              </button>
            ))}
          </span>
        ) : (
          <AppSelect
            aria-label="Delivery state"
            value={status}
            onValueChange={(value) => patch({ status: value })}
            options={STATUS_OPTIONS}
          />
        )}
        <span className="delivery-page__chips">
          {(["24h", "7d", "30d", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-active={range === value || undefined}
              onClick={() => patch({ range: value })}
            >
              {value === "all" ? "All" : value}
            </button>
          ))}
        </span>
      </div>

      <input
        className="delivery-page__search"
        type="search"
        value={search}
        placeholder="Search recipient, event, or id…"
        onChange={(event) => patch({ search: event.target.value })}
      />

      <section className="delivery-page__table">
        <header>
          <div>
            <h2>{restrictToIssues ? "Attention needed" : "Notification stream"}</h2>
            <p>
              {restrictToIssues
                ? "Failed and dead-lettered deliveries, newest first."
                : "Newest delivery instances first."}
            </p>
          </div>
          <span>
            <i /> Live
          </span>
        </header>
        <div className="delivery-page__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Message</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Attempts</th>
                <th>Status</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr
                  key={notification.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(notificationHref(notification))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(notificationHref(notification));
                  }}
                >
                  <td className="delivery-page__time">{relativeTime(notification.createdAt)}</td>
                  <td>
                    <strong>{notification.eventType}</strong>
                    <small>{notification.id.slice(0, 18)}…</small>
                  </td>
                  <td>
                    <span className="delivery-page__channel" data-channel={notification.channel}>
                      {notification.channel}
                    </span>
                  </td>
                  <td className="delivery-page__recipient">{notification.recipientAddress}</td>
                  <td className="delivery-page__attempts">
                    {notification.retryCount + 1} / {notification.maxRetries + 1}
                  </td>
                  <td>
                    <span
                      className="delivery-page__status"
                      data-tone={statusTone(notification.status)}
                    >
                      <i />
                      {notification.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="delivery-page__chevron">
                    <CaretRight size={13} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notifications.length === 0 ? (
          <p className="delivery-page__empty">
            {query.isPending
              ? "Loading deliveries…"
              : query.isError
                ? "Delivery data could not be loaded."
                : "No deliveries match these filters."}
          </p>
        ) : null}
        {total > 0 ? (
          <div className="delivery-page__pager">
            <TablePager
              page={page}
              totalPages={Math.max(1, query.data?.totalPages ?? 1)}
              total={total}
              perPage={perPage}
              perPageOptions={PER_PAGE_OPTIONS}
              busy={query.isFetching}
              onPageChange={(nextPage) => patch({ page: nextPage })}
              onPerPageChange={(nextPerPage) => patch({ perPage: nextPerPage, page: 1 })}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
