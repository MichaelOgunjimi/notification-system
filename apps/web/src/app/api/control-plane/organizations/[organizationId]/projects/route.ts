import { NextResponse, type NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;
  if (!UUID_PATTERN.test(organizationId)) {
    return NextResponse.json({ detail: "Invalid organization ID." }, { status: 400 });
  }
  return beacoAuth.forwardAuthenticated(
    request,
    `/organizations/${organizationId}/projects`,
  );
}
