/** Converte HTML rico (descricao/comentarios) em texto simples, preservando quebras de linha e listas. */
export function htmlToPlainText(html: string): string {
  const source = String(html ?? "");
  if (!source.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return source.replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").trim();
  }
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
  doc.querySelectorAll("li").forEach((el) => el.prepend("• "));
  doc.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr").forEach((el) => el.append("\n"));
  doc.querySelectorAll("a[href]").forEach((el) => {
    const href = el.getAttribute("href") ?? "";
    const label = el.textContent ?? "";
    if (href && !label.includes(href)) el.append(` (${href})`);
  });
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Copia para a area de transferencia. Com `html`, grava texto e HTML (cola formatado no Docs/e-mail
 * e como texto puro em campos simples). Retorna false se o navegador bloquear.
 */
export async function copyToClipboard(options: { text: string; html?: string }): Promise<boolean> {
  const { text, html } = options;
  try {
    if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
