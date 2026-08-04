import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.INTERNAL_API_URL ?? "http://api:8000";

/** Raiz do host da API (sem barra final); remove sufixo duplicado `/api/v1` se vier na env. */
function normalizeBackendBaseUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (s.endsWith("/api/v1")) {
    s = s.slice(0, -"/api/v1".length).replace(/\/+$/, "");
  }
  return s;
}

function isBinaryContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return (
    ct.includes("multipart/form-data") ||
    ct.includes("application/octet-stream") ||
    ct.startsWith("image/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("video/") ||
    ct.includes("application/pdf") ||
    ct.includes("application/zip")
  );
}

async function readRequestBody(request: NextRequest): Promise<BodyInit | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const contentType = request.headers.get("content-type");
  // multipart / binario: NUNCA usar .text() — corrompe bytes >= 0x80 (PNG vira ef bf bd).
  if (isBinaryContentType(contentType)) {
    return await request.arrayBuffer();
  }
  // JSON e texto
  return await request.text();
}

async function proxy(request: NextRequest, path: string[]) {
  const contentType = request.headers.get("content-type");
  const body = await readRequestBody(request);
  const candidates = Array.from(
    new Set(
      [BACKEND_BASE_URL, "http://api:8000", "http://localhost:18000"].map(normalizeBackendBaseUrl).filter(Boolean),
    ),
  );
  let response: Response | null = null;
  let lastError: unknown;

  const forwardHeaders: Record<string, string> = {
    Authorization: request.headers.get("authorization") ?? "",
    "X-Correlation-ID": request.headers.get("x-correlation-id") ?? "",
  };
  // Preservar Content-Type original (inclui boundary do multipart).
  if (contentType) {
    forwardHeaders["Content-Type"] = contentType;
  } else if (body !== undefined && !isBinaryContentType(contentType)) {
    forwardHeaders["Content-Type"] = "application/json";
  }

  for (const base of candidates) {
    const targetUrl = `${base}/api/v1/${path.join("/")}${request.nextUrl.search}`;
    try {
      response = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        body,
        cache: "no-store",
        // @ts-expect-error undici duplex tipagem incompleta em alguns targets
        duplex: body instanceof ArrayBuffer ? "half" : undefined,
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

  const responseContentType = response.headers.get("content-type") ?? "application/json";
  const responseBuffer = await response.arrayBuffer();
  const nextResponse = new NextResponse(responseBuffer, {
    status: response.status,
    headers: {
      "Content-Type": responseContentType,
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

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
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
