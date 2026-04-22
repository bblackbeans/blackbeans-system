import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.INTERNAL_API_URL ?? "http://api:8000";

async function proxy(request: NextRequest, path: string[]) {
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  const candidates = Array.from(new Set([BACKEND_BASE_URL, "http://api:8000", "http://localhost:18000"]));
  let response: Response | null = null;
  let lastError: unknown;
  for (const base of candidates) {
    const targetUrl = `${base}/api/v1/${path.join("/")}${request.nextUrl.search}`;
    try {
      response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "Content-Type": request.headers.get("content-type") ?? "application/json",
          Authorization: request.headers.get("authorization") ?? "",
          "X-Correlation-ID": request.headers.get("x-correlation-id") ?? "",
        },
        body,
        cache: "no-store",
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    return NextResponse.json(
      {
        correlation_id: request.headers.get("x-correlation-id") ?? null,
        error: {
          code: "proxy_unreachable",
          message: "Nao foi possivel conectar ao backend.",
          details: String(lastError ?? "unknown_error"),
        },
      },
      { status: 502 },
    );
  }

  const responseText = await response.text();
  const nextResponse = new NextResponse(responseText, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });

  const correlationId = response.headers.get("x-correlation-id");
  if (correlationId) {
    nextResponse.headers.set("X-Correlation-ID", correlationId);
  }
  return nextResponse;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
