import { WorkspaceSelector } from "@/components/workspace/workspace-selector";

/**
 * Workspace selection page. A bare visit resumes the last project; `?select=1`
 * keeps the selector open for deliberate switching.
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ select?: string }>;
}) {
  const { select } = await searchParams;
  return <WorkspaceSelector resumeLastProject={select !== "1"} />;
}
