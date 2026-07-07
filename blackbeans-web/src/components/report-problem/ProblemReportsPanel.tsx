"use client";

import {
  ArrowLeftOutlined,
  CameraOutlined,
  DeleteOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageLightbox } from "@/components/report-problem/ImageLightbox";
import { apiRequest } from "@/lib/api";

type ProblemReportListItem = {
  id: string;
  titulo: string;
  descricao: string;
  passos: string;
  status: string;
  url: string;
  correlation_id: string;
  has_screenshot: boolean;
  has_recording: boolean;
  usuario_nome?: string | null;
  usuario_email?: string | null;
  workspace_nome?: string | null;
  criado_em?: string | null;
  contexto_json?: Record<string, unknown>;
};

type ProblemReportDetail = ProblemReportListItem & {
  notas_internas?: string;
  contexto_json: Record<string, unknown>;
};

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_analise", label: "Em analise" },
  { value: "resolvido", label: "Resolvido" },
  { value: "descartado", label: "Descartado" },
];

const STATUS_COLORS: Record<string, string> = {
  novo: "blue",
  em_analise: "gold",
  resolvido: "green",
  descartado: "default",
};

type ProblemReportsPanelProps = {
  token: string;
};

export function ProblemReportsPanel({ token }: ProblemReportsPanelProps) {
  const [msg, msgHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const fetchSeqRef = useRef(0);
  const [items, setItems] = useState<ProblemReportListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProblemReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState("novo");
  const [notesDraft, setNotesDraft] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const response = await apiRequest<{
        problem_reports: ProblemReportListItem[];
      }>(`/problem-reports?${params.toString()}`, { token });

      if (seq !== fetchSeqRef.current) return;

      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao carregar problemas.");
        return;
      }

      setItems(response.data?.problem_reports ?? []);
      setTotal(Number(response.meta?.total ?? 0));
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [msg, page, search, statusFilter, token]);

  const fetchDetail = useCallback(
    async (reportId: string) => {
      setDetailLoading(true);
      try {
        const response = await apiRequest<{ problem_report: ProblemReportDetail }>(
          `/problem-reports/${reportId}`,
          { token },
        );
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao carregar detalhe.");
          return;
        }
        const row = response.data?.problem_report ?? null;
        setDetail(row);
        if (row) {
          setStatusDraft(row.status);
          setNotesDraft(row.notas_internas ?? "");
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [msg, token],
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void fetchDetail(selectedId);
  }, [fetchDetail, selectedId]);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const response = await apiRequest<{ problem_report: ProblemReportDetail }>(
        `/problem-reports/${selectedId}`,
        {
          method: "PATCH",
          token,
          body: {
            status: statusDraft,
            notas_internas: notesDraft,
          },
        },
      );
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao salvar.");
        return;
      }
      msg.success("Reporte atualizado.");
      setDetail(response.data?.problem_report ?? null);
      await fetchList();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (reportId: string, title: string) => {
    Modal.confirm({
      title: "Excluir este reporte?",
      content: `O reporte "${title}" sera removido permanentemente.`,
      okText: "Excluir",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        const response = await apiRequest(`/problem-reports/${reportId}`, {
          method: "DELETE",
          token,
        });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao excluir.");
          throw new Error("delete_failed");
        }
        msg.success("Reporte excluido.");
        if (selectedId === reportId) setSelectedId(null);
        await fetchList();
      },
    });
  };

  const screenshotData =
    detail?.contexto_json?.screenshot &&
    typeof detail.contexto_json.screenshot === "object" &&
    detail.contexto_json.screenshot !== null &&
    "data" in (detail.contexto_json.screenshot as Record<string, unknown>)
      ? String((detail.contexto_json.screenshot as { data?: string }).data ?? "")
      : "";

  const recordingData =
    detail?.contexto_json?.screen_recording &&
    typeof detail.contexto_json.screen_recording === "object" &&
    detail.contexto_json.screen_recording !== null &&
    "data" in (detail.contexto_json.screen_recording as Record<string, unknown>)
      ? String((detail.contexto_json.screen_recording as { data?: string }).data ?? "")
      : "";

  const jsErrors = Array.isArray(detail?.contexto_json?.js_errors)
    ? (detail?.contexto_json?.js_errors as unknown[])
    : [];
  const failedRequests = Array.isArray(detail?.contexto_json?.failed_requests)
    ? (detail?.contexto_json?.failed_requests as unknown[])
    : [];

  if (selectedId) {
    return (
      <>
        {msgHolder}
        <Spin spinning={detailLoading}>
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Button
              type="link"
              icon={<ArrowLeftOutlined />}
              style={{ paddingLeft: 0 }}
              onClick={() => setSelectedId(null)}
            >
              Voltar aos problemas
            </Button>

            {detail ? (
              <>
                <div>
                  <Typography.Title level={3} style={{ marginBottom: 4 }}>
                    {detail.titulo}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {detail.criado_em ? new Date(detail.criado_em).toLocaleString("pt-BR") : "-"}{" "}
                    {detail.workspace_nome ? `· ${detail.workspace_nome}` : ""}{" "}
                    {detail.usuario_nome || detail.usuario_email
                      ? `· ${detail.usuario_nome || detail.usuario_email}`
                      : ""}
                  </Typography.Text>
                </div>

                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={16}>
                    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                      <Card title="Descricao" size="small">
                        <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                          {detail.descricao}
                        </Typography.Paragraph>
                      </Card>

                      {detail.passos ? (
                        <Card title="Passos para reproduzir" size="small">
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {detail.passos}
                          </Typography.Paragraph>
                        </Card>
                      ) : null}

                      {detail.url ? (
                        <Card title="URL" size="small">
                          <Typography.Text copyable>{detail.url}</Typography.Text>
                        </Card>
                      ) : null}

                      {screenshotData ? (
                        <Card title="Screenshot" size="small">
                          <img
                            src={screenshotData}
                            alt="Screenshot do reporte"
                            style={{
                              width: "100%",
                              maxHeight: 420,
                              objectFit: "contain",
                              borderRadius: 8,
                              cursor: "pointer",
                              border: "1px solid #f0f0f0",
                            }}
                            onClick={() => setLightboxSrc(screenshotData)}
                          />
                        </Card>
                      ) : null}

                      {recordingData ? (
                        <Card
                          title={`Gravacao de tela (${Math.round(
                            Number(
                              (detail.contexto_json.screen_recording as { duration_ms?: number })
                                ?.duration_ms ?? 0,
                            ) / 1000,
                          )}s)`}
                          size="small"
                        >
                          <video
                            controls
                            src={recordingData}
                            style={{ width: "100%", borderRadius: 8, background: "#000" }}
                          />
                        </Card>
                      ) : null}

                      <Card title="Contexto tecnico" size="small">
                        <Typography.Text strong>Erros JavaScript</Typography.Text>
                        <pre style={{ fontSize: 12, marginTop: 8, marginBottom: 16 }}>
                          {jsErrors.length ? JSON.stringify(jsErrors, null, 2) : "Nenhum registro"}
                        </pre>
                        <Typography.Text strong>Requisicoes com falha</Typography.Text>
                        <pre style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                          {failedRequests.length
                            ? JSON.stringify(failedRequests, null, 2)
                            : "Nenhum registro"}
                        </pre>
                      </Card>
                    </Space>
                  </Col>

                  <Col xs={24} lg={8}>
                    <Card title="Triagem" size="small">
                      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                        <div style={{ width: "100%" }}>
                          <Typography.Text type="secondary">Status</Typography.Text>
                          <Select
                            value={statusDraft}
                            onChange={setStatusDraft}
                            style={{ width: "100%", marginTop: 4 }}
                            options={STATUS_OPTIONS}
                          />
                        </div>
                        <div style={{ width: "100%" }}>
                          <Typography.Text type="secondary">Notas internas</Typography.Text>
                          <Input.TextArea
                            rows={5}
                            maxLength={8000}
                            value={notesDraft}
                            onChange={(event) => setNotesDraft(event.target.value)}
                            placeholder="Anotacoes visiveis so para administradores"
                            style={{ marginTop: 4 }}
                          />
                        </div>
                        <Button type="primary" block loading={saving} onClick={() => void handleSave()}>
                          Salvar
                        </Button>
                        <Button danger block onClick={() => handleDelete(detail.id, detail.titulo)}>
                          Excluir problema
                        </Button>
                      </Space>
                    </Card>
                  </Col>
                </Row>
              </>
            ) : null}
          </Space>
        </Spin>
        {lightboxSrc ? <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} /> : null}
      </>
    );
  }

  return (
    <>
      {msgHolder}
      <Card
        title="Problemas reportados"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void fetchList()} loading={loading}>
            Atualizar
          </Button>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            style={{ minWidth: 180 }}
            options={[{ value: "all", label: "Todos os status" }, ...STATUS_OPTIONS]}
          />
          <Input.Search
            allowClear
            placeholder="Buscar por titulo"
            style={{ width: 280 }}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        </Space>

        <Table<ProblemReportListItem>
          rowKey="id"
          loading={loading}
          dataSource={items}
          locale={{ emptyText: "Nenhum problema reportado." }}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: (nextPage) => setPage(nextPage),
          }}
          onRow={(record) => ({
            onClick: () => setSelectedId(record.id),
            style: { cursor: "pointer" },
          })}
          columns={[
            {
              title: "Data",
              dataIndex: "criado_em",
              render: (value: string | null) =>
                value ? new Date(value).toLocaleString("pt-BR") : "-",
            },
            {
              title: "Usuario",
              render: (row) => row.usuario_nome || row.usuario_email || "-",
            },
            {
              title: "Workspace",
              dataIndex: "workspace_nome",
              render: (value: string | null) => value || "-",
            },
            { title: "Titulo", dataIndex: "titulo", ellipsis: true },
            {
              title: "Status",
              dataIndex: "status",
              render: (value: string) => (
                <Tag color={STATUS_COLORS[value] ?? "default"}>{value}</Tag>
              ),
            },
            {
              title: "Midia",
              render: (row) => (
                <Space>
                  {row.has_screenshot ? <CameraOutlined title="Screenshot" /> : null}
                  {row.has_recording ? <VideoCameraOutlined title="Gravacao" /> : null}
                </Space>
              ),
            },
            {
              title: "Acoes",
              render: (row) => (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(row.id, row.titulo);
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
