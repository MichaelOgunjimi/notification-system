/** The mutually exclusive body states rendered by the shared log table. */
export type LogTableState = "error" | "pending" | "empty" | "rows";

/**
 * Resolves the log-table body state without treating background refetches as initial loading.
 *
 * @param error Current query error, if any.
 * @param pending Whether the query has never produced data.
 * @param rowCount Number of usable rows currently available.
 * @returns The single body state to render.
 */
export function getLogTableState(
  error: string | null,
  pending: boolean,
  rowCount: number,
): LogTableState {
  if (error && rowCount === 0) return "error";
  if (pending && rowCount === 0) return "pending";
  return rowCount === 0 ? "empty" : "rows";
}
