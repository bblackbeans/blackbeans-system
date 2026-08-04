"use client";

import { CheckCircleOutlined, LoadingOutlined } from "@ant-design/icons";

export type UploadToastItem = {
  id: string;
  name: string;
  status: "uploading" | "done" | "error";
};

type Props = {
  items: UploadToastItem[];
};

/** Toast canto inferior direito estilo Monday (enviando / concluido). */
export function UploadProgressToast({ items }: Props) {
  if (!items.length) return null;
  return (
    <div className="bb-upload-toast" role="status" aria-live="polite">
      <div className="bb-upload-toast__title">Arquivos</div>
      <ul className="bb-upload-toast__list">
        {items.map((item) => (
          <li key={item.id} className={`bb-upload-toast__item bb-upload-toast__item--${item.status}`}>
            <span className="bb-upload-toast__icon">
              {item.status === "uploading" ? (
                <LoadingOutlined spin />
              ) : item.status === "done" ? (
                <CheckCircleOutlined />
              ) : (
                "!"
              )}
            </span>
            <span className="bb-upload-toast__name" title={item.name}>
              {item.name}
            </span>
            <span className="bb-upload-toast__status">
              {item.status === "uploading"
                ? "Enviando…"
                : item.status === "done"
                  ? "Concluído"
                  : "Falhou"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
