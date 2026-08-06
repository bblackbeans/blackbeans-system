export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
};

export type ApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  meta?: Record<string, unknown>;
  error?: { code?: string; message: string; details?: unknown };
  correlationId?: string;
};

export async function apiRequest<T = unknown>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const { method = "GET", token, body } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const baseCandidates = Array.from(new Set([API_BASE_URL, "/api/v1"]));
  let response: Response | null = null;
  let lastError: unknown;
  for (const baseUrl of baseCandidates) {
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
        cache: "no-store",
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    return {
      ok: false,
      status: 0,
      error: {
        code: "network_error",
        message: "Nao foi possivel conectar com a API. Verifique se os servicos estao em execucao.",
        details: String(lastError ?? "unknown_error"),
      },
    };
  }

  const correlationId = response.headers.get("X-Correlation-ID") ?? undefined;
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    meta?: Record<string, unknown>;
    error?: { code?: string; message?: string; details?: unknown };
  };

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("bb:unauthorized"));
    }
    return {
      ok: false,
      status: response.status,
      correlationId,
      error: {
        code: payload.error?.code,
        message: payload.error?.message ?? "Erro inesperado na requisicao.",
        details: payload.error?.details,
      },
    };
  }

  return {
    ok: true,
    status: response.status,
    data: payload.data,
    meta: payload.meta,
    correlationId,
  };
}

/** Resolve URL de media da API (relativa ou absoluta) para uso no browser. */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  let raw = String(url).trim();
  if (!raw) return undefined;
  // Preview otimista / data URI — nao normalizar como /media.
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;

  // Path absoluto de disco (ex. /app/blackbeans_api/media/...) → /media/...
  const mediaIdx = raw.indexOf("/media/");
  if (mediaIdx >= 0) {
    raw = raw.slice(mediaIdx);
  }

  // URLs absolutas do host interno Docker / API → path /media/...
  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      if (
        host === "api" ||
        host === "blackbeans-api" ||
        host.endsWith(".local") ||
        host === "localhost" ||
        host === "127.0.0.1"
      ) {
        if (parsed.pathname.startsWith("/media/")) {
          raw = `${parsed.pathname}${parsed.search}`;
        }
      } else if (parsed.pathname.startsWith("/media/")) {
        // Preferir path relativo (rewrite do Next no mesmo origin).
        raw = `${parsed.pathname}${parsed.search}`;
      }
    }
  } catch {
    // mantem raw
  }

  if (/^https?:\/\//i.test(raw)) return raw;

  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path.startsWith("/media/")) return path;

  // Storage relativo sem /media/
  if (
    path.includes("task_attachments/") ||
    path.includes("client_request_attachments/") ||
    path.includes("avatars/")
  ) {
    const cleaned = path.replace(/^\/+/, "");
    return `/media/${cleaned}`;
  }

  if (API_BASE_URL.startsWith("http")) {
    try {
      return `${new URL(API_BASE_URL).origin}${path}`;
    } catch {
      return path;
    }
  }
  return path;
}

/** Normaliza URL de anexo para markdown relativo `/media/...`. */
export function toStoredMediaPath(url: string | null | undefined): string {
  const resolved = resolveMediaUrl(url) || "";
  if (!resolved) return "";
  try {
    if (/^https?:\/\//i.test(resolved)) {
      const parsed = new URL(resolved);
      if (parsed.pathname.startsWith("/media/")) {
        return `${parsed.pathname}${parsed.search}`;
      }
    }
  } catch {
    // ignore
  }
  if (resolved.startsWith("/media/")) return resolved;
  const mediaIdx = resolved.indexOf("/media/");
  if (mediaIdx >= 0) return resolved.slice(mediaIdx);
  return resolved;
}
