"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { isMaster, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && !isMaster) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isMaster, router]);

  if (!isAuthenticated || !isMaster) {
    return null;
  }

  return <>{children}</>;
}
