import { BACKEND_URL } from "@/lib/auth/server";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/v1/auth/magic-link/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "The sign-in service is unavailable." }, { status: 502 });
  }
}
