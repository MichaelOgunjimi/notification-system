import type { Metadata } from "next";
import { AuthProvider } from "@beaco/auth/react";
import { ControlPlaneProvider } from "@beaco/control-plane/react";

export const metadata: Metadata = {
  title: "Beaco",
  robots: { index: false, follow: false },
};

/**
 * Provider boundary for routes that a not-yet-signed-in visitor may land on
 * from an email link — invitation acceptance, email verification — and still
 * needs the session and control-plane clients. Unlike `(auth)` it does not
 * mount {@link AuthRouteGate}, so an authenticated visitor stays on the page
 * long enough to finish the action.
 *
 * @param props Nested route content.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ControlPlaneProvider>{children}</ControlPlaneProvider>
    </AuthProvider>
  );
}
