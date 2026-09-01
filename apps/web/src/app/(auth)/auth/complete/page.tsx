"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react";

/**
 * Preserves compatibility with legacy auth-completion links.
 *
 * The enclosing auth route gate restores authenticated users before this page
 * renders; anonymous visits fall back to the workspace session check.
 *
 * @returns Brief redirecting state while navigating to the workspace selector.
 */
export default function AuthCompletePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/workspace");
  }, [router]);

  return (
    <main className="auth-route-gate" aria-live="polite">
      <SpinnerGap size={16} className="animate-spin" /> Restoring your workspace
    </main>
  );
}
