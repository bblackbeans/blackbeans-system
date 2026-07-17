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
  total_flagged?: number;
  ai_mode?: string;
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

type ReportItem = {
  task_id: string;
  title: string;
  status: string;
  priority: string;
  end_date?: string | null;
  days_overdue?: number;
  days_idle?: number;
  reason?: string;
  assignee_name: string;
  project_name: string;
  workspace_name?: string;
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
    total_flagged?: number;
    ai_briefing?: string;
    ai_mode?: string;
    by_project?: Array<{ project_name: string; count: number }>;
    by_assignee?: Array<{ assignee_name: string; count: number }>;
    by_reason?: Array<{ reason: string; count: number }>;
    items?: ReportItem[];
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

function reasonLabel(reason?: string) {
  if (reason === "blocked") return "Bloqueada";
  if (reason === "stale") return "Parada";
  return reason || "-";
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

  const isBlockedAgent = selected?.slug === "blocked_stale_tasks";
  const itemsTitle = isBlockedAgent
    ? `Tarefas sinalizadas (${runDetail?.report?.total_flagged ?? 0})`
    : `Tarefas atrasadas (${runDetail?.report?.total_overdue ?? 0})`;

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
            Jobs administrativos automaticos com briefing (OpenAI ou fallback). Somente leitura —
            nao alteram tarefas.
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
                        {typeof agent.last_run.total_overdue === "number" &&
                        agent.last_run.total_overdue > 0 ? (
                          <Tag color="orange">{agent.last_run.total_overdue} atrasada(s)</Tag>
                        ) : null}
                        {typeof agent.last_run.total_flagged === "number" &&
                        agent.last_run.total_flagged > 0 ? (
                          <Tag color="volcano">{agent.last_run.total_flagged} sinalizada(s)</Tag>
                        ) : null}
                        {agent.last_run.ai_mode ? (
                          <Tag>{agent.last_run.ai_mode === "openai" ? "IA" : "Fallback"}</Tag>
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
                {runDetail.report?.ai_mode ? (
                  <Tag color={runDetail.report.ai_mode === "openai" ? "purple" : "default"}>
                    Briefing: {runDetail.report.ai_mode === "openai" ? "OpenAI" : "Fallback"}
                  </Tag>
                ) : null}
                <Typography.Text type="secondary">
                  Inicio: {formatDate(runDetail.started_at)} | Fim: {formatDate(runDetail.finished_at)}
                </Typography.Text>
              </Space>
              <Typography.Paragraph>{runDetail.summary_text}</Typography.Paragraph>
              {runDetail.error_message ? (
                <Typography.Text type="danger">{runDetail.error_message}</Typography.Text>
              ) : null}
              {runDetail.report?.ai_briefing ? (
                <Card size="small" title="Analise IA">
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                    {runDetail.report.ai_briefing}
                  </Typography.Paragraph>
                </Card>
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
              {isBlockedAgent && (runDetail.report?.by_reason?.length ?? 0) > 0 ? (
                <Card size="small" title="Por motivo">
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(row) => row.reason}
                    dataSource={runDetail.report?.by_reason ?? []}
                    columns={[
                      {
                        title: "Motivo",
                        dataIndex: "reason",
                        render: (value: string) => reasonLabel(value),
                      },
                      { title: "Qtd", dataIndex: "count", width: 80 },
                    ]}
                  />
                </Card>
              ) : null}
              <Card size="small" title={itemsTitle}>
                <Table
                  size="small"
                  rowKey="task_id"
                  pagination={{ pageSize: 10 }}
                  dataSource={runDetail.report?.items ?? []}
                  columns={
                    isBlockedAgent
                      ? [
                          { title: "Tarefa", dataIndex: "title", ellipsis: true },
                          { title: "Projeto", dataIndex: "project_name", width: 160, ellipsis: true },
                          { title: "Responsavel", dataIndex: "assignee_name", width: 140, ellipsis: true },
                          {
                            title: "Motivo",
                            dataIndex: "reason",
                            width: 110,
                            render: (value: string) => reasonLabel(value),
                          },
                          { title: "Dias parada", dataIndex: "days_idle", width: 100 },
                        ]
                      : [
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
                        ]
                  }
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
