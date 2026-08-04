"use client";

import { Button, Modal } from "antd";
import { CheckCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useEffect, useState, type CSSProperties } from "react";

import { BB_THEME_EVENT } from "@/components/providers";
import { WHATS_NEW_RELEASE, type WhatsNewRelease } from "@/lib/whats-new";

type WhatsNewModalProps = {
  open: boolean;
  onClose: () => void;
  release?: WhatsNewRelease;
};

type BbTheme = "light" | "dark";

function readBbTheme(): BbTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.bbTheme === "light" ? "light" : "dark";
}

const THEMES = {
  dark: {
    shellBg: "#0a1218",
    panelBg: "linear-gradient(165deg, #0c1a22 0%, #10252e 45%, #0a1218 100%)",
    border: "1px solid rgba(56, 189, 248, 0.4)",
    title: "#f0f9ff",
    subtitle: "rgba(224, 242, 254, 0.78)",
    section: "#38bdf8",
    item: "#f8fafc",
    badgeBg: "rgba(14, 165, 233, 0.18)",
    badgeText: "#7dd3fc",
    badgeBorder: "rgba(56, 189, 248, 0.5)",
    footerBg: "rgba(0, 0, 0, 0.35)",
    footerBorder: "rgba(56, 189, 248, 0.25)",
    icon: "#34d399",
    cta: "#0ea5e9",
    ctaText: "#fff",
    scrollThumb: "rgba(125, 211, 252, 0.35)",
    scrollTrack: "rgba(255, 255, 255, 0.04)",
  },
  light: {
    shellBg: "#ffffff",
    panelBg: "linear-gradient(165deg, #ffffff 0%, #f7f4f1 55%, #f4f0ed 100%)",
    border: "1px solid rgba(20, 19, 18, 0.12)",
    title: "#141312",
    subtitle: "#6e6d6e",
    section: "#0b7eb5",
    item: "#1c1917",
    badgeBg: "rgba(14, 165, 233, 0.12)",
    badgeText: "#0369a1",
    badgeBorder: "rgba(14, 165, 233, 0.35)",
    footerBg: "rgba(20, 19, 18, 0.04)",
    footerBorder: "rgba(20, 19, 18, 0.1)",
    icon: "#059669",
    cta: "#0ea5e9",
    ctaText: "#fff",
    scrollThumb: "rgba(20, 19, 18, 0.22)",
    scrollTrack: "rgba(20, 19, 18, 0.05)",
  },
} as const;

export function WhatsNewModal({ open, onClose, release = WHATS_NEW_RELEASE }: WhatsNewModalProps) {
  const [mode, setMode] = useState<BbTheme>("dark");
  const panel = THEMES[mode];

  useEffect(() => {
    setMode(readBbTheme());
    const onTheme = () => setMode(readBbTheme());
    window.addEventListener(BB_THEME_EVENT, onTheme as EventListener);
    return () => window.removeEventListener(BB_THEME_EVENT, onTheme as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode(readBbTheme());
  }, [open]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      centered
      destroyOnHidden
      closable={false}
      rootClassName={`bb-whats-new-modal bb-whats-new-modal--${mode}`}
      styles={{
        header: { display: "none" },
        body: {
          padding: 0,
          background: panel.shellBg,
        },
      }}
    >
      <div
        style={{
          background: panel.panelBg,
          color: panel.item,
          border: panel.border,
          borderRadius: 10,
          overflow: "hidden",
          boxShadow:
            mode === "light"
              ? "0 16px 40px rgba(20, 19, 18, 0.12)"
              : "0 24px 64px rgba(0, 0, 0, 0.55)",
        }}
      >
        <div style={{ padding: "28px 28px 20px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              borderRadius: 999,
              border: `1px solid ${panel.badgeBorder}`,
              background: panel.badgeBg,
              color: panel.badgeText,
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

          <h3
            style={{
              color: panel.title,
              margin: "0 0 6px",
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1.3,
              letterSpacing: 0.2,
            }}
          >
            {release.title}
          </h3>
          <p
            style={{
              color: panel.subtitle,
              margin: "0 0 22px",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {release.subtitle}
          </p>

          <div
            className="bb-whats-new-scroll"
            style={
              {
                maxHeight: "min(52vh, 420px)",
                overflowY: "auto",
                paddingRight: 6,
                display: "flex",
                flexDirection: "column",
                gap: 18,
                ["--bb-wn-scroll-thumb"]: panel.scrollThumb,
                ["--bb-wn-scroll-track"]: panel.scrollTrack,
              } as CSSProperties
            }
          >
            {release.sections.map((section) => (
              <section key={section.title}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: panel.section,
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
                      borderLeft: `8px solid ${panel.section}`,
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
                        color: panel.item,
                        fontSize: 14,
                        lineHeight: 1.45,
                      }}
                    >
                      <CheckCircleOutlined
                        style={{ color: panel.icon, marginTop: 3, flexShrink: 0 }}
                      />
                      <span style={{ color: panel.item }}>{item}</span>
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
            borderTop: `1px solid ${panel.footerBorder}`,
            background: panel.footerBg,
          }}
        >
          <Button
            type="primary"
            onClick={onClose}
            style={{
              background: panel.cta,
              borderColor: panel.cta,
              fontWeight: 600,
              color: panel.ctaText,
            }}
          >
            Entendi
          </Button>
        </div>
      </div>
    </Modal>
  );
}
