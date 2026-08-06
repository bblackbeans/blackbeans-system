"use client";

import {
  BookOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  LeftOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Modal } from "antd";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { BB_THEME_EVENT } from "@/components/providers";
import { WHATS_NEW_RELEASE, type WhatsNewPage, type WhatsNewRelease } from "@/lib/whats-new";

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
    panelBg: "linear-gradient(165deg, #14110c 0%, #1c1710 45%, #0f0d0a 100%)",
    border: "1px solid rgba(218, 147, 48, 0.45)",
    title: "#fff8ef",
    subtitle: "rgba(255, 236, 210, 0.78)",
    section: "#DA9330",
    item: "#f8fafc",
    muted: "rgba(255, 236, 210, 0.62)",
    badgeBg: "rgba(218, 147, 48, 0.18)",
    badgeText: "#f0c57a",
    badgeBorder: "rgba(218, 147, 48, 0.55)",
    footerBg: "rgba(0, 0, 0, 0.35)",
    footerBorder: "rgba(218, 147, 48, 0.28)",
    icon: "#34d399",
    cta: "#DA9330",
    ctaText: "#14110c",
    cardBg: "rgba(218, 147, 48, 0.06)",
    cardBorder: "rgba(218, 147, 48, 0.28)",
    dot: "rgba(218, 147, 48, 0.35)",
    dotActive: "#DA9330",
    imageBg: "rgba(218, 147, 48, 0.1)",
  },
  light: {
    shellBg: "#ffffff",
    panelBg: "linear-gradient(165deg, #ffffff 0%, #faf6f0 55%, #f7f1e8 100%)",
    border: "1px solid rgba(20, 19, 18, 0.12)",
    title: "#141312",
    subtitle: "#6e6d6e",
    section: "#c47e1f",
    item: "#1c1917",
    muted: "#6e6d6e",
    badgeBg: "rgba(218, 147, 48, 0.14)",
    badgeText: "#9a6414",
    badgeBorder: "rgba(218, 147, 48, 0.45)",
    footerBg: "rgba(20, 19, 18, 0.04)",
    footerBorder: "rgba(20, 19, 18, 0.1)",
    icon: "#059669",
    cta: "#DA9330",
    ctaText: "#14110c",
    cardBg: "rgba(218, 147, 48, 0.06)",
    cardBorder: "rgba(20, 19, 18, 0.1)",
    dot: "rgba(218, 147, 48, 0.35)",
    dotActive: "#DA9330",
    imageBg: "rgba(218, 147, 48, 0.08)",
  },
} as const;

function PageSidePanel({
  page,
  pageIndex,
  total,
  panel,
}: {
  page: WhatsNewPage;
  pageIndex: number;
  total: number;
  panel: (typeof THEMES)[BbTheme];
}) {
  const tip =
    page.howToTest[0] ??
    "Use Anterior / Proximo ou as setas do teclado para folhear a versao.";

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${panel.cardBorder}`,
        background: panel.cardBg,
        padding: "16px 16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 160,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: panel.section,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          <BookOutlined />
          {page.chapter}
        </div>
        <div style={{ color: panel.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {pageIndex + 1}/{total}
        </div>
      </div>

      <div>
        <div
          style={{
            color: panel.muted,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Dica rapida
        </div>
        <div style={{ color: panel.item, fontSize: 13, lineHeight: 1.45 }}>{tip}</div>
      </div>

      {page.highlights && page.highlights.length > 0 ? (
        <div>
          <div
            style={{
              color: panel.muted,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Em uma frase
          </div>
          <div style={{ color: panel.item, fontSize: 13, lineHeight: 1.45 }}>{page.highlights[0]}</div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: "auto",
          paddingTop: 10,
          borderTop: `1px solid ${panel.cardBorder}`,
          color: panel.muted,
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        <EnvironmentOutlined style={{ marginRight: 6, color: panel.section }} />
        {page.where}
      </div>
    </div>
  );
}

export function WhatsNewModal({ open, onClose, release = WHATS_NEW_RELEASE }: WhatsNewModalProps) {
  const [mode, setMode] = useState<BbTheme>("dark");
  const [pageIndex, setPageIndex] = useState(0);
  const panel = THEMES[mode];
  const pages = release.pages;
  const total = pages.length;
  const page = pages[pageIndex] ?? pages[0];
  const isFirst = pageIndex <= 0;
  const isLast = pageIndex >= total - 1;

  const chapterLabels = useMemo(
    () => pages.map((p, index) => ({ id: p.id, label: p.chapter, index })),
    [pages],
  );

  useEffect(() => {
    setMode(readBbTheme());
    const onTheme = () => setMode(readBbTheme());
    window.addEventListener(BB_THEME_EVENT, onTheme as EventListener);
    return () => window.removeEventListener(BB_THEME_EVENT, onTheme as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode(readBbTheme());
    setPageIndex(0);
  }, [open]);

  function go(delta: number) {
    setPageIndex((prev) => Math.min(total - 1, Math.max(0, prev + delta)));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  }

  if (!page) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
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
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{
          background: panel.panelBg,
          color: panel.item,
          border: panel.border,
          borderRadius: 10,
          overflow: "hidden",
          outline: "none",
          boxShadow:
            mode === "light"
              ? "0 16px 40px rgba(20, 19, 18, 0.12)"
              : "0 24px 64px rgba(0, 0, 0, 0.55)",
        }}
      >
        <div style={{ padding: "22px 24px 12px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
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
              }}
            >
              <ThunderboltOutlined />
              Versao {release.version}
            </div>
            <div style={{ color: panel.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              Pagina {pageIndex + 1} / {total}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            {chapterLabels.map((ch) => {
              const active = ch.index === pageIndex;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setPageIndex(ch.index)}
                  style={{
                    border: `1px solid ${active ? panel.badgeBorder : panel.cardBorder}`,
                    background: active ? panel.badgeBg : "transparent",
                    color: active ? panel.badgeText : panel.muted,
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {ch.label}
                </button>
              );
            })}
          </div>

          <h3
            style={{
              color: panel.title,
              margin: "0 0 6px",
              fontWeight: 700,
              fontSize: 20,
              lineHeight: 1.3,
            }}
          >
            {page.title}
          </h3>

          {page.id === "fim" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                textAlign: "center",
                padding: "8px 4px 4px",
              }}
            >
              <div
                style={{
                  maxWidth: 520,
                  borderRadius: 12,
                  border: `1px solid ${panel.cardBorder}`,
                  background: panel.imageBg,
                  padding: "22px 22px 18px",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: panel.item,
                    fontSize: 16,
                    lineHeight: 1.55,
                    fontWeight: 500,
                  }}
                >
                  {page.summary}
                </p>
                {page.ps ? (
                  <p
                    style={{
                      margin: "18px 0 0",
                      color: panel.muted,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: panel.item }}>ps.</strong> {page.ps}
                  </p>
                ) : null}
                <div
                  style={{
                    marginTop: 16,
                    color: panel.section,
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 0.3,
                  }}
                >
                  Assinado: Dev
                </div>
              </div>

              {page.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={page.imageSrc}
                  alt={page.imageAlt || "Time"}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 520,
                    height: "auto",
                    maxHeight: 320,
                    objectFit: "contain",
                    objectPosition: "center top",
                    borderRadius: 12,
                    border: `1px solid ${panel.cardBorder}`,
                    background: panel.cardBg,
                  }}
                />
              ) : null}
            </div>
          ) : (
            <>
              <p
                style={{
                  color: panel.subtitle,
                  margin: "0 0 14px",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {page.summary}
              </p>

              <div className="bb-whats-new-book-grid">
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${panel.cardBorder}`,
                      background: panel.cardBg,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: panel.section,
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      <EnvironmentOutlined />
                      Onde fica
                    </div>
                    <div style={{ color: panel.item, fontSize: 13, lineHeight: 1.45 }}>{page.where}</div>
                  </div>

                  <div
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${panel.cardBorder}`,
                      background: panel.cardBg,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: panel.section,
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      <ExperimentOutlined />
                      Como testar
                    </div>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        color: panel.item,
                        fontSize: 13,
                        lineHeight: 1.45,
                      }}
                    >
                      {page.howToTest.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  {page.highlights && page.highlights.length > 0 ? (
                    <ul
                      style={{
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {page.highlights.map((item) => (
                        <li
                          key={item}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "flex-start",
                            color: panel.item,
                            fontSize: 13,
                            lineHeight: 1.4,
                          }}
                        >
                          <CheckCircleOutlined style={{ color: panel.icon, marginTop: 2, flexShrink: 0 }} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div style={{ minWidth: 0 }}>
                  <PageSidePanel page={page} pageIndex={pageIndex} total={total} panel={panel} />
                </div>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 24px 18px",
            borderTop: `1px solid ${panel.footerBorder}`,
            background: panel.footerBg,
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {pages.map((p, index) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Ir para pagina ${index + 1}`}
                onClick={() => setPageIndex(index)}
                style={{
                  width: index === pageIndex ? 18 : 8,
                  height: 8,
                  borderRadius: 999,
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  background: index === pageIndex ? panel.dotActive : panel.dot,
                  transition: "width 120ms ease, background 120ms ease",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
            <Button icon={<LeftOutlined />} disabled={isFirst} onClick={() => go(-1)}>
              Anterior
            </Button>
            {!isLast ? (
              <Button type="primary" icon={<RightOutlined />} onClick={() => go(1)} style={{ background: panel.cta, borderColor: panel.cta }}>
                Proximo
              </Button>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
