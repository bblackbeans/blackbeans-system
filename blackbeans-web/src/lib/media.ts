import { resolveMediaUrl } from "@/lib/api";

/** Codifica path preservando `/` (espacos, parenteses no nome do arquivo). */
function encodeMediaPath(path: string): string {
  if (!path.startsWith("/")) return path;
  try {
    return path
      .split("/")
      .map((seg, index) => {
        if (index === 0 && seg === "") return "";
        try {
          return encodeURIComponent(decodeURIComponent(seg));
        } catch {
          return encodeURIComponent(seg);
        }
      })
      .join("/");
  } catch {
    return path;
  }
}

/**
 * Normaliza URL de midia para uso em <img src>.
 * Prefere path relativo `/media/...` (mesmo origin do Next) — evita quebrar
 * quando a pagina e aberta por 127.0.0.1, LAN IP ou hostname diferente de localhost.
 */
export function toBrowserMediaSrc(url: string | null | undefined): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  // Preview local (upload otimista) e data URLs — nao passar pelo encode de /media.
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;

  const resolved = resolveMediaUrl(raw) ?? raw;
  if (!resolved) return "";
  if (resolved.startsWith("blob:") || resolved.startsWith("data:")) return resolved;

  if (/^https?:\/\//i.test(resolved)) {
    try {
      const parsed = new URL(resolved);
      if (parsed.pathname.startsWith("/media/")) {
        return encodeMediaPath(`${parsed.pathname}${parsed.search}`);
      }
      return resolved;
    } catch {
      return resolved;
    }
  }

  const path = resolved.startsWith("/") ? resolved : `/${resolved}`;
  if (path.startsWith("/media/")) return encodeMediaPath(path);
  return encodeMediaPath(path);
}
