import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type TemplateRouteContext = Readonly<{
  params: Promise<{ projectId: string; templateId: string }>;
}>;

async function forwardTemplate(request: NextRequest, context: TemplateRouteContext) {
  const { projectId, templateId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(templateId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/templates/${templateId}`);
}

/**
 * Forwards an authenticated fetch of one template usable by this project
 * (its own, or a system default) to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and template route parameters.
 * @returns Proxied response; FastAPI 404s a template not visible to this project.
 */
export function GET(request: NextRequest, context: TemplateRouteContext) {
  return forwardTemplate(request, context);
}

/**
 * Forwards an authenticated template update to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic project and template route parameters.
 * @returns Proxied response; FastAPI rejects a template not owned by this project.
 */
export function PUT(request: NextRequest, context: TemplateRouteContext) {
  return forwardTemplate(request, context);
}

/**
 * Forwards an authenticated template soft-delete to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and template route parameters.
 * @returns Proxied response; FastAPI rejects a template not owned by this project.
 */
export function DELETE(request: NextRequest, context: TemplateRouteContext) {
  return forwardTemplate(request, context);
}
