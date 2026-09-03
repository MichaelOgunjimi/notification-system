import { FullPageLoading } from "@/components/ui/full-page-loading";

/** Returns the immediate loading surface for a dynamic dashboard navigation. */
export default function DashboardLoading() {
  return <FullPageLoading label="Loading workspace" />;
}
