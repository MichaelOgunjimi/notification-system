import type { Metadata } from "next";
import { AuthProvider } from "@beaco/auth/react";

export const metadata: Metadata = {
  title: "Workspace | Beaco",
  description: "Choose the Beaco organization and project for this session.",
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
