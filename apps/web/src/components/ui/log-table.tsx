"use client";

import { type ReactNode, useState } from "react";
import { CaretRight, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import type { AuditLogEntry } from "@beaco/control-plane";
import { absoluteFormatter, formatMetadataValue, metadataEntries } from "@/lib/audit-log";
import "./log-table.css";

/** One column in a {@link LogTable}. */
export type LogColumn<T> = Readonly<{
  /** Stable key, also used for the header cell. */
  key: string;
  /** Header label. */
  label: string;
  /** CSS grid track for this column (default: `minmax(120px, 1fr)`). */
  width?: string;
  /** Cell content for a row. */
  render: (row: T) => ReactNode;
}>;

/** Props for {@link LogTable}. */
type LogTableProps<T> = Readonly<{
  /** Column definitions, left to right. */
  columns: ReadonlyArray<LogColumn<T>>;
  /** Rows to render, newest first. */
  rows: readonly T[];
  /** Stable identity for a row, used as its React key and detail-panel id. */
  rowKey: (row: T) => string;
  /** Content revealed when a row is expanded. */
  renderExpanded: (row: T) => ReactNode;
  /** Show the loading state (first load, no rows yet). */
  pending?: boolean;
  /** Dim the body while a background refetch is in flight. */
  busy?: boolean;
  /** Error message to show in place of rows. */
  error?: string | null;
  /** Message shown when there are no rows and no error. */
  emptyLabel: string;
  /** Optional footer, typically a pager. */
  footer?: ReactNode;
}>;

/**
 * Full-width log table: a bordered card whose columns are supplied per surface,
 * with every row expanding in place to caller-rendered detail. Governance and
 * operational activity share it.
 *
 * @param props Column config, rows, and per-surface expanded content.
 * @returns The table card, including loading / empty / error states.
 */
export function LogTable<T>({
  columns,
  rows,
  rowKey,
  renderExpanded,
  pending = false,
  busy = false,
  error = null,
  emptyLabel,
  footer,
}: LogTableProps<T>) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const gridTemplate = ["20px", ...columns.map((c) => c.width ?? "minmax(120px, 1fr)")].join(" ");
  const minWidth = 620 + columns.length * 40;

  return (
    <div className="log-table" aria-busy={busy || undefined}>
      <div className="log-table__scroll">
        <div
          className="log-table__grid log-table__grid--head"
          style={{ gridTemplateColumns: gridTemplate, minWidth }}
        >
          <span />
          {columns.map((column) => (
            <span key={column.key}>{column.label}</span>
          ))}
        </div>

        {error ? (
          <div className="log-table__state" data-tone="error" role="alert" style={{ minWidth }}>
            <WarningCircle size={15} /> {error}
          </div>
        ) : pending ? (
          <div className="log-table__state" style={{ minWidth }}>
            <SpinnerGap size={16} className="animate-spin" /> Loading
          </div>
        ) : rows.length === 0 ? (
          <div className="log-table__state" style={{ minWidth }}>
            {emptyLabel}
          </div>
        ) : (
          rows.map((row) => {
            const id = rowKey(row);
            const open = expandedId === id;
            return (
              <div className="log-table__entry" key={id}>
                <button
                  type="button"
                  className="log-table__grid log-table__row"
                  style={{ gridTemplateColumns: gridTemplate, minWidth }}
                  aria-expanded={open}
                  aria-controls={`log-detail-${id}`}
                  onClick={() => setExpandedId(open ? null : id)}
                >
                  <CaretRight
                    className="log-table__caret"
                    data-open={open || undefined}
                    size={11}
                    weight="bold"
                  />
                  {columns.map((column) => (
                    <span key={column.key} className="log-table__cell">
                      {column.render(row)}
                    </span>
                  ))}
                </button>
                {open ? (
                  <div className="log-table__detail" id={`log-detail-${id}`} style={{ minWidth }}>
                    {renderExpanded(row)}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {footer ? <div className="log-table__footer">{footer}</div> : null}
    </div>
  );
}

/**
 * The standard expanded panel for an audit entry — timestamp, resource, IP, the
 * raw action key, and every metadata field as a card.
 *
 * @param props The entry to detail.
 * @returns Detail grid plus metadata cards.
 */
export function LogEntryDetail({ entry }: Readonly<{ entry: AuditLogEntry }>) {
  const detail = metadataEntries(entry.metadata);
  return (
    <>
      <dl className="log-table__detail-grid">
        <div>
          <dt>When</dt>
          <dd>{absoluteFormatter.format(new Date(entry.createdAt))}</dd>
        </div>
        <div>
          <dt>Resource</dt>
          <dd>
            {entry.resourceType}
            {entry.resourceId ? ` · ${entry.resourceId}` : ""}
          </dd>
        </div>
        <div>
          <dt>IP address</dt>
          <dd>{entry.ipAddress ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Action key</dt>
          <dd>{entry.action}</dd>
        </div>
      </dl>
      {detail.length > 0 ? (
        <div className="log-table__metadata">
          {detail.map(([key, value]) => (
            <div key={key}>
              <span>{key.replace(/_/g, " ")}</span>
              <code>{formatMetadataValue(value)}</code>
            </div>
          ))}
        </div>
      ) : (
        <p className="log-table__metadata-empty">No additional details recorded.</p>
      )}
    </>
  );
}
