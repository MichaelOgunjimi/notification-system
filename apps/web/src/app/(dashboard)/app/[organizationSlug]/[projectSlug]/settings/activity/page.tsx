"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Legacy alias — the activity log became the governance audit log at
 * `settings/audit`. Redirects any bookmarked `settings/activity` link.
 *
 * @returns Nothing; navigates on mount.
 */
export default function ActivityLogRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    router.replace(pathname.replace(/\/settings\/activity$/, "/settings/audit"));
  }, [router, pathname]);

  return null;
}
