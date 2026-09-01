import type { NextRequest } from "next/server";
import { beacoAuth } from "@/lib/auth/next";

export function GET(request: NextRequest) {
  return beacoAuth.forwardAuthenticated(request, "/organizations");
}
