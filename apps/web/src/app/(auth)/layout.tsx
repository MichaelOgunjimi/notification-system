import type { Metadata } from "next";
import { AuthProvider } from "@beaco/auth/react";

export const metadata: Metadata = {
  title: "Sign in | Beaco",
  description: "Passwordless access to your Beaco organization and projects.",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
