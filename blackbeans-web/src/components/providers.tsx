"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider, theme } from "antd";
import ptBR from "antd/locale/pt_BR";

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={ptBR}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
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
