"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Buildings, CaretDown, GearSix, House, SignOut } from "@phosphor-icons/react";
import { useSession, useSignOut } from "@beaco/auth/react";
import { AppDialog, DialogAction } from "@/components/ui/app-dialog";
import "./account-menu.css";

type AccountMenuProps = Readonly<{
  /** Dashboard-scoped account settings path; the menu item is hidden when absent. */
  accountSettingsHref?: string;
}>;

/**
 * Authenticated identity control shared by every application shell: an avatar
 * trigger with an account popover and a sign-out confirmation dialog.
 *
 * Reads the session directly, so it can be dropped into any shell rendered
 * inside the auth provider and renders nothing when signed out.
 *
 * @param props Optional dashboard-scoped account settings link.
 * @returns The account menu, or `null` when there is no authenticated user.
 */
export function AccountMenu({ accountSettingsHref }: AccountMenuProps) {
  const router = useRouter();
  const session = useSession();
  const signOut = useSignOut();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function closeOnPointer(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const user = session.user;
  if (!user) return null;

  const initials = (user.name || user.email)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
    .toUpperCase();

  async function handleSignOut() {
    try {
      await signOut.mutateAsync();
      setSignOutOpen(false);
      router.replace("/login");
    } catch {
      // The mutation surfaces the recoverable error inside the dialog.
    }
  }

  return (
    <div ref={menuRef} className="account-menu" data-open={open || undefined}>
      <button
        type="button"
        className="account-menu__trigger"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {user.avatarUrl ? (
            <Image
              unoptimized
              src={user.avatarUrl}
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
            />
          ) : (
            initials
          )}
        </span>
        <CaretDown size={12} />
      </button>

      {open ? (
        <div className="account-menu__popover" role="menu">
          <div className="account-menu__identity" role="presentation">
            <span>
              {user.avatarUrl ? (
                <Image
                  unoptimized
                  src={user.avatarUrl}
                  alt=""
                  aria-hidden="true"
                  width={34}
                  height={34}
                />
              ) : (
                initials
              )}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>

          <div className="account-menu__items">
            {accountSettingsHref ? (
              <Link href={accountSettingsHref} role="menuitem" onClick={() => setOpen(false)}>
                <GearSix size={16} />
                <span>
                  <strong>Account settings</strong>
                  <small>Profile and connections</small>
                </span>
              </Link>
            ) : null}
            <Link href="/workspace" role="menuitem" onClick={() => setOpen(false)}>
              <Buildings size={16} />
              <span>
                <strong>Switch workspace</strong>
                <small>Organizations and projects</small>
              </span>
            </Link>
            <Link href="/" role="menuitem" onClick={() => setOpen(false)}>
              <House size={16} />
              <span>
                <strong>Visit public site</strong>
                <small>Return to Beaco</small>
              </span>
            </Link>
          </div>

          <button
            type="button"
            className="account-menu__signout"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setSignOutOpen(true);
            }}
          >
            <SignOut size={16} />
            Sign out
          </button>
        </div>
      ) : null}

      <AppDialog
        open={signOutOpen}
        onOpenChange={(value) => {
          if (signOut.isPending) return;
          setSignOutOpen(value);
          if (!value) signOut.reset();
        }}
        eyebrow="Session control"
        title="Sign out of Beaco?"
        description="You’ll need another magic link or GitHub sign-in to return to this dashboard. Your projects and delivery data will remain unchanged."
        busy={signOut.isPending}
        footer={
          <>
            <DialogAction disabled={signOut.isPending} onClick={() => setSignOutOpen(false)}>
              Stay signed in
            </DialogAction>
            <DialogAction tone="danger" disabled={signOut.isPending} onClick={handleSignOut}>
              <SignOut size={16} />
              {signOut.isPending ? "Signing out" : "Sign out"}
            </DialogAction>
          </>
        }
      >
        {signOut.isError ? (
          <p className="app-dialog__error" role="alert">
            {signOut.error.message}
          </p>
        ) : null}
      </AppDialog>
    </div>
  );
}
