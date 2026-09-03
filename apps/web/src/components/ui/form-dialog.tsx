"use client";

import { FormEvent, ReactNode, useEffect, useRef } from "react";
import { SpinnerGap, X } from "@phosphor-icons/react";
import "./form-dialog.css";

type FormDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Monospace kicker above the title. */
  eyebrow: string;
  title: string;
  description?: string;
  /** Disables dismissal and the actions while a submission is in flight. */
  busy?: boolean;
  /** Links the footer submit button to the form rendered in `children`. */
  formId: string;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Widens the surface for denser forms (e.g. a scope grid). */
  wide?: boolean;
  /** Form fields; rendered inside the scrolling `<form>` body. */
  children: ReactNode;
}>;

/**
 * Native-dialog modal for short creation forms. Traps focus, supports Escape and
 * backdrop dismissal, keeps a sticky footer, and scrolls an overflowing body.
 *
 * The caller owns the form fields and validity; this shell owns the chrome.
 *
 * @param props Visibility, copy, the target form id, and the fields.
 * @returns An accessible modal wrapping the supplied form.
 */
export function FormDialog({
  open,
  onOpenChange,
  eyebrow,
  title,
  description,
  busy = false,
  formId,
  submitLabel,
  submitDisabled = false,
  onSubmit,
  wide = false,
  children,
}: FormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // A modal <dialog> does not stop the page behind it from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function requestClose() {
    if (!busy) onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      className="form-dialog"
      data-wide={wide || undefined}
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
      <div className="form-dialog__surface">
        <header className="form-dialog__header">
          <div>
            <p>{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="form-dialog__close"
            aria-label="Close dialog"
            disabled={busy}
            onClick={requestClose}
          >
            <X size={17} />
          </button>
        </header>

        {description ? <p className="form-dialog__description">{description}</p> : null}

        <form id={formId} className="form-dialog__body" onSubmit={onSubmit}>
          {children}
        </form>

        <footer className="form-dialog__footer">
          <button type="button" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            className="form-dialog__submit"
            disabled={submitDisabled || busy}
          >
            {busy ? <SpinnerGap className="animate-spin" size={15} /> : null}
            {submitLabel}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
