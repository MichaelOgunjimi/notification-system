import type { Metadata } from "next";
import { AuthProvider } from "@beaco/auth/react";
import { ControlPlaneProvider } from "@beaco/control-plane/react";

export const metadata: Metadata = {
  title: "Dashboard | Beaco",
  description: "Operate a Beaco notification project.",
  robots: { index: false, follow: false },
};

/**
 * Supplies the authenticated session, shared QueryClient, and control-plane
 * client to every canonical dashboard route.
 *
 * @param props Nested dashboard route content.
 * @returns Provider boundary shared across dashboard navigation.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ControlPlaneProvider>{children}</ControlPlaneProvider>
    </AuthProvider>
  );
}
