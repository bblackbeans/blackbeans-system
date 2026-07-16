"use client";

import {
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Drawer,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";

type AgentLastRun = {
  id: string;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  summary_text?: string;
  total_overdue?: number;
};

type AgentItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  schedule_hint: string;
  is_enabled: boolean;
  last_run?: AgentLastRun | null;
};

type OverdueReportItem = {
  task_id: string;
  title: string;
  status: string;
  priority: string;
  end_date?: string | null;
  days_overdue: number;
  assignee_name: string;
  project_name: string;
  workspace_name: string;
};

type AgentRunDetail = {
  id: string;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  summary_text?: string;
  error_message?: string;
  report?: {
    total_overdue?: number;
    by_project?: Array<{ project_name: string; count: number }>;
    by_assignee?: Array<{ assignee_name: string; count: number }>;
    items?: OverdueReportItem[];
  };
};

type AgentsPanelProps = {
  token: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function statusColor(status: string) {
  if (status === "success") return "success";
  if (status === "failed") return "error";
  if (status === "running") return "processing";
  return "default";
}

export function AgentsPanel({ token }: AgentsPanelProps) {
  const [msg, msgHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [runningSlug, setRunningSlug] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [selected, setSelected] = useState<AgentItem | null>(null);
  const [runDetail, setRunDetail] = useState<AgentRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest<{ agents: AgentItem[] }>("/agents", { token });
    setLoading(false);
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao carregar agentes.");
      return;
    }
    setAgents(response.data?.agents ?? []);
  }, [msg, token]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const openLastReport = async (agent: AgentItem) => {
    setSelected(agent);
    setRunDetail(null);
    if (!agent.last_run?.id) return;
    setDetailLoading(true);
    const response = await apiRequest<{ run: AgentRunDetail }>(
      `/agents/${encodeURIComponent(agent.slug)}/runs/${agent.last_run.id}`,
      { token },
    );
    setDetailLoading(false);
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao carregar relatorio.");
      return;
    }
    setRunDetail(response.data?.run ?? null);
  };

  const runNow = async (agent: AgentItem) => {
    setRunningSlug(agent.slug);
    const response = await apiRequest<{ run?: AgentRunDetail }>(
      `/agents/${encodeURIComponent(agent.slug)}/run`,
      { method: "POST", token, body: {} },
    );
    setRunningSlug(null);
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao executar agente.");
      return;
    }
    msg.success("Agente executado.");
    await fetchAgents();
    const run = response.data?.run;
    if (run) {
      setSelected(agent);
      setRunDetail(run);
    }
  };

  return (
    <>
      {msgHolder}
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Card
          title={
            <Space>
              <RobotOutlined />
              <span>Agentes autonomos</span>
            </Space>
          }
          extra={
            <Button icon={<ReloadOutlined />} onClick={() => void fetchAgents()} loading={loading}>
              Atualizar
            </Button>
          }
        >
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            Jobs administrativos automaticos. Nesta fase o agente de atrasos gera um relatorio semanal
            para admins (somente leitura — nao altera tarefas).
          </Typography.Paragraph>
          <Spin spinning={loading}>
            <Row gutter={[16, 16]}>
              {agents.map((agent) => (
                <Col xs={24} lg={12} key={agent.id}>
                  <Card
                    size="small"
                    title={agent.title}
                    extra={
                      <Tag color={agent.is_enabled ? "success" : "default"}>
                        {agent.is_enabled ? "Ativo" : "Desabilitado"}
                      </Tag>
                    }
                  >
                    <Typography.Paragraph style={{ minHeight: 48 }}>{agent.description}</Typography.Paragraph>
                    <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                      Agenda: {agent.schedule_hint || "—"}
                    </Typography.Text>
                    {agent.last_run ? (
                      <Space wrap style={{ marginBottom: 12 }}>
                        <Tag color={statusColor(agent.last_run.status)}>{agent.last_run.status}</Tag>
                        <Typography.Text type="secondary">
                          Ultima execucao: {formatDate(agent.last_run.started_at)}
                        </Typography.Text>
                        {typeof agent.last_run.total_overdue === "number" ? (
                          <Tag color="orange">{agent.last_run.total_overdue} atrasada(s)</Tag>
                        ) : null}
                      </Space>
                    ) : (
                      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                        Ainda nao houve execucao.
                      </Typography.Text>
                    )}
                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        disabled={!agent.is_enabled}
                        loading={runningSlug === agent.slug}
                        onClick={() => void runNow(agent)}
                      >
                        Rodar agora
                      </Button>
                      <Button
                        disabled={!agent.last_run}
                        onClick={() => void openLastReport(agent)}
                      >
                        Ver relatorio
                      </Button>
                    </Space>
                    {agent.last_run?.summary_text ? (
                      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                        {agent.last_run.summary_text}
                      </Typography.Paragraph>
                    ) : null}
                  </Card>
                </Col>
              ))}
              {!loading && agents.length === 0 ? (
                <Col span={24}>
                  <Typography.Text type="secondary">Nenhum agente cadastrado.</Typography.Text>
                </Col>
              ) : null}
            </Row>
          </Spin>
        </Card>
      </Space>

      <Drawer
        title={selected ? `Relatorio: ${selected.title}` : "Relatorio"}
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setRunDetail(null);
        }}
        size="large"
      >
        <Spin spinning={detailLoading}>
          {runDetail ? (
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              <Space wrap>
                <Tag color={statusColor(runDetail.status)}>{runDetail.status}</Tag>
                <Typography.Text type="secondary">
                  Inicio: {formatDate(runDetail.started_at)} | Fim: {formatDate(runDetail.finished_at)}
                </Typography.Text>
              </Space>
              <Typography.Paragraph>{runDetail.summary_text}</Typography.Paragraph>
              {runDetail.error_message ? (
                <Typography.Text type="danger">{runDetail.error_message}</Typography.Text>
              ) : null}
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Card size="small" title="Por projeto">
                    <Table
                      size="small"
                      pagination={false}
                      rowKey={(row) => row.project_name}
                      dataSource={runDetail.report?.by_project ?? []}
                      columns={[
                        { title: "Projeto", dataIndex: "project_name" },
                        { title: "Qtd", dataIndex: "count", width: 80 },
                      ]}
                    />
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="Por responsavel">
                    <Table
                      size="small"
                      pagination={false}
                      rowKey={(row) => row.assignee_name}
                      dataSource={runDetail.report?.by_assignee ?? []}
                      columns={[
                        { title: "Responsavel", dataIndex: "assignee_name" },
                        { title: "Qtd", dataIndex: "count", width: 80 },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
              <Card size="small" title={`Tarefas atrasadas (${runDetail.report?.total_overdue ?? 0})`}>
                <Table
                  size="small"
                  rowKey="task_id"
                  pagination={{ pageSize: 10 }}
                  dataSource={runDetail.report?.items ?? []}
                  columns={[
                    { title: "Tarefa", dataIndex: "title", ellipsis: true },
                    { title: "Projeto", dataIndex: "project_name", width: 160, ellipsis: true },
                    { title: "Responsavel", dataIndex: "assignee_name", width: 140, ellipsis: true },
                    {
                      title: "Prazo",
                      dataIndex: "end_date",
                      width: 150,
                      render: (value: string | null) => formatDate(value),
                    },
                    { title: "Dias", dataIndex: "days_overdue", width: 70 },
                  ]}
                />
              </Card>
            </Space>
          ) : (
            <Typography.Text type="secondary">Sem dados de execucao para exibir.</Typography.Text>
          )}
        </Spin>
      </Drawer>
    </>
  );
}
