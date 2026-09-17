"use client";

import { AudioOutlined, StopOutlined, UploadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { usePedidoMediaAttachments } from "@/hooks/usePedidoMediaAttachments";
import { apiRequest } from "@/lib/api";
import {
  PEDIDO_ACCEPT,
  PEDIDO_MAX_FILE_BYTES,
  appendPedidoFilesToFormData,
} from "@/lib/pedido-media";
import {
  clearPortalSession,
  getPortalClient,
  getPortalToken,
  type PortalClientInfo,
} from "@/lib/portal-auth";

type PortalAttachment = {
  id: string;
  filename: string;
  kind?: string;
  url?: string | null;
};

type PortalFeedback = {
  id: string;
  author_name?: string;
  content?: string;
  content_text?: string;
  created_at?: string;
  attachments?: PortalAttachment[];
};

type PortalRequest = {
  id: string;
  title: string;
  description?: string;
  status: string;
  display_status?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  attachments?: PortalAttachment[];
  created_at?: string;
  converted_task_id?: string | null;
  client_review_status?: string;
  client_revision_note?: string;
  can_review?: boolean;
  review_locked?: boolean;
  feedback?: PortalFeedback[];
  feedback_count?: number;
  task_status?: string | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  new: { label: "Novo", color: "blue" },
  in_review: { label: "Em analise", color: "gold" },
  in_progress: { label: "Em andamento", color: "processing" },
  completed: { label: "Concluida", color: "purple" },
  approved: { label: "Aprovada", color: "green" },
  revision_requested: { label: "Revisao pedida", color: "orange" },
  rejected: { label: "Recusado", color: "red" },
  converted: { label: "Em andamento", color: "processing" },
};

const pageBg = "#0a0a0a";

export default function PortalHomePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [token, setToken] = useState<string | null>(null);
  const [client, setClient] = useState<PortalClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PortalRequest[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<PortalRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [form] = Form.useForm();
  const media = usePedidoMediaAttachments(message);

  const logout = useCallback(() => {
    clearPortalSession();
    router.replace("/portal/login");
  }, [router]);

  const loadRequests = useCallback(
    async (authToken: string) => {
      setLoading(true);
      try {
        const response = await apiRequest<{ requests: PortalRequest[] }>("/client-portal/requests", {
          token: authToken,
        });
        if (!response.ok) {
          if (response.status === 401) {
            logout();
            return;
          }
          message.error(response.error?.message ?? "Falha ao listar pedidos.");
          return;
        }
        setRows(response.data?.requests ?? []);
      } finally {
        setLoading(false);
      }
    },
    [logout, message],
  );

  useEffect(() => {
    const authToken = getPortalToken();
    const portalClient = getPortalClient();
    if (!authToken) {
      router.replace("/portal/login");
      return;
    }
    setToken(authToken);
    setClient(portalClient);
    void loadRequests(authToken);
  }, [loadRequests, router]);

  useEffect(() => {
    if (!createOpen) return;
    form.setFieldsValue({
      client_name: client?.name ?? "",
    });
  }, [createOpen, client?.name, form]);

  const openCreate = () => {
    media.resetAttachments();
    form.resetFields();
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (media.recording) {
      message.warning("Pare a gravacao antes de fechar.");
      return;
    }
    setCreateOpen(false);
    form.resetFields();
    media.resetAttachments();
  };

  const openDetail = async (row: PortalRequest) => {
    if (!token) return;
    setDetail(row);
    setDetailLoading(true);
    try {
      const response = await apiRequest<{ request: PortalRequest }>(`/client-portal/requests/${row.id}`, {
        token,
      });
      if (!response.ok) {
        message.error(response.error?.message ?? "Falha ao carregar pedido.");
        return;
      }
      if (response.data?.request) setDetail(response.data.request);
    } finally {
      setDetailLoading(false);
    }
  };

  const approveRequest = async () => {
    if (!token || !detail) return;
    setActionLoading(true);
    try {
      const response = await apiRequest<{ request: PortalRequest }>(
        `/client-portal/requests/${detail.id}/approve`,
        { method: "POST", token, body: {} },
      );
      if (!response.ok) {
        message.error(response.error?.message ?? "Falha ao aprovar.");
        return;
      }
      message.success("Demanda aprovada. Nao e mais possivel alterar.");
      if (response.data?.request) setDetail(response.data.request);
      await loadRequests(token);
    } finally {
      setActionLoading(false);
    }
  };

  const submitRevision = async () => {
    if (!token || !detail) return;
    const note = revisionNote.trim();
    if (note.length < 5) {
      message.error("Descreva o que ficou faltando ou errado.");
      return;
    }
    setActionLoading(true);
    try {
      const response = await apiRequest<{ request: PortalRequest }>(
        `/client-portal/requests/${detail.id}/request-revision`,
        { method: "POST", token, body: { note } },
      );
      if (!response.ok) {
        message.error(response.error?.message ?? "Falha ao pedir revisao.");
        return;
      }
      message.success("Revisao enviada para a equipe.");
      setRevisionOpen(false);
      setRevisionNote("");
      if (response.data?.request) setDetail(response.data.request);
      await loadRequests(token);
    } finally {
      setActionLoading(false);
    }
  };

  const statusMeta = (row: PortalRequest) => {
    const key = row.display_status || row.status;
    return STATUS_LABEL[key] ?? { label: key, color: "default" };
  };

  if (!token) {
    return null;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: isMobile ? "16px 12px 40px" : "28px 20px 56px",
        background: pageBg,
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}>
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Card styles={{ body: { padding: isMobile ? 16 : 20 } }}>
            <Space
              style={{ width: "100%", justifyContent: "space-between", alignItems: "flex-start" }}
              wrap
              size={12}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
                  Pedidos
                </Typography.Title>
                <Typography.Text type="secondary">
                  {client?.name ? `Empresa: ${client.name}` : "Portal do cliente"}
                </Typography.Text>
              </div>
              <Space wrap>
                <Button type="primary" onClick={openCreate} block={isMobile}>
                  Nova demanda
                </Button>
                <Button onClick={logout} block={isMobile}>
                  Sair
                </Button>
              </Space>
            </Space>
          </Card>

          <Card title="Como funciona" styles={{ body: { padding: isMobile ? 16 : 20 } }}>
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                1. Abra uma <Typography.Text strong>nova demanda</Typography.Text> com titulo, detalhes e
                anexos (imagem, arquivo ou audio).
              </Typography.Paragraph>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                2. Acompanhe o status: Novo, Em analise, Em andamento, Concluida, Aprovada ou Revisao pedida.
              </Typography.Paragraph>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                3. Quando a equipe concluir, voce vera as{" "}
                <Typography.Text strong>devolutivas</Typography.Text> e podera{" "}
                <Typography.Text strong>aprovar</Typography.Text> ou{" "}
                <Typography.Text strong>pedir revisao</Typography.Text> explicando o que ficou errado.
              </Typography.Paragraph>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Depois de aprovar, o pedido fica travado e nao muda mais. Nao ha edicao nem exclusao neste
                portal.
              </Typography.Paragraph>
            </Space>
          </Card>

          <Card styles={{ body: { padding: isMobile ? 12 : 20 } }}>
            {isMobile ? (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                {loading ? (
                  <Typography.Text type="secondary">Carregando…</Typography.Text>
                ) : rows.length === 0 ? (
                  <Empty description="Nenhum pedido ainda." />
                ) : (
                  rows.map((row) => {
                    const meta = statusMeta(row);
                    return (
                      <Card
                        key={row.id}
                        size="small"
                        hoverable
                        onClick={() => void openDetail(row)}
                        styles={{ body: { padding: 14 } }}
                      >
                        <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                          <Typography.Text strong style={{ color: "#DA9330" }}>
                            {row.title}
                          </Typography.Text>
                          <Space wrap>
                            <Tag color={meta.color}>{meta.label}</Tag>
                            {(row.feedback_count ?? 0) > 0 ? (
                              <Tag>{row.feedback_count} devolutiva(s)</Tag>
                            ) : null}
                            {row.can_review ? <Tag color="purple">Aguardando voce</Tag> : null}
                          </Space>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "—"}
                          </Typography.Text>
                        </Space>
                      </Card>
                    );
                  })
                )}
              </Space>
            ) : (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={rows}
                locale={{ emptyText: <Empty description="Nenhum pedido ainda." /> }}
                pagination={{ pageSize: 10 }}
                scroll={{ x: true }}
                columns={[
                  {
                    title: "Titulo",
                    dataIndex: "title",
                    render: (value: string, row) => (
                      <Button type="link" style={{ padding: 0, height: "auto" }} onClick={() => void openDetail(row)}>
                        {value}
                      </Button>
                    ),
                  },
                  {
                    title: "Status",
                    width: 160,
                    render: (_: unknown, row: PortalRequest) => {
                      const meta = statusMeta(row);
                      return <Tag color={meta.color}>{meta.label}</Tag>;
                    },
                  },
                  {
                    title: "Devolutivas",
                    width: 120,
                    render: (_: unknown, row: PortalRequest) => row.feedback_count ?? 0,
                  },
                  {
                    title: "Criado em",
                    dataIndex: "created_at",
                    width: 180,
                    render: (value?: string) =>
                      value ? new Date(value).toLocaleString("pt-BR") : "-",
                  },
                ]}
              />
            )}
          </Card>
        </Space>
      </div>

      <Drawer
        title={detail?.title ?? "Pedido"}
        open={Boolean(detail)}
        onClose={() => {
          setDetail(null);
          setRevisionOpen(false);
          setRevisionNote("");
        }}
        size={isMobile ? "100%" : 520}
      >
        {detail ? (
          <Space orientation="vertical" style={{ width: "100%" }} size={14}>
            {detailLoading ? (
              <Typography.Text type="secondary">Carregando detalhes…</Typography.Text>
            ) : null}
            <div>
              <Typography.Text type="secondary">Status</Typography.Text>
              <div style={{ marginTop: 4 }}>
                <Tag color={statusMeta(detail).color}>{statusMeta(detail).label}</Tag>
                {detail.review_locked ? <Tag color="success">Travado</Tag> : null}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">Descricao</Typography.Text>
              <Typography.Paragraph>{detail.description || "—"}</Typography.Paragraph>
            </div>
            <div>
              <Typography.Text type="secondary">Contato</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {[detail.contact_name, detail.contact_email, detail.contact_phone]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text type="secondary">Anexos do pedido</Typography.Text>
              {(detail.attachments ?? []).length === 0 ? (
                <Typography.Paragraph>—</Typography.Paragraph>
              ) : (
                <ul style={{ paddingLeft: 18, margin: "8px 0 0" }}>
                  {(detail.attachments ?? []).map((att) => (
                    <li key={att.id}>
                      {att.url ? (
                        <a href={att.url} target="_blank" rel="noreferrer">
                          {att.filename}
                        </a>
                      ) : (
                        att.filename
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Card size="small" title="Devolutivas da equipe">
              {(detail.feedback ?? []).length === 0 ? (
                <Typography.Text type="secondary">
                  Ainda nao ha devolutivas. Quando a equipe comentar na tarefa, aparecem aqui.
                </Typography.Text>
              ) : (
                <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                  {(detail.feedback ?? []).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        borderLeft: "3px solid #DA9330",
                        paddingLeft: 10,
                      }}
                    >
                      <Space size={8} wrap>
                        <Typography.Text strong>{item.author_name || "Equipe"}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : ""}
                        </Typography.Text>
                      </Space>
                      <Typography.Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                        {item.content_text || item.content || "—"}
                      </Typography.Paragraph>
                      {(item.attachments ?? []).length > 0 ? (
                        <ul style={{ paddingLeft: 18, margin: 0 }}>
                          {(item.attachments ?? []).map((att) => (
                            <li key={att.id}>
                              {att.url ? (
                                <a href={att.url} target="_blank" rel="noreferrer">
                                  {att.filename}
                                </a>
                              ) : (
                                att.filename
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </Space>
              )}
            </Card>

            {detail.client_revision_note ? (
              <Card size="small" title="Sua ultima solicitacao de revisao">
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {detail.client_revision_note}
                </Typography.Paragraph>
              </Card>
            ) : null}

            {detail.can_review ? (
              <Card size="small" title="Acao do cliente">
                <Typography.Paragraph type="secondary">
                  A demanda foi marcada como concluida. Revise as devolutivas e aprove ou peca ajustes.
                </Typography.Paragraph>
                <Space wrap>
                  <Button type="primary" loading={actionLoading} onClick={() => void approveRequest()}>
                    Aprovar
                  </Button>
                  <Button
                    danger
                    loading={actionLoading}
                    onClick={() => {
                      setRevisionNote("");
                      setRevisionOpen(true);
                    }}
                  >
                    Pedir revisao
                  </Button>
                </Space>
              </Card>
            ) : null}

            {detail.review_locked ? (
              <Typography.Text type="success">
                Pedido aprovado. Esta demanda nao pode mais ser alterada.
              </Typography.Text>
            ) : null}
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title="Pedir revisao"
        open={revisionOpen}
        onCancel={() => setRevisionOpen(false)}
        onOk={() => void submitRevision()}
        confirmLoading={actionLoading}
        okText="Enviar revisao"
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Explique o que ficou faltando ou errado para a equipe corrigir.
        </Typography.Paragraph>
        <Input.TextArea
          rows={5}
          value={revisionNote}
          onChange={(e) => setRevisionNote(e.target.value)}
          placeholder="Ex.: a logo ficou cortada no mobile e o texto do CTA esta desatualizado."
        />
      </Modal>

      <Modal
        title="Nova demanda"
        open={createOpen}
        onCancel={closeCreate}
        confirmLoading={submitting}
        okText="Enviar"
        cancelText="Cancelar"
        onOk={() => form.submit()}
        width={isMobile ? "100%" : 560}
        style={isMobile ? { top: 12, maxWidth: "calc(100vw - 16px)", paddingBottom: 0 } : undefined}
        styles={isMobile ? { body: { maxHeight: "70vh", overflowY: "auto" } } : undefined}
        forceRender
      >
        <Typography.Paragraph type="secondary">
          Voce pode anexar imagens, arquivos (PDF etc.) e audio (upload ou gravacao). E-mail e telefone sao
          opcionais.
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ client_name: client?.name ?? "" }}
          onFinish={async (values) => {
            if (media.recording) {
              message.warning("Pare a gravacao antes de enviar.");
              return;
            }
            setSubmitting(true);
            try {
              const body = new FormData();
              body.append("title", String(values.title ?? "").trim());
              body.append("description", String(values.description ?? "").trim());
              body.append("contact_name", String(values.contact_name ?? "").trim());
              body.append("contact_email", String(values.contact_email ?? "").trim());
              body.append("contact_phone", String(values.contact_phone ?? "").trim());
              appendPedidoFilesToFormData(body, media.fileList, media.recordedFilesRef.current);
              const response = await apiRequest<{ request: PortalRequest }>("/client-portal/requests", {
                method: "POST",
                token,
                body,
              });
              if (!response.ok) {
                message.error(response.error?.message ?? "Falha ao criar demanda.");
                return;
              }
              message.success("Demanda enviada.");
              setCreateOpen(false);
              form.resetFields();
              media.resetAttachments();
              await loadRequests(token);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Form.Item name="title" label="Titulo" rules={[{ required: true, message: "Informe o titulo." }]}>
            <Input placeholder="Resumo da demanda" />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={4} placeholder="Detalhes do que voce precisa" />
          </Form.Item>
          <Form.Item name="client_name" label="Empresa / Cliente">
            <Input disabled />
          </Form.Item>
          <Form.Item name="contact_name" label="Seu nome" rules={[{ required: true, message: "Informe seu nome." }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="contact_email"
            label="E-mail de contato"
            rules={[{ type: "email", message: "E-mail invalido." }]}
          >
            <Input type="email" />
          </Form.Item>
          <Form.Item name="contact_phone" label="Telefone">
            <Input placeholder="(11) 99999-9999" />
          </Form.Item>
          <Form.Item label="Anexos">
            <Space orientation="vertical" style={{ width: "100%" }} size={8}>
              <Upload
                multiple
                accept={PEDIDO_ACCEPT}
                fileList={media.fileList}
                beforeUpload={(file) => {
                  if (file.size > PEDIDO_MAX_FILE_BYTES) {
                    message.error(`${file.name} excede 10 MB.`);
                    return Upload.LIST_IGNORE;
                  }
                  if (media.fileList.length >= 10) {
                    message.error("No maximo 10 anexos.");
                    return Upload.LIST_IGNORE;
                  }
                  return false;
                }}
                onChange={({ fileList: next }) => media.setFileList(next.slice(0, 10))}
                onRemove={(file) => {
                  media.recordedFilesRef.current.delete(file.uid);
                  if (media.previewUrl && file.name.startsWith("gravacao-")) media.clearPreview();
                  media.setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
                }}
              >
                <Button icon={<UploadOutlined />}>Imagem ou arquivo</Button>
              </Upload>
              <Space wrap align="center">
                {!media.recording ? (
                  <Button icon={<AudioOutlined />} onClick={() => void media.startRecording()}>
                    Gravar audio
                  </Button>
                ) : (
                  <Button danger icon={<StopOutlined />} onClick={() => media.stopRecording()}>
                    Parar gravacao ({media.formatMmSs(media.recordingMs)})
                  </Button>
                )}
                <Typography.Text type="secondary">Ate 10 MB por arquivo · max. 10 anexos</Typography.Text>
              </Space>
              {media.recording ? (
                <div style={{ width: "100%" }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Nivel do microfone
                  </Typography.Text>
                  <div
                    style={{
                      marginTop: 4,
                      height: 8,
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${media.levelPct}%`,
                        background:
                          media.levelPct < 8 ? "#cf1322" : media.levelPct < 25 ? "#faad14" : "#52c41a",
                        transition: "width 80ms linear",
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {media.previewUrl ? (
                <div style={{ width: "100%" }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Preview da gravacao
                  </Typography.Text>
                  <audio
                    key={media.previewUrl}
                    controls
                    preload="auto"
                    src={media.previewUrl}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  />
                </div>
              ) : null}
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
