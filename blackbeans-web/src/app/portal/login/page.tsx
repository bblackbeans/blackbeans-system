"use client";

import { App, Button, Card, Form, Input, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import { getPortalToken, setPortalSession } from "@/lib/portal-auth";

export default function PortalLoginPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (getPortalToken()) {
      router.replace("/portal");
    }
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#0a0a0a",
      }}
    >
      <Card style={{ width: "100%", maxWidth: 420 }} title="Portal do cliente">
        <Typography.Paragraph type="secondary">
          Use o usuario e senha da sua empresa para ver pedidos e abrir novas demandas.
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setLoading(true);
            try {
              const response = await apiRequest<{
                access_token: string;
                client: { id: string; name: string; portal_username?: string };
              }>("/client-portal/auth/login", {
                method: "POST",
                body: {
                  username: String(values.username ?? "").trim(),
                  password: String(values.password ?? ""),
                },
              });
              if (!response.ok || !response.data?.access_token) {
                message.error(response.error?.message ?? "Falha no login.");
                return;
              }
              setPortalSession(response.data.access_token, {
                id: response.data.client.id,
                name: response.data.client.name,
                portal_username: response.data.client.portal_username,
              });
              message.success("Login realizado.");
              router.replace("/portal");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item
            name="username"
            label="Usuario da empresa"
            rules={[{ required: true, message: "Informe o usuario." }]}
          >
            <Input autoComplete="username" placeholder="empresa.login" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Senha"
            rules={[{ required: true, message: "Informe a senha." }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Entrar
          </Button>
        </Form>
      </Card>
    </main>
  );
}
