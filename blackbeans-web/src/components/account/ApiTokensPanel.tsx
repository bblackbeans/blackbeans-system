"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, List, Space, Typography, message } from "antd";

import { apiRequest } from "@/lib/api";

type ApiTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  created_at?: string | null;
  is_active?: boolean;
};

export function ApiTokensPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<ApiTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("Cursor MCP");
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ tokens: ApiTokenRow[] }>("/me/api-tokens", { token });
      if (!response.ok) {
        message.error(response.error?.message ?? "Falha ao listar tokens.");
        return;
      }
      setRows(response.data?.tokens ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const createToken = async () => {
    const response = await apiRequest<{ token: ApiTokenRow & { token: string } }>("/me/api-tokens", {
      token,
      method: "POST",
      body: { name: name.trim() || "MCP", expires_in_days: 90 },
    });
    if (!response.ok) {
      message.error(response.error?.message ?? "Falha ao criar token.");
      return;
    }
    const raw = response.data?.token?.token ?? null;
    setCreatedRaw(raw);
    message.success("Token criado. Copie agora — não será mostrado de novo.");
    await load();
  };

  const revoke = async (id: string) => {
    const response = await apiRequest(`/me/api-tokens/${id}`, { token, method: "DELETE" });
    if (!response.ok) {
      message.error(response.error?.message ?? "Falha ao revogar.");
      return;
    }
    message.success("Token revogado.");
    await load();
  };

  return (
    <Card title="Tokens de API (MCP)" loading={loading}>
      <Typography.Paragraph type="secondary">
        Gere um Personal Access Token para conectar o MCP no Cursor/Claude. O valor completo só aparece uma vez.
      </Typography.Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do token"
          style={{ width: 220 }}
        />
        <Button type="primary" onClick={() => void createToken()}>
          Criar token
        </Button>
        <Button onClick={() => void load()}>Atualizar</Button>
      </Space>
      {createdRaw ? (
        <Typography.Paragraph copyable={{ text: createdRaw }}>
          Novo token: {createdRaw}
        </Typography.Paragraph>
      ) : null}
      <List
        size="small"
        dataSource={rows}
        locale={{ emptyText: "Nenhum token ainda." }}
        renderItem={(row) => (
          <List.Item
            actions={[
              row.revoked_at ? null : (
                <Button key="revoke" danger size="small" onClick={() => void revoke(row.id)}>
                  Revogar
                </Button>
              ),
            ].filter(Boolean)}
          >
            <List.Item.Meta
              title={`${row.name} (${row.token_prefix}…)`}
              description={`Escopos: ${(row.scopes || []).join(", ") || "—"}${
                row.revoked_at ? " · revogado" : row.is_active === false ? " · inativo" : " · ativo"
              }`}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
