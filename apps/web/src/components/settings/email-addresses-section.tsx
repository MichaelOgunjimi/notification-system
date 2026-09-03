"use client";

import { FormEvent, useId, useState } from "react";
import {
  Check,
  EnvelopeSimple,
  SpinnerGap,
  Star,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  useAddEmailAddress,
  useEmailAddresses,
  useRemoveEmailAddress,
  useResendEmailVerification,
  useSetPrimaryEmailAddress,
} from "@beaco/auth/react";
import { useToast } from "@/components/ui/toast";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

/**
 * Lists the account's email addresses and lets the user add, verify, promote,
 * and remove them. Backend authorization stays authoritative for every call.
 */
export function EmailAddressesSection() {
  const toast = useToast();
  const inputId = useId();
  const emails = useEmailAddresses();
  const addEmail = useAddEmailAddress();
  const resendVerification = useResendEmailVerification();
  const setPrimary = useSetPrimaryEmailAddress();
  const removeEmail = useRemoveEmailAddress();
  const [value, setValue] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) return;
    addEmail.reset();
    try {
      await addEmail.mutateAsync(normalized);
      setValue("");
      toast.success("Verification email sent", `Check ${normalized} to confirm it.`);
    } catch {
      // Surfaced under the form.
    }
  }

  async function runRowAction(id: string, action: () => Promise<unknown>, success: string) {
    setPendingId(id);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That action could not be completed.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section id="emails" className="account-settings__section">
      <div className="account-settings__section-heading">
        <span>02</span>
        <div>
          <h2>Email addresses</h2>
          <p>
            Sign in with any verified address. The primary one identifies your account and receives
            invitations.
          </p>
        </div>
      </div>

      <form className="account-settings__email-add" onSubmit={handleAdd}>
        <EnvelopeSimple size={18} />
        <input
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@another-domain.com"
          value={value}
          disabled={addEmail.isPending}
          onChange={(event) => {
            setValue(event.target.value);
            if (addEmail.isError) addEmail.reset();
          }}
        />
        <button type="submit" disabled={addEmail.isPending || !EMAIL_PATTERN.test(value.trim())}>
          {addEmail.isPending ? <SpinnerGap size={14} className="animate-spin" /> : null}
          {addEmail.isPending ? "Sending" : "Add"}
        </button>
      </form>
      {addEmail.isError ? (
        <p className="account-settings__message" data-tone="error" role="alert">
          <WarningCircle size={15} />
          {addEmail.error.message}
        </p>
      ) : null}

      <ul className="account-settings__email-list">
        {emails.isPending ? (
          <li className="account-settings__email-empty">
            <SpinnerGap size={15} className="animate-spin" /> Loading addresses
          </li>
        ) : null}
        {emails.isError ? (
          <li className="account-settings__message" data-tone="error" role="alert">
            <WarningCircle size={15} />
            {emails.error.message}
          </li>
        ) : null}
        {emails.data?.map((address) => {
          const busy = pendingId === address.id;
          return (
            <li key={address.id} className="account-settings__email-row">
              <div>
                <strong>{address.email}</strong>
                <span className="account-settings__email-tags">
                  {address.isPrimary ? (
                    <span data-variant="primary">
                      <Star size={10} weight="fill" /> Primary
                    </span>
                  ) : null}
                  {address.verifiedAt ? (
                    <span data-variant="verified">
                      <Check size={10} weight="bold" /> Verified
                    </span>
                  ) : (
                    <span data-variant="pending">Pending</span>
                  )}
                </span>
              </div>
              <div className="account-settings__email-actions">
                {!address.verifiedAt ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runRowAction(
                        address.id,
                        () => resendVerification.mutateAsync(address.id),
                        "Verification email resent",
                      )
                    }
                  >
                    Resend
                  </button>
                ) : null}
                {address.verifiedAt && !address.isPrimary ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runRowAction(
                        address.id,
                        () => setPrimary.mutateAsync(address.id),
                        `${address.email} is now primary`,
                      )
                    }
                  >
                    Make primary
                  </button>
                ) : null}
                {!address.isPrimary ? (
                  <button
                    type="button"
                    className="account-settings__email-remove"
                    disabled={busy}
                    aria-label={`Remove ${address.email}`}
                    onClick={() =>
                      runRowAction(
                        address.id,
                        () => removeEmail.mutateAsync(address.id),
                        `${address.email} removed`,
                      )
                    }
                  >
                    <Trash size={14} />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
