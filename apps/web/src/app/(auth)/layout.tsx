import type { Metadata } from "next";
import { AuthProvider } from "@beaco/auth/react";
import { AuthRouteGate } from "@/components/auth/auth-route-gate";

export const metadata: Metadata = {
  title: "Sign in | Beaco",
  description: "Passwordless access to your Beaco organization and projects.",
  robots: { index: false, follow: false },
};

/**
 * Supplies the auth SDK and prevents authenticated users from re-entering
 * anonymous authentication screens.
 *
 * @param props Nested authentication route content.
 * @returns Authentication provider and session-aware route guard.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthRouteGate>{children}</AuthRouteGate>
    </AuthProvider>
  );
}
