"use client";

import Image from "@tiptap/extension-image";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useState } from "react";
import { toBrowserMediaSrc } from "@/lib/media";

function ComposerImageView({ node, selected }: NodeViewProps) {
  const rawSrc = String(node.attrs.src ?? "");
  const src = toBrowserMediaSrc(rawSrc) || rawSrc;
  const alt = String(node.attrs.alt ?? "imagem");
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <NodeViewWrapper as="div" className="bb-composer-image-wrap bb-composer-image-wrap--empty">
        {src ? (
          <a className="bb-rich-link" href={src} target="_blank" rel="noreferrer noopener">
            Abrir imagem ({alt})
          </a>
        ) : (
          <span>{alt}</span>
        )}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="div"
      className={`bb-composer-image-wrap${selected ? " is-selected" : ""}`}
      data-drag-handle
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="bb-composer-image"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </NodeViewWrapper>
  );
}

/** Image TipTap com src resolvido no browser (proxy /media). */
export const ComposerImage = Image.extend({
  name: "image",
  addNodeView() {
    return ReactNodeViewRenderer(ComposerImageView);
  },
}).configure({
  inline: false,
  allowBase64: false,
  HTMLAttributes: { class: "bb-composer-image" },
});
