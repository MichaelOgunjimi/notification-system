"use client";

import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import "./session-recovery.css";

type SessionRecoveryProps = Readonly<{
  onRetry: () => void;
  fullPage?: boolean;
}>;

/**
 * Presents a recoverable session-service failure without claiming the user has
 * been signed out.
 *
 * @param props Retry callback and optional full-page presentation mode.
 * @returns An accessible recovery message with an explicit retry action.
 */
export function SessionRecovery({ onRetry, fullPage = false }: SessionRecoveryProps) {
  return (
    <section
      className="session-recovery"
      data-full-page={fullPage || undefined}
      aria-labelledby="session-recovery-title"
    >
      <div className="session-recovery__panel">
        <WarningCircle size={22} />
        <p className="session-recovery__kicker">Connection interrupted</p>
        <h1 id="session-recovery-title">We could not restore your session yet.</h1>
        <p>
          Your account may still be signed in. Check the connection and try the secure session
          again.
        </p>
        <button type="button" onClick={onRetry}>
          <ArrowClockwise size={15} /> Retry session
        </button>
      </div>
    </section>
  );
}
