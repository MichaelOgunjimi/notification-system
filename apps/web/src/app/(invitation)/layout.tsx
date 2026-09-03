import type { Metadata } from "next";
import { AuthProvider } from "@beaco/auth/react";
import { ControlPlaneProvider } from "@beaco/control-plane/react";

export const metadata: Metadata = {
  title: "Accept invitation | Beaco",
  description: "Join a Beaco organization you were invited to.",
  robots: { index: false, follow: false },
};

/**
 * Supplies the session and control-plane clients to the invitation-acceptance
 * route. Unlike the `(auth)` group it does not mount {@link AuthRouteGate}: an
 * authenticated invitee must stay on this route long enough to accept.
 *
 * @param props Nested invitation route content.
 */
export default function InvitationLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ControlPlaneProvider>{children}</ControlPlaneProvider>
    </AuthProvider>
  );
}
