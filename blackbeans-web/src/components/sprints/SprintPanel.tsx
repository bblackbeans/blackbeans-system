"use client";

import { FolderOutlined, LockOutlined, ReloadOutlined, ThunderboltOutlined, UnlockOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api";

type SprintWeek = {
  id: string;
  week_start: string;
  week_end: string;
  label: string;
  locked_at?: string | null;
  is_locked: boolean;
  items_count?: number | null;
  items?: SprintItem[];
};

type SprintItem = {
  id: string;
  task_id: string | null;
  assignee_id: number | null;
  assignee_name: string;
  assignee_role?: "admin" | "collaborator";
  assignee_role_label?: string;
  title: string;
  status: string;
  status_label?: string;
  status_color?: string;
  priority?: string;
  start_date?: string | null;
  end_date?: string | null;
  effort_points: number;
  hours_logged: string;
  is_recurring?: boolean;
  always_in_sprint?: boolean;
  project_name: string;
  client_name?: string;
};

type PersonGroup = {
  key: string;
  name: string;
  roleLabel: string;
  items: SprintItem[];
};

type SprintPanelProps = {
  token: string;
  isAdmin: boolean;
};

const PRIORITY_META: Record<string, { label: "Baixa" | "Média" | "Alta" | "Crítica"; color: string }> = {
  low: { label: "Baixa", color: "blue" },
  medium: { label: "Média", color: "gold" },
  high: { label: "Alta", color: "volcano" },
  critical: { label: "Crítica", color: "red" },
};

const STATUS_COLOR_FALLBACK: Record<string, string> = {
  todo: "geekblue",
  in_progress: "blue",
  blocked: "volcano",
  done: "green",
};

function formatLoggedHours(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value || "—");
  const totalMin = Math.round(n * 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0 && minutes === 0) return "0h";
  if (minutes === 0) return `${hours}h`;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function roleLabelFor(item: SprintItem): string {
  if (item.assignee_role_label) return item.assignee_role_label;
  return item.assignee_role === "admin" ? "Admin" : "Colaborador";
}

function personTitle(item: SprintItem): string {
  const name = item.assignee_name || "Sem responsavel";
  return `${name} (${roleLabelFor(item)})`;
}

function sumHours(items: SprintItem[]): { planned: number; logged: number } {
  return items.reduce(
    (acc, item) => ({
      planned: acc.planned + Number(item.effort_points || 0),
      logged: acc.logged + Number(item.hours_logged || 0),
    }),
    { planned: 0, logged: 0 },
  );
}

function totalsLabel(items: SprintItem[]): string {
  const { planned, logged } = sumHours(items);
  const n = items.length;
  return `${n} tarefa${n === 1 ? "" : "s"} · ${formatLoggedHours(planned)} previstas · ${formatLoggedHours(logged)} apontadas`;
}

function renderPriorityTag(value?: string) {
  if (!value) return <Typography.Text type="secondary">—</Typography.Text>;
  const meta = PRIORITY_META[value] ?? { label: value, color: "default" };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function renderStatusTag(item: SprintItem) {
  const label = item.status_label || item.status || "—";
  const color = item.status_color || STATUS_COLOR_FALLBACK[item.status] || "default";
  return <Tag color={color}>{label}</Tag>;
}

export function SprintPanel({ token, isAdmin }: SprintPanelProps) {
  const [msg, msgHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [weeks, setWeeks] = useState<SprintWeek[]>([]);
  const [current, setCurrent] = useState<{ week_start: string; week_end: string; label: string; exists: boolean } | null>(
    null,
  );
  const [selected, setSelected] = useState<SprintWeek | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);

  const fetchWeeks = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest<{
      weeks: SprintWeek[];
      current_week: { week_start: string; week_end: string; label: string; exists: boolean };
    }>("/sprints", { token });
    setLoading(false);
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao carregar sprints.");
      return;
    }
    setWeeks(response.data?.weeks ?? []);
    setCurrent(response.data?.current_week ?? null);
  }, [msg, token]);

  useEffect(() => {
    void fetchWeeks();
  }, [fetchWeeks]);

  const openWeek = async (weekId: string) => {
    const response = await apiRequest<{ week: SprintWeek }>(`/sprints/${weekId}`, { token });
    if (!response.ok || !response.data?.week) {
      msg.error(response.error?.message ?? "Falha ao abrir a sprint.");
      return;
    }
    setSelected(response.data.week);
    setAssigneeFilter([]);
  };

  const generate = async (weekStart?: string) => {
    setGenerating(true);
    const response = await apiRequest<{ week: SprintWeek; generated: number }>("/sprints/generate", {
      method: "POST",
      token,
      body: weekStart ? { week_start: weekStart } : {},
    });
    setGenerating(false);
    if (!response.ok || !response.data?.week) {
      msg.error(response.error?.message ?? "Falha ao gerar a sprint.");
      return;
    }
    msg.success(`${response.data.generated} tarefa(s) na lista da semana.`);
    await fetchWeeks();
    setSelected(response.data.week);
    setAssigneeFilter([]);
  };

  const lockWeek = async () => {
    if (!selected) return;
    const response = await apiRequest<{ week: SprintWeek }>(`/sprints/${selected.id}/lock`, {
      method: "POST",
      token,
      body: {},
    });
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao travar a sprint.");
      return;
    }
    msg.success("Sprint travada. A pasta nao reflete mais mudancas futuras.");
    setSelected((prev) => (prev ? { ...prev, is_locked: true, locked_at: new Date().toISOString() } : prev));
    await fetchWeeks();
  };

  const unlockWeek = async () => {
    if (!selected) return;
    const response = await apiRequest<{ week: SprintWeek }>(`/sprints/${selected.id}/unlock`, {
      method: "POST",
      token,
      body: {},
    });
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao destravar a sprint.");
      return;
    }
    msg.success("Sprint destravada. Pode ajustar datas e gerar a lista de novo.");
    setSelected((prev) => (prev ? { ...prev, is_locked: false, locked_at: null } : prev));
    await fetchWeeks();
  };

  const changeItemDate = async (item: SprintItem, field: "start_date" | "end_date", value: string | null) => {
    if (!selected) return;
    const response = await apiRequest<{ moved_out?: boolean; item: SprintItem | null }>(
      `/sprints/${selected.id}/items/${item.id}`,
      { method: "PATCH", token, body: { [field]: value } },
    );
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao alterar a data.");
      return;
    }
    if (response.data?.moved_out) {
      msg.info("Data fora desta semana: a tarefa saiu desta pasta.");
      setSelected((prev) =>
        prev ? { ...prev, items: (prev.items ?? []).filter((row) => row.id !== item.id) } : prev,
      );
      return;
    }
    if (response.data?.item) {
      const updated = response.data.item;
      setSelected((prev) =>
        prev
          ? { ...prev, items: (prev.items ?? []).map((row) => (row.id === item.id ? updated : row)) }
          : prev,
      );
    }
  };

  const assigneeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of selected?.items ?? []) {
      const value = item.assignee_id != null ? String(item.assignee_id) : "unassigned";
      if (seen.has(value)) continue;
      seen.set(value, personTitle(item));
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [selected]);

  const grouped = useMemo((): PersonGroup[] => {
    const items = selected?.items ?? [];
    const allowed = new Set(assigneeFilter);
    const map = new Map<string, PersonGroup>();
    items.forEach((item) => {
      const key = item.assignee_id != null ? String(item.assignee_id) : "unassigned";
      if (allowed.size > 0 && !allowed.has(key)) return;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        return;
      }
      map.set(key, {
        key,
        name: item.assignee_name || "Sem responsavel",
        roleLabel: roleLabelFor(item),
        items: [item],
      });
    });
    return Array.from(map.values());
  }, [assigneeFilter, selected]);

  const weekTotals = useMemo(() => {
    const items = grouped.flatMap((group) => group.items);
    const { planned, logged } = sumHours(items);
    const people = grouped.length;
    const avgPlanned = people > 0 ? planned / people : 0;
    return { items: items.length, planned, logged, people, avgPlanned };
  }, [grouped]);

  const canEditDates = Boolean(isAdmin && selected && !selected.is_locked);

  const renderDateCell = (item: SprintItem, field: "start_date" | "end_date") => {
    const raw = item[field];
    if (canEditDates) {
      return (
        <DatePicker
          format="DD/MM/YYYY"
          value={raw ? dayjs(raw) : null}
          onChange={(value) => void changeItemDate(item, field, value ? value.format("YYYY-MM-DD") : null)}
        />
      );
    }
    return raw ? dayjs(raw).format("DD/MM/YYYY") : "—";
  };

  const columns: ColumnsType<SprintItem> = [
    {
      title: "Tarefa",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      width: 280,
      render: (title: string, item) => (
        <Space size={6} wrap={false}>
          <Typography.Text ellipsis={{ tooltip: title }}>{title}</Typography.Text>
          {item.is_recurring ? <Tag color="purple">Recorrente</Tag> : null}
          {item.always_in_sprint ? <Tag color="cyan">Na sprint</Tag> : null}
        </Space>
      ),
    },
    { title: "Projeto", dataIndex: "project_name", key: "project_name", ellipsis: true, width: 160 },
    {
      title: "Cliente",
      dataIndex: "client_name",
      key: "client_name",
      ellipsis: true,
      width: 150,
      render: (value: string | undefined) => value || "—",
    },
    {
      title: "Prioridade",
      dataIndex: "priority",
      key: "priority",
      width: 110,
      render: (value: string | undefined) => renderPriorityTag(value),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (_: string, item) => renderStatusTag(item),
    },
    {
      title: "Inicio",
      key: "start_date",
      width: 150,
      render: (_, item) => renderDateCell(item, "start_date"),
    },
    {
      title: "Fim",
      key: "end_date",
      width: 150,
      render: (_, item) => renderDateCell(item, "end_date"),
    },
    {
      title: "Tempo",
      dataIndex: "hours_logged",
      key: "hours_logged",
      width: 90,
      render: (value: string) => formatLoggedHours(value),
    },
  ];

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      {msgHolder}
      <Card
        title="Sprint"
        extra={
          <Space>
            {isAdmin ? (
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={generating}
                onClick={() => void generate(current?.week_start)}
              >
                Gerar lista da semana
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={() => void fetchWeeks()}>
              Atualizar
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          Pastas de segunda a sexta. <strong>Travar sprint</strong> congela esta pasta: vira a ata da reuniao.
          Depois disso, mudar a tarefa no projeto (data, status, etc.) nao altera mais esta lista.
        </Typography.Paragraph>
        {weeks.length === 0 && !loading ? (
          <Empty description={current ? `Semana atual: ${current.label}` : "Nenhuma sprint gerada."} />
        ) : (
          <Row gutter={[12, 12]}>
            {weeks.map((week) => (
              <Col xs={24} sm={12} md={8} lg={6} key={week.id}>
                <Card
                  hoverable
                  loading={loading}
                  onClick={() => void openWeek(week.id)}
                  styles={{ body: { minHeight: 96 } }}
                >
                  <Space>
                    <FolderOutlined />
                    <Typography.Text strong>{week.label}</Typography.Text>
                  </Space>
                  <div>
                    {week.is_locked ? <Tag color="red">Travada</Tag> : <Tag color="blue">Aberta</Tag>}
                    <Typography.Text type="secondary"> {week.items_count ?? 0} itens</Typography.Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>
      {selected ? (
        <Card
          title={`Sprint ${selected.label}`}
          extra={
            <Space>
              {selected.is_locked ? <Tag color="red">Travada</Tag> : <Tag color="blue">Aberta</Tag>}
              {isAdmin && !selected.is_locked ? (
                <Tooltip title="Congela a lista desta semana. Ajustes feitos depois no projeto nao entram mais nesta pasta.">
                  <Button icon={<LockOutlined />} onClick={() => void lockWeek()}>
                    Travar sprint
                  </Button>
                </Tooltip>
              ) : null}
              {isAdmin && selected.is_locked ? (
                <Tooltip title="Reabre a pasta para ajustar datas ou gerar a lista de novo. O snapshot atual permanece ate voce gerar de novo.">
                  <Button icon={<UnlockOutlined />} onClick={() => void unlockWeek()}>
                    Destravar sprint
                  </Button>
                </Tooltip>
              ) : null}
            </Space>
          }
        >
          {(selected.items?.length ?? 0) > 0 ? (
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              maxTagCount="responsive"
              placeholder="Filtrar colaboradores"
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={assigneeOptions}
              style={{ minWidth: 240, maxWidth: 420, marginBottom: 12 }}
            />
          ) : null}
          {grouped.length > 0 ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {weekTotals.items} tarefa{weekTotals.items === 1 ? "" : "s"} ·{" "}
              {formatLoggedHours(weekTotals.planned)} previstas · {formatLoggedHours(weekTotals.logged)} apontadas
              {weekTotals.people > 0
                ? ` · média ${formatLoggedHours(weekTotals.avgPlanned)} previstas / pessoa`
                : ""}
            </Typography.Paragraph>
          ) : null}
          {grouped.length === 0 ? (
            <Empty
              description={
                assigneeFilter.length > 0
                  ? "Nenhuma tarefa para os colaboradores selecionados."
                  : "Nenhuma tarefa nesta pasta."
              }
            />
          ) : (
            grouped.map((group) => (
              <Card
                key={group.key}
                size="small"
                title={`${group.name} (${group.roleLabel})`}
                extra={<Typography.Text type="secondary">{totalsLabel(group.items)}</Typography.Text>}
                style={{ marginBottom: 12 }}
              >
                <Table
                  rowKey="id"
                  size="small"
                  className="bb-compact-table"
                  scroll={{ x: 1180 }}
                  pagination={false}
                  columns={columns}
                  dataSource={group.items}
                />
              </Card>
            ))
          )}
        </Card>
      ) : null}
    </Space>
  );
}
