"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import "./app-dialog.css";

type AppDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  eyebrow?: string;
  children?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}>;

type DialogActionProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Readonly<{
    tone?: "neutral" | "primary" | "danger";
  }>;

/**
 * Renders a site-wide modal surface using the browser's native dialog top layer.
 *
 * The component traps focus while open, supports Escape and backdrop dismissal,
 * and prevents accidental dismissal while a caller-controlled action is busy.
 *
 * @param props Controlled visibility, copy, optional content, actions, and busy state.
 * @returns An accessible modal dialog synchronized with the supplied open state.
 * @sideEffects Calls the native `showModal` and `close` APIs when visibility changes.
 */
export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  children,
  footer,
  busy = false,
}: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose() {
    if (!busy) onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="app-dialog__surface">
        <header className="app-dialog__header">
          <div>
            {eyebrow ? <p>{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="app-dialog__close"
            aria-label="Close dialog"
            disabled={busy}
            onClick={requestClose}
          >
            <X size={17} />
          </button>
        </header>

        {description ? (
          <p id={descriptionId} className="app-dialog__description">
            {description}
          </p>
        ) : null}
        {children ? <div className="app-dialog__body">{children}</div> : null}
        {footer ? <footer className="app-dialog__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

/**
 * Renders a consistently styled action for use in an {@link AppDialog} footer.
 *
 * @param props Native button attributes and an optional visual tone.
 * @returns A button using the site-wide dialog action styling.
 */
export function DialogAction({
  tone = "neutral",
  className = "",
  type = "button",
  ...props
}: DialogActionProps) {
  return (
    <button
      type={type}
      className={`app-dialog__action app-dialog__action--${tone} ${className}`.trim()}
      {...props}
    />
  );
}
