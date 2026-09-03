"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import Image from "next/image";
import {
  ArrowSquareOut,
  Check,
  GithubLogo,
  LinkBreak,
  SpinnerGap,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import type { User } from "@beaco/auth";
import { authClient } from "@beaco/auth";
import { useDisconnectOAuth, useOAuthConnections, useUpdateProfile } from "@beaco/auth/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import { EmailAddressesSection } from "@/components/settings/email-addresses-section";
import { accountSettingsReturnPath } from "@/lib/oauth-return";
import "./account-settings.css";

type AccountSettingsProps = Readonly<{
  user: User;
  returnPath: string;
}>;

/**
 * Renders user-owned profile and external identity settings.
 *
 * @param props Authenticated user and validated post-OAuth return path.
 * @returns Responsive account settings surface with live SDK-backed state.
 */
export function AccountSettings({ user, returnPath }: AccountSettingsProps) {
  const nameId = useId();
  const avatarId = useId();
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const profile = useUpdateProfile();
  const connections = useOAuthConnections();
  const disconnect = useDisconnectOAuth();
  const githubConnection = connections.data?.find((connection) => connection.provider === "github");
  const normalizedName = name.trim();
  const normalizedAvatar = avatarUrl.trim();
  const profileChanged =
    normalizedName !== user.name || normalizedAvatar !== (user.avatarUrl ?? "");

  useEffect(() => {
    setName(user.name);
    setAvatarUrl(user.avatarUrl ?? "");
  }, [user.avatarUrl, user.name]);

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    profile.reset();

    if (!normalizedName) {
      setValidationError("Enter the name you want teammates to recognize.");
      return;
    }
    if (normalizedAvatar) {
      try {
        const candidate = new URL(normalizedAvatar);
        if (candidate.protocol !== "http:" && candidate.protocol !== "https:") throw new Error();
      } catch {
        setValidationError("Use an absolute HTTP or HTTPS image URL.");
        return;
      }
    }

    profile.mutate({
      name: normalizedName,
      avatarUrl: normalizedAvatar || null,
    });
  }

  async function handleDisconnect() {
    try {
      await disconnect.mutateAsync("github");
      setDisconnectOpen(false);
    } catch {
      // The mutation error remains visible inside the confirmation dialog.
    }
  }

  return (
    <div className="account-settings">
      <header className="account-settings__heading">
        <div>
          <p>Personal control</p>
          <h1>Account settings</h1>
          <span>Manage the identity Beaco shows and the providers trusted for sign-in.</span>
        </div>
        <div className="account-settings__identity-mark" aria-hidden="true">
          {user.avatarUrl ? (
            <Image unoptimized src={user.avatarUrl} alt="" width={64} height={64} />
          ) : (
            <UserCircle size={32} />
          )}
        </div>
      </header>

      <div className="account-settings__layout">
        <nav className="account-settings__nav" aria-label="Account settings sections">
          <a href="#profile" data-active="true">
            <span>01</span>
            Profile
          </a>
          <a href="#emails">
            <span>02</span>
            Emails
          </a>
          <a href="#connections">
            <span>03</span>
            Connections
          </a>
          <div>
            <small>Account ID</small>
            <code>{user.id}</code>
          </div>
        </nav>

        <div className="account-settings__content">
          <section id="profile" className="account-settings__section">
            <div className="account-settings__section-heading">
              <span>01</span>
              <div>
                <h2>Public profile</h2>
                <p>Display name and avatar. Manage sign-in emails in the section below.</p>
              </div>
            </div>

            <form className="account-settings__form" onSubmit={handleProfileSubmit}>
              <label htmlFor={nameId}>
                Display name
                <span>Used in navigation, ownership, and activity records.</span>
              </label>
              <input
                id={nameId}
                name="name"
                value={name}
                autoComplete="name"
                maxLength={255}
                onChange={(event) => {
                  setName(event.target.value);
                  setValidationError(null);
                  profile.reset();
                }}
              />

              <label htmlFor={avatarId}>
                Avatar URL
                <span>
                  Optional absolute image URL. Provider images are copied only as a fallback.
                </span>
              </label>
              <div className="account-settings__avatar-field">
                <span aria-hidden="true">
                  {user.avatarUrl ? (
                    <Image unoptimized src={user.avatarUrl} alt="" width={38} height={38} />
                  ) : (
                    <UserCircle size={21} />
                  )}
                </span>
                <input
                  id={avatarId}
                  name="avatarUrl"
                  inputMode="url"
                  value={avatarUrl}
                  placeholder="https://images.example.com/avatar.png"
                  onChange={(event) => {
                    setAvatarUrl(event.target.value);
                    setValidationError(null);
                    profile.reset();
                  }}
                />
              </div>

              {validationError || profile.isError ? (
                <p className="account-settings__message" data-tone="error" role="alert">
                  <WarningCircle size={15} />
                  {validationError ?? profile.error?.message}
                </p>
              ) : null}
              {profile.isSuccess ? (
                <p className="account-settings__message" data-tone="success" role="status">
                  <Check size={15} weight="bold" /> Profile saved
                </p>
              ) : null}

              <div className="account-settings__form-actions">
                <button type="submit" disabled={!profileChanged || profile.isPending}>
                  {profile.isPending ? <SpinnerGap size={15} className="animate-spin" /> : null}
                  {profile.isPending ? "Saving" : "Save profile"}
                </button>
                <span>Changes update every Beaco workspace.</span>
              </div>
            </form>
          </section>

          <EmailAddressesSection />

          <section id="connections" className="account-settings__section">
            <div className="account-settings__section-heading">
              <span>03</span>
              <div>
                <h2>Connected accounts</h2>
                <p>Link external identities without exposing provider tokens to the browser.</p>
              </div>
            </div>

            <div className="account-settings__provider">
              <span className="account-settings__provider-icon">
                <GithubLogo size={24} weight="fill" />
              </span>
              <div className="account-settings__provider-copy">
                <strong>GitHub</strong>
                {connections.isPending ? (
                  <small>Checking connection</small>
                ) : githubConnection ? (
                  <small>
                    @{githubConnection.providerUsername ?? "connected"}
                    {githubConnection.providerEmail ? ` · ${githubConnection.providerEmail}` : ""}
                  </small>
                ) : (
                  <small>Not connected</small>
                )}
              </div>
              {connections.isPending ? (
                <SpinnerGap size={17} className="animate-spin" />
              ) : githubConnection ? (
                <button type="button" onClick={() => setDisconnectOpen(true)}>
                  <LinkBreak size={15} /> Disconnect
                </button>
              ) : (
                <a
                  href={authClient.getOAuthConnectUrl("github", {
                    next: accountSettingsReturnPath(returnPath) ?? undefined,
                  })}
                >
                  Connect GitHub <ArrowSquareOut size={15} />
                </a>
              )}
            </div>

            {connections.isError ? (
              <div className="account-settings__connection-error" role="alert">
                <WarningCircle size={16} />
                <span>{connections.error.message}</span>
                <button type="button" onClick={() => void connections.refetch()}>
                  Retry
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <AppDialog
        open={disconnectOpen}
        onOpenChange={(open) => {
          if (disconnect.isPending) return;
          setDisconnectOpen(open);
          if (!open) disconnect.reset();
        }}
        eyebrow="Identity connection"
        title="Disconnect GitHub?"
        description="GitHub will no longer sign in to this Beaco account. Your verified email and existing workspaces remain available."
        busy={disconnect.isPending}
        footer={
          <>
            <DialogAction disabled={disconnect.isPending} onClick={() => setDisconnectOpen(false)}>
              Keep connected
            </DialogAction>
            <DialogAction tone="danger" disabled={disconnect.isPending} onClick={handleDisconnect}>
              <LinkBreak size={15} />
              {disconnect.isPending ? "Disconnecting" : "Disconnect"}
            </DialogAction>
          </>
        }
      >
        {disconnect.isError ? (
          <p className="app-dialog__error" role="alert">
            {disconnect.error.message}
          </p>
        ) : null}
      </AppDialog>
    </div>
  );
}
