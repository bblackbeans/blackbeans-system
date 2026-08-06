/** Detecta se o conteudo ja parece HTML TipTap / rico. */
export function looksLikeHtml(content: string): boolean {
  const raw = (content || "").trim();
  if (!raw) return false;
  return /<\/?[a-z][\s\S]*>/i.test(raw);
}

/** Conteudo TipTap vazio (`<p></p>`, espacos, etc.). */
export function isEmptyRichHtml(html: string | null | undefined): boolean {
  const raw = String(html ?? "").trim();
  if (!raw) return true;
  if (/<img\b/i.test(raw)) return false;
  const text = raw
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .trim();
  return !text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extrai URL de `![alt](` ate o `)` correspondente (suporta `(1)` no path). */
function takeBalancedUrl(source: string, start: number): { url: string; end: number } | null {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (depth === 0) break;
    i += 1;
  }
  if (depth !== 0) return null;
  return { url: source.slice(start, i).trim(), end: i + 1 };
}

/** Converte markdown de imagem restante (mesmo dentro de HTML hibrido). */
export function convertMarkdownImages(html: string): string {
  let out = "";
  let i = 0;
  const src = String(html ?? "");
  while (i < src.length) {
    const open = src.indexOf("![", i);
    if (open < 0) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, open);
    const altClose = src.indexOf("](", open + 2);
    if (altClose < 0) {
      out += src.slice(open);
      break;
    }
    const alt = src.slice(open + 2, altClose);
    const taken = takeBalancedUrl(src, altClose + 2);
    if (!taken || !taken.url) {
      out += src.slice(open, altClose + 2);
      i = altClose + 2;
      continue;
    }
    const url = taken.url;
    out += `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt || "imagem")}" />`;
    i = taken.end;
  }
  return out;
}

function convertMarkdownLinks(html: string): string {
  return html.replace(
    /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/media\/[^)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`,
  );
}

function convertPlainMentions(html: string): string {
  // Nao converter @ ja dentro de data-id / mention span
  return html.replace(
    /(^|[\s>])@([a-zA-Z0-9_.@-]+)/g,
    (full, prefix: string, user: string, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 40), offset);
      if (/data-(?:id|label)=["'][^"']*$/i.test(before) || /class=["'][^"']*mention[^"']*$/i.test(before)) {
        return full;
      }
      // Ja e um mention tipado
      if (/<\/?span\b/i.test(before) && /mention/i.test(before)) return full;
      return `${prefix}<span data-type="mention" class="mention" data-id="${escapeHtml(user)}" data-label="${escapeHtml(user)}">@${escapeHtml(user)}</span>`;
    },
  );
}

/**
 * Converte markdown/texto legado (imagens, links, @) para HTML uma vez no cliente.
 * Nao e um parser completo — cobre o que o app ja gerava.
 */
export function legacyMarkdownToHtml(content: string): string {
  const raw = String(content ?? "");
  if (!raw.trim()) return "";
  if (looksLikeHtml(raw)) {
    // Hibrido: HTML TipTap + markdown de imagem legado
    return convertPlainMentions(convertMarkdownLinks(convertMarkdownImages(raw)));
  }

  let html = escapeHtml(raw);
  html = convertMarkdownImages(html);
  html = convertMarkdownLinks(html);
  html = convertPlainMentions(html);

  // Negrito / italico basicos
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Paragrafos por linhas em branco; quebras simples → <br>
  const blocks = html.split(/\n{2,}/).map((block) => {
    const inner = block.replace(/\n/g, "<br>");
    return `<p>${inner || "<br>"}</p>`;
  });
  return blocks.join("");
}

/** Normaliza valor persistido para HTML pronto para o TipTap / leitura. */
export function toEditorHtml(content: string | null | undefined): string {
  const raw = String(content ?? "");
  if (!raw.trim()) return "";
  if (looksLikeHtml(raw)) {
    return convertPlainMentions(convertMarkdownLinks(convertMarkdownImages(raw)));
  }
  return legacyMarkdownToHtml(raw);
}

/** Reescreve src/href absolutos de /media (e paths de disco) para path relativo. */
export function normalizeHtmlMediaPaths(html: string): string {
  const rewrite = (url: string): string => {
    const raw = String(url ?? "").trim();
    if (!raw) return raw;
    const idx = raw.indexOf("/media/");
    if (idx >= 0) {
      try {
        const parsed = new URL(raw.startsWith("http") ? raw : `http://local${raw.slice(idx)}`);
        if (parsed.pathname.startsWith("/media/")) {
          return `${parsed.pathname}${parsed.search}`;
        }
      } catch {
        return raw.slice(idx);
      }
      return raw.slice(idx);
    }
    return raw;
  };
  return String(html ?? "")
    .replace(/\bsrc=(["'])([^"']+)\1/gi, (_m, quote: string, url: string) => {
      const next = rewrite(url);
      return next !== url ? `src=${quote}${next}${quote}` : _m;
    })
    .replace(/\bhref=(["'])([^"']+)\1/gi, (_m, quote: string, url: string) => {
      const next = rewrite(url);
      return next !== url ? `href=${quote}${next}${quote}` : _m;
    });
}

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "img",
  "span",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "pre",
  "code",
  "div",
  "label",
  "input",
]);

/** Sanitizacao leve para HTML publicado (sem scripts). */
export function sanitizeRichHtml(html: string): string {
  if (typeof window === "undefined") {
    return String(html ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+=(["']).*?\1/gi, "")
      .replace(/\son\w+=[^\s>]+/gi, "");
  }
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          el.replaceWith(...Array.from(el.childNodes));
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on") || name === "srcdoc") {
            el.removeAttribute(attr.name);
            continue;
          }
          if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attr.value)) {
            el.removeAttribute(attr.name);
          }
        }
        if (tag === "a") {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer nofollow");
        }
        if (tag === "img") {
          const src = el.getAttribute("src");
          if (src) el.setAttribute("src", src);
        }
        walk(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };
  walk(template.content);
  return template.innerHTML;
}
