import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const SAFE_HEADERS = ["content-type", "idempotency-key", "x-request-id"] as const;

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function proxyRequest(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("beaco_token")?.value;

  const safeHeaders = new Headers();
  for (const name of SAFE_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      safeHeaders.set(name, value);
    }
  }
  if (token) {
    safeHeaders.set("X-API-Key", token);
  }

  const query = new URL(request.url).search;
  const pathValue = path.map((segment) => encodeURIComponent(segment)).join("/");
  const upstreamUrl = `${API_URL}/api/v1/${pathValue}${query}`;

  const hasBody = request.method !== "GET";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: safeHeaders,
      body,
    });

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    const requestId = upstreamResponse.headers.get("x-request-id");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }
    if (requestId) {
      responseHeaders.set("x-request-id", requestId);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ detail: "Upstream service unavailable" }, { status: 502 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}
