"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Modal } from "antd";
import { toBrowserMediaSrc } from "@/lib/media";
import { looksLikeHtml, normalizeHtmlMediaPaths, sanitizeRichHtml, toEditorHtml } from "@/lib/rich-content";

type Props = {
  html: string;
  className?: string;
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Renderiza HTML publicado com imagens clicaveis (lightbox via Modal).
 * So um <img> nativo por imagem — sem Ant Image (duplicava a thumbnail).
 */
export function RichHtmlView({ html, className }: Props) {
  const mounted = useIsClient();

  const safe = useMemo(() => {
    const normalized = normalizeHtmlMediaPaths(toEditorHtml(html));
    return sanitizeRichHtml(normalized);
  }, [html]);

  if (!String(html ?? "").trim()) {
    return null;
  }

  if (!mounted) {
    return (
      <div
        className={`bb-rich-html ${className ?? ""}`.trim()}
        dangerouslySetInnerHTML={{
          __html: safe.replace(
            /<img\b[^>]*>/gi,
            '<span class="bb-rich-image-wrap bb-rich-image-wrap--loading"></span>',
          ),
        }}
      />
    );
  }

  const parts = splitHtmlByImages(safe);

  return (
    <div className={`bb-rich-html ${className ?? ""}`.trim()}>
      {parts.map((part, index) => {
        if (part.type === "html") {
          return (
            <span
              key={`h-${index}`}
              dangerouslySetInnerHTML={{ __html: part.value }}
            />
          );
        }
        return <NativeRichImage key={`i-${index}`} src={part.src} alt={part.alt} />;
      })}
    </div>
  );
}

function NativeRichImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const resolved = toBrowserMediaSrc(src);

  if (!resolved) {
    return <span className="bb-rich-image-wrap">{alt || "imagem"}</span>;
  }

  if (failed) {
    return (
      <span className="bb-rich-image-wrap" style={{ display: "block", margin: "6px 0" }}>
        <a className="bb-rich-link" href={resolved} target="_blank" rel="noreferrer noopener">
          Abrir imagem{alt ? ` (${alt})` : ""}
        </a>
      </span>
    );
  }

  return (
    <span className="bb-rich-image-wrap" style={{ display: "block" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolved}
        alt={alt || "imagem"}
        className="bb-rich-image"
        loading="lazy"
        onError={() => setFailed(true)}
        onClick={() => setPreview(true)}
        style={{ maxWidth: "100%", width: "auto", borderRadius: 8, cursor: "zoom-in", display: "block" }}
      />
      <Modal
        open={preview}
        onCancel={() => setPreview(false)}
        footer={null}
        centered
        width="min(960px, 96vw)"
        styles={{ body: { padding: 0, textAlign: "center", background: "#000" } }}
        destroyOnHidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolved}
          alt={alt || "imagem"}
          style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" }}
        />
      </Modal>
    </span>
  );
}

type HtmlPart =
  | { type: "html"; value: string }
  | { type: "img"; src: string; alt: string };

function splitHtmlByImages(html: string): HtmlPart[] {
  const re = /<img\b([^>]*)>/gi;
  const parts: HtmlPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match.index > last) {
      parts.push({ type: "html", value: html.slice(last, match.index) });
    }
    const attrs = match[1] || "";
    const src =
      /src\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2] ||
      /src\s*=\s*([^\s>]+)/i.exec(attrs)?.[1] ||
      "";
    const alt = /alt\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2] || "imagem";
    if (src) parts.push({ type: "img", src: src.replace(/&amp;/g, "&"), alt });
    else if (alt) parts.push({ type: "html", value: `[imagem: ${alt}]` });
    last = match.index + match[0].length;
  }
  if (last < html.length) parts.push({ type: "html", value: html.slice(last) });
  if (!parts.length && looksLikeHtml(html)) parts.push({ type: "html", value: html });
  return parts;
}
