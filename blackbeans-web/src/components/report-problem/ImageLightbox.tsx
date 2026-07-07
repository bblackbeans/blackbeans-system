"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type ImageLightboxProps = {
  src: string;
  alt?: string;
  onClose: () => void;
};

export function ImageLightbox({ src, alt = "Screenshot", onClose }: ImageLightboxProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: "95vw",
          maxHeight: "95vh",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        }}
      />
    </div>,
    document.body,
  );
}
