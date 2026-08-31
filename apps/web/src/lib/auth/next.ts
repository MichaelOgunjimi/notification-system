import "server-only";

import { createNextAuthAdapter } from "@beaco/auth/next";

const backendOrigin = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export const beacoAuth = createNextAuthAdapter({
  appAuthPath: "/api/auth",
  backendApiUrl: `${backendOrigin}/api/v1`,
  publicBackendApiUrl:
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
});
