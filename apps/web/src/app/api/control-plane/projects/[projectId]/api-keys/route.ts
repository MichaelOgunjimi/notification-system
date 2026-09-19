import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type ApiKeysRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

/**
 * Forwards an authenticated paginated list of a project's API keys to FastAPI.
 *
 * @param request Incoming same-origin request; its page query string is forwarded.
 * @param context Dynamic project route parameters.
 * @returns Proxied paginated API key response after backend authorization.
 */
export async function GET(request: NextRequest, context: ApiKeysRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/api-keys${request.nextUrl.search}`,
  );
}

/**
 * Forwards an authenticated API key creation to FastAPI.
 *
 * @param request Incoming request whose JSON body is forwarded unchanged.
 * @param context Dynamic project route parameters.
 * @returns Proxied response containing the one-time plaintext key.
 */
export async function POST(request: NextRequest, context: ApiKeysRouteContext) {
  const { projectId } = await context.params;
  if (!isControlPlaneId(projectId)) return invalidControlPlaneIdResponse();
  return beacoAuth.forwardAuthenticated(request, `/projects/${projectId}/api-keys`);
}
