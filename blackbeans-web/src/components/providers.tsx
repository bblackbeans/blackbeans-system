"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider, theme } from "antd";
import ptBR from "antd/locale/pt_BR";
import { useEffect, useState } from "react";

type ProvidersProps = {
  children: React.ReactNode;
};

type BbTheme = "light" | "dark";

const THEME_STORAGE_KEY = "bb_theme";
export const BB_THEME_EVENT = "bb:theme";

function readStoredTheme(): BbTheme {
  if (typeof window === "undefined") return "light";
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "dark" ? "dark" : "light";
}

export function setBbTheme(next: BbTheme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, next);
  window.dispatchEvent(new CustomEvent(BB_THEME_EVENT, { detail: next }));
}

export function Providers({ children }: ProvidersProps) {
  const [mode, setMode] = useState<BbTheme>("light");

  useEffect(() => {
    setMode(readStoredTheme());
    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<BbTheme>).detail;
      if (detail === "dark" || detail === "light") {
        setMode(detail);
        return;
      }
      setMode(readStoredTheme());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setMode(readStoredTheme());
    };
    window.addEventListener(BB_THEME_EVENT, onTheme as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BB_THEME_EVENT, onTheme as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.bbTheme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const isDark = mode === "dark";

  return (
    <AntdRegistry>
      <ConfigProvider
        locale={ptBR}
        theme={{
          algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: isDark
            ? {
                colorPrimary: "#DA9330",
                borderRadius: 10,
                fontFamily: "Roboto, Arial, Helvetica, sans-serif",
              }
            : {
                colorPrimary: "#DA9330",
                colorBgBase: "#F4F0ED",
                colorTextBase: "#141312",
                colorTextSecondary: "#6E6D6E",
                borderRadius: 10,
                fontFamily: "Roboto, Arial, Helvetica, sans-serif",
              },
        }}
      >
        {children}
      </ConfigProvider>
    </AntdRegistry>
  );
}
