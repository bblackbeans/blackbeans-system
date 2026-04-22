export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
};

export type ApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: { code?: string; message: string; details?: unknown };
  correlationId?: string;
};

export async function apiRequest<T = unknown>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const { method = "GET", token, body } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
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
        body: body === undefined ? undefined : JSON.stringify(body),
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
    error?: { code?: string; message?: string; details?: unknown };
  };

  if (!response.ok) {
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
    correlationId,
  };
}
