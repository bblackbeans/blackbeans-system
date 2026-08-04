"use client";

import { Button, Modal, Typography } from "antd";
import { CheckCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";

import { WHATS_NEW_RELEASE, type WhatsNewRelease } from "@/lib/whats-new";

type WhatsNewModalProps = {
  open: boolean;
  onClose: () => void;
  release?: WhatsNewRelease;
};

export function WhatsNewModal({ open, onClose, release = WHATS_NEW_RELEASE }: WhatsNewModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      centered
      destroyOnHidden
      styles={{
        content: {
          padding: 0,
          overflow: "hidden",
          background: "linear-gradient(165deg, #0c1a22 0%, #10252e 45%, #0a1218 100%)",
          border: "1px solid rgba(56, 189, 248, 0.35)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.55)",
        },
        header: { display: "none" },
        body: { padding: 0 },
      }}
      closable={false}
    >
      <div style={{ padding: "28px 28px 20px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 12px",
            borderRadius: 999,
            border: "1px solid rgba(56, 189, 248, 0.45)",
            background: "rgba(14, 165, 233, 0.12)",
            color: "#7dd3fc",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          <ThunderboltOutlined />
          Atualizacao {release.version}
        </div>

        <Typography.Title
          level={3}
          style={{
            color: "#e0f2fe",
            margin: "0 0 6px",
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {release.title}
        </Typography.Title>
        <Typography.Paragraph style={{ color: "rgba(224, 242, 254, 0.72)", marginBottom: 22 }}>
          {release.subtitle}
        </Typography.Paragraph>

        <div
          style={{
            maxHeight: "min(52vh, 420px)",
            overflowY: "auto",
            paddingRight: 4,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {release.sections.map((section) => (
            <section key={section.title}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#38bdf8",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: "5px solid transparent",
                    borderBottom: "5px solid transparent",
                    borderLeft: "8px solid #38bdf8",
                  }}
                />
                {section.title}
              </div>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {section.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      color: "rgba(241, 245, 249, 0.92)",
                      fontSize: 14,
                      lineHeight: 1.45,
                    }}
                  >
                    <CheckCircleOutlined style={{ color: "#34d399", marginTop: 3, flexShrink: 0 }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 12,
          padding: "14px 28px 20px",
          borderTop: "1px solid rgba(56, 189, 248, 0.2)",
          background: "rgba(0, 0, 0, 0.25)",
        }}
      >
        <Button
          type="primary"
          onClick={onClose}
          style={{
            background: "#0ea5e9",
            borderColor: "#0ea5e9",
            fontWeight: 600,
          }}
        >
          Entendi
        </Button>
      </div>
    </Modal>
  );
}
