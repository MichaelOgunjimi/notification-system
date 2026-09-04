import type { LogTone } from "@/lib/audit-log";
import "./log-pill.css";

/** Props for {@link LogPill}. */
type LogPillProps = Readonly<{
  /** Text shown beside the dot. */
  label: string;
  /** Semantic color; drives both the dot and the pill's border/text tint. */
  tone: LogTone;
}>;

/**
 * A small dotted, colored pill for a log row's action or outcome — the shared
 * visual vocabulary between the Action and Status columns.
 *
 * @param props The label and tone to render.
 * @returns The pill.
 */
export function LogPill({ label, tone }: LogPillProps) {
  return (
    <span className="log-pill" data-tone={tone}>
      {label}
    </span>
  );
}
