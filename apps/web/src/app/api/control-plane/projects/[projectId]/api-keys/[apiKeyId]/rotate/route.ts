import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";
import { invalidControlPlaneIdResponse, isControlPlaneId } from "@/lib/control-plane-route";

type RotateRouteContext = Readonly<{
  params: Promise<{ projectId: string; apiKeyId: string }>;
}>;

/**
 * Forwards an authenticated API key rotation to FastAPI.
 *
 * The backend revokes the current key and issues a replacement linked by
 * `rotated_from_id`; the response carries the new one-time plaintext key.
 *
 * @param request Incoming same-origin request containing HTTP-only session cookies.
 * @param context Dynamic project and API key route parameters.
 * @returns Proxied response containing the rotated key.
 */
export async function POST(request: NextRequest, context: RotateRouteContext) {
  const { projectId, apiKeyId } = await context.params;
  if (!isControlPlaneId(projectId) || !isControlPlaneId(apiKeyId)) {
    return invalidControlPlaneIdResponse();
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/projects/${projectId}/api-keys/${apiKeyId}/rotate`,
  );
}
