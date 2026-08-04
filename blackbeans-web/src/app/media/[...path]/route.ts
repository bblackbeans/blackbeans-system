import { NextRequest, NextResponse } from "next/server";

function normalizeBackendBaseUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (s.endsWith("/api/v1")) {
    s = s.slice(0, -"/api/v1".length).replace(/\/+$/, "");
  }
  return s;
}

/** Backends candidatos: Docker (api) primeiro, depois host local. */
function mediaBackendCandidates(): string[] {
  return Array.from(
    new Set(
      [
        process.env.INTERNAL_API_URL,
        "http://api:8000",
        "http://blackbeans-api:8000",
        "http://host.docker.internal:18000",
        "http://localhost:18000",
        "http://127.0.0.1:18000",
      ]
        .filter(Boolean)
        .map((v) => normalizeBackendBaseUrl(String(v))),
    ),
  );
}

async function proxyMedia(request: NextRequest, path: string[]) {
  const candidates = mediaBackendCandidates();
  let response: Response | null = null;
  let lastError: unknown;
  // Nao re-encodar segmentos ja decodificados pelo Next (evita %2520).
  // Re-encoda ao montar a URL do backend (espacos / parenteses no filename).
  const mediaPath = path.map((seg) => encodeURIComponent(seg)).join("/");

  for (const base of candidates) {
    const targetUrl = `${base}/media/${mediaPath}${request.nextUrl.search}`;
    try {
      const attempt = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Accept: request.headers.get("accept") ?? "*/*",
        },
        cache: "no-store",
      });
      // Aceita 200; tenta proximo candidato em 5xx/conexao. 404 = arquivo nao existe nesse backend.
      if (attempt.ok) {
        response = attempt;
        break;
      }
      if (attempt.status === 404) {
        response = attempt;
        // Continua tentando outros backends (pode estar noutro volume)
        continue;
      }
      lastError = `HTTP ${attempt.status} from ${base}`;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    return NextResponse.json(
      {
        error: {
          code: "media_proxy_unreachable",
          message: "Nao foi possivel carregar o arquivo de midia.",
          details: String(lastError ?? "unknown_error"),
          tried: candidates,
        },
      },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const contentLength = response.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  headers.set("Cache-Control", "public, max-age=3600, immutable");

  // Bufferiza para evitar stream issues entre backends Node/undici
  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    status: response.status,
    headers,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyMedia(request, path ?? []);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const res = await proxyMedia(request, path ?? []);
  return new NextResponse(null, { status: res.status, headers: res.headers });
}
