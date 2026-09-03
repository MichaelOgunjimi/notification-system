import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ApiKeyRouteContext = Readonly<{
  params: Promise<{ projectId: string; apiKeyId: string }>;
}>;

async function forwardApiKey(request: NextRequest, context: ApiKeyRouteContext) {
  const { projectId, apiKeyId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(apiKeyId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/api-keys/${apiKeyId}`);
}

/**
 * Forwards an authenticated API key update (name, description, scopes, rate limit).
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic project and API key route parameters.
 * @returns Proxied response; FastAPI enforces the api_key:manage capability.
 */
export function PATCH(request: NextRequest, context: ApiKeyRouteContext) {
  return forwardApiKey(request, context);
}

/**
 * Forwards an authenticated API key revocation to FastAPI.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and API key route parameters.
 * @returns Proxied response; the key is deactivated but retained for audit history.
 */
export function DELETE(request: NextRequest, context: ApiKeyRouteContext) {
  return forwardApiKey(request, context);
}
