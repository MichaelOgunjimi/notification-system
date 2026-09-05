import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ForkTemplateRouteContext = Readonly<{
  params: Promise<{ projectId: string; templateId: string }>;
}>;

/**
 * Forwards an authenticated request to fork a system default template into
 * a new template owned by this project. FastAPI never modifies the original.
 *
 * @param request Incoming same-origin request; no body is required.
 * @param context Dynamic project and source-template route parameters.
 * @returns Proxied response containing the new, independently-editable copy.
 */
export async function POST(request: NextRequest, context: ForkTemplateRouteContext) {
  const { projectId, templateId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(templateId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/templates/${templateId}/fork`,
  );
}
