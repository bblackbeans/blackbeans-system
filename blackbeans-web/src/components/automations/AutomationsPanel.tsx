"use client";

import {
  CopyOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api";

type ConfigSpec = {
  key: string;
  type: string;
  label?: string;
  required?: boolean;
  choices?: string[];
};
type Step = { type: string; label: string; config: ConfigSpec[] };
type Condition = { field: string; op: string; value?: string };
type ActionItem = { type: string; config: Record<string, unknown> };
type Recipe = {
  key: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Condition[];
  actions: ActionItem[];
};
type Catalog = {
  triggers: Step[];
  actions: Step[];
  condition_fields: string[];
  condition_ops: string[];
  recipes: Recipe[];
  template_variables: string[];
  users: { id: number; name: string }[];
  target_groups: { id: string; workspace_id: string; label: string }[];
  statuses: { key: string; label: string }[];
};
type Automation = {
  id: string;
  workspace_id: string;
  board_id: string | null;
  name: string;
  description: string;
  is_enabled: boolean;
  importance: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Condition[];
  actions: ActionItem[];
  run_count: number;
  last_run_at: string | null;
};
type RunItem = {
  id: string;
  automation_name: string;
  task_title: string | null;
  status: string;
  trigger_type: string;
  actions_log: { type: string; ok: boolean; detail: string }[];
  error_message: string;
  is_dry_run: boolean;
  duration_ms: number;
  created_at: string;
};
type Workspace = { id: string; name: string };
type BoardItem = { id: string; name: string; project_name: string; workspace_id: string };
type Group = { id: string; name: string };

const PRIORITIES = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Critica" },
];
const OP_LABELS: Record<string, string> = {
  eq: "e igual a",
  neq: "e diferente de",
  in: "esta em (separe por virgula)",
  not_in: "nao esta em",
  contains: "contem",
  is_empty: "esta vazio",
  not_empty: "nao esta vazio",
  gt: "maior que",
  lt: "menor que",
};
const IMPORTANCES = [
  { value: "critical", label: "Critica", color: "red" },
  { value: "high", label: "Alta", color: "orange" },
  { value: "normal", label: "Normal", color: "blue" },
  { value: "low", label: "Pequena", color: "default" },
];
const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  priority: "Prioridade",
  assignee_id: "Responsavel",
  group_id: "Grupo",
  board_id: "Quadro",
  parent_id: "Tarefa pai (vazio = tarefa principal)",
  title: "Titulo",
  effort_points: "Pontos de esforco",
  end_date: "Prazo final",
};
const CHOICE_LABELS: Record<string, string> = {
  end_date: "Prazo final",
  start_date: "Data de inicio",
  days: "dias",
  weeks: "semanas",
  months: "meses",
  daily: "Todo dia",
  weekly: "Toda semana",
  monthly: "Todo mes",
};
const NO_VALUE_OPS = new Set(["is_empty", "not_empty"]);

const emptyDraft = () => ({
  name: "",
  importance: "normal",
  workspace_id: "",
  board_id: undefined as string | undefined,
  trigger_type: "task.status_changed",
  trigger_config: {} as Record<string, unknown>,
  conditions: [] as Condition[],
  actions: [{ type: "set_status", config: {} }] as ActionItem[],
});
type Draft = ReturnType<typeof emptyDraft>;

export function AutomationsPanel({ token }: { token: string }) {
  const [msg, msgHolder] = message.useMessage();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [groupsByBoard, setGroupsByBoard] = useState<Record<string, Group[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<RunItem[] | null>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [testing, setTesting] = useState<Automation | null>(null);
  const [testTaskRef, setTestTaskRef] = useState("");
  const [testDryRun, setTestDryRun] = useState(true);
  const [testResult, setTestResult] = useState<RunItem | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cat, list, ws, bd] = await Promise.all([
      apiRequest<Catalog>("/automations/catalog", { token }),
      apiRequest<{ automations: Automation[] }>("/automations", { token }),
      apiRequest<{ workspaces: Workspace[] }>("/workspaces", { token }),
      apiRequest<{ boards: BoardItem[] }>("/boards", { token }),
    ]);
    setLoading(false);
    if (!cat.ok || !list.ok) {
      msg.error(cat.error?.message ?? list.error?.message ?? "Falha ao carregar automacoes.");
      return;
    }
    setCatalog(cat.data ?? null);
    setAutomations(list.data?.automations ?? []);
    setWorkspaces(ws.data?.workspaces ?? []);
    setBoards(bd.data?.boards ?? []);
  }, [msg, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const boardId = draft?.board_id;
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    void apiRequest<{ groups: Group[] }>(`/boards/${boardId}/groups`, { token }).then((r) => {
      if (!cancelled) setGroupsByBoard((prev) => ({ ...prev, [boardId]: r.data?.groups ?? [] }));
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, token]);

  const groups = boardId ? (groupsByBoard[boardId] ?? []) : [];
  const triggerLabel = useMemo(
    () => Object.fromEntries((catalog?.triggers ?? []).map((t) => [t.type, t.label])),
    [catalog],
  );
  const actionLabel = useMemo(
    () => Object.fromEntries((catalog?.actions ?? []).map((a) => [a.type, a.label])),
    [catalog],
  );

  const openNew = (recipe?: Recipe) => {
    setEditingId(null);
    setDraft({
      ...emptyDraft(),
      workspace_id: workspaces[0]?.id ?? "",
      ...(recipe
        ? {
            name: recipe.name,
            importance: "normal",
            trigger_type: recipe.trigger_type,
            trigger_config: { ...recipe.trigger_config },
            conditions: recipe.conditions.map((c) => ({ ...c })),
            actions: recipe.actions.map((a) => ({ type: a.type, config: { ...a.config } })),
          }
        : {}),
    });
    setRecipesOpen(false);
  };

  const openEdit = (a: Automation) => {
    setEditingId(a.id);
    setDraft({
      name: a.name,
      importance: a.importance ?? "normal",
      workspace_id: a.workspace_id,
      board_id: a.board_id ?? undefined,
      trigger_type: a.trigger_type,
      trigger_config: { ...a.trigger_config },
      conditions: a.conditions.map((c) => ({ ...c })),
      actions: a.actions.map((x) => ({ type: x.type, config: { ...x.config } })),
    });
  };

  const duplicate = (a: Automation) => {
    setEditingId(null);
    setDraft({
      name: `Copia de ${a.name}`,
      importance: a.importance ?? "normal",
      workspace_id: a.workspace_id,
      board_id: a.board_id ?? undefined,
      trigger_type: a.trigger_type,
      trigger_config: { ...a.trigger_config },
      conditions: a.conditions.map((c) => ({ ...c })),
      actions: a.actions.map((x) => ({ type: x.type, config: { ...x.config } })),
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const body = {
      ...draft,
      board_id: draft.board_id ?? null,
      conditions: draft.conditions.map((c) =>
        c.op === "in" || c.op === "not_in"
          ? { ...c, value: String(c.value ?? "").split(",").map((s) => s.trim()).filter(Boolean) }
          : c,
      ),
    };
    const response = editingId
      ? await apiRequest(`/automations/${editingId}`, { method: "PATCH", token, body })
      : await apiRequest("/automations", { method: "POST", token, body });
    setSaving(false);
    if (!response.ok) {
      const details = response.error?.details;
      const detail = details && typeof details === "object" ? Object.values(details).flat().join(" ") : "";
      msg.error(`${response.error?.message ?? "Falha ao salvar."} ${detail}`.trim());
      return;
    }
    msg.success("Automacao salva.");
    setDraft(null);
    void load();
  };

  const toggle = async (a: Automation, enabled: boolean) => {
    const r = await apiRequest(`/automations/${a.id}`, { method: "PATCH", token, body: { is_enabled: enabled } });
    if (!r.ok) msg.error(r.error?.message ?? "Falha ao atualizar.");
    void load();
  };

  const remove = async (a: Automation) => {
    const r = await apiRequest(`/automations/${a.id}`, { method: "DELETE", token });
    if (!r.ok) msg.error(r.error?.message ?? "Falha ao excluir.");
    void load();
  };

  const runTest = async () => {
    if (!testing) return;
    // Aceita o UUID puro ou o link copiado do sistema (".../#task/<uuid>").
    const match = testTaskRef.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (!match) {
      msg.warning("Cole o link da tarefa (botao Copiar link) ou o ID dela.");
      return;
    }
    setTestRunning(true);
    const r = await apiRequest<{ run: RunItem }>(`/automations/${testing.id}/run`, {
      method: "POST",
      token,
      body: { task_id: match[0], dry_run: testDryRun },
    });
    setTestRunning(false);
    if (!r.ok) {
      msg.error(r.error?.message ?? "Falha ao executar.");
      return;
    }
    setTestResult(r.data?.run ?? null);
    void load();
  };

  const openRuns = async (a?: Automation) => {
    const r = await apiRequest<{ runs: RunItem[] }>(a ? `/automations/${a.id}/runs` : "/automations/runs", { token });
    if (!r.ok) {
      msg.error(r.error?.message ?? "Falha ao carregar historico.");
      return;
    }
    setRuns(r.data?.runs ?? []);
  };

  const renderConfig = (
    specs: ConfigSpec[],
    value: Record<string, unknown>,
    onChange: (next: Record<string, unknown>) => void,
  ) =>
    specs.map((spec) => {
      const set = (v: unknown) => onChange({ ...value, [spec.key]: v });
      const common = { variant: "underlined" as const, style: { minWidth: 180 }, placeholder: spec.label ?? spec.key };
      const current = value[spec.key];
      switch (spec.type) {
        case "status":
          return (
            <Select key={spec.key} {...common} allowClear value={current as string | undefined} onChange={set}
              options={(catalog?.statuses ?? []).map((s) => ({ value: s.key, label: s.label }))} />
          );
        case "priority":
          return <Select key={spec.key} {...common} allowClear value={current as string | undefined} onChange={set} options={PRIORITIES} />;
        case "user":
          return (
            <Select key={spec.key} {...common} allowClear showSearch optionFilterProp="label" value={current as number | undefined} onChange={set}
              options={(catalog?.users ?? []).map((u) => ({ value: u.id, label: u.name }))} />
          );
        case "group":
          return (
            <Select key={spec.key} {...common} allowClear value={current as string | undefined} onChange={set}
              notFoundContent="Escolha um quadro para listar grupos"
              options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          );
        case "any_group":
          return (
            <Select key={spec.key} {...common} allowClear showSearch optionFilterProp="label" style={{ minWidth: 280 }}
              value={current as string | undefined} onChange={set}
              options={(catalog?.target_groups ?? [])
                .filter((g) => g.workspace_id === draft?.workspace_id)
                .map((g) => ({ value: g.id, label: g.label }))} />
          );
        case "number":
          return <InputNumber key={spec.key} {...common} value={current as number | undefined} onChange={(v) => set(v ?? undefined)} />;
        case "boolean":
          return <Switch key={spec.key} checked={Boolean(current)} onChange={set} checkedChildren={spec.label} unCheckedChildren={spec.label} />;
        case "choice":
          return (
            <Select key={spec.key} {...common} value={current as string | undefined} onChange={set}
              options={(spec.choices ?? []).map((c) => ({ value: c, label: CHOICE_LABELS[c] ?? c }))} />
          );
        case "recipients":
          return (
            <Select key={spec.key} {...common} mode="multiple" value={(current as (string | number)[]) ?? []} onChange={set}
              options={[
                { value: "assignee", label: "Responsavel da tarefa" },
                { value: "owner", label: "Criador da automacao" },
                ...(catalog?.users ?? []).map((u) => ({ value: u.id, label: u.name })),
              ]} />
          );
        default:
          return <Input.TextArea key={spec.key} {...common} rows={2} style={{ minWidth: 260 }} value={(current as string) ?? ""} onChange={(e) => set(e.target.value)} />;
      }
    });

  const triggerSpecs = catalog?.triggers.find((t) => t.type === draft?.trigger_type)?.config ?? [];
  const workspaceBoards = boards.filter((b) => b.workspace_id === draft?.workspace_id);

  return (
    <div>
      {msgHolder}
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <ThunderboltOutlined /> Automacoes
        </Typography.Title>
        <Space wrap>
          <Button icon={<HistoryOutlined />} onClick={() => void openRuns()}>Historico geral</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openNew()}>Nova automacao</Button>
        </Space>
      </Space>

      <Tabs
        defaultActiveKey="manage"
        items={[
          {
            key: "manage",
            label: `Gerir (${automations.length})`,
            children: (
      <Table<Automation>
        rowKey="id"
        loading={loading}
        dataSource={automations}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          { title: "Nome", dataIndex: "name", render: (v, a) => <a onClick={() => openEdit(a)}>{v}</a> },
          {
            title: "Receita",
            render: (_, a) => (
              <span>
                {triggerLabel[a.trigger_type] ?? a.trigger_type} <b>→</b>{" "}
                {a.actions.map((x) => actionLabel[x.type] ?? x.type).join(", ")}
              </span>
            ),
          },
          {
            title: "Importancia",
            dataIndex: "importance",
            width: 130,
            filters: IMPORTANCES.map((i) => ({ text: i.label, value: i.value })),
            onFilter: (v, a) => a.importance === v,
            render: (v: string) => {
              const i = IMPORTANCES.find((x) => x.value === v) ?? IMPORTANCES[2];
              return <Tag color={i.color}>{i.label}</Tag>;
            },
          },
          { title: "Execucoes", dataIndex: "run_count", width: 100 },
          { title: "Ativa", width: 90, render: (_, a) => <Switch checked={a.is_enabled} onChange={(v) => void toggle(a, v)} /> },
          {
            title: "",
            width: 190,
            render: (_, a) => (
              <Space>
                <Button size="small" icon={<CopyOutlined />} title="Duplicar" onClick={() => duplicate(a)} />
                <Button size="small" icon={<PlayCircleOutlined />} title="Testar em uma tarefa"
                  onClick={() => { setTesting(a); setTestTaskRef(""); setTestResult(null); setTestDryRun(true); }} />
                <Button size="small" icon={<HistoryOutlined />} onClick={() => void openRuns(a)} />
                <Popconfirm title="Excluir automacao?" onConfirm={() => void remove(a)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
            ),
          },
          {
            key: "create",
            label: "Criar",
            children: (
              <Space orientation="vertical" style={{ width: "100%" }}>
                <Card size="small" hoverable onClick={() => openNew()}>
                  <Typography.Text strong><PlusOutlined /> Criar do zero</Typography.Text>
                  <div><Typography.Text type="secondary">Monte a frase: quando isto acontecer, entao faca isso.</Typography.Text></div>
                </Card>
                <Typography.Text type="secondary">Ou comece por um modelo pronto:</Typography.Text>
                {(catalog?.recipes ?? []).map((r) => (
                  <Card key={r.key} size="small" hoverable onClick={() => openNew(r)}>
                    <Typography.Text strong>{r.name}</Typography.Text>
                    <div><Typography.Text type="secondary">{r.description}</Typography.Text></div>
                  </Card>
                ))}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingId ? "Editar automacao" : "Nova automacao"}
        open={!!draft}
        onCancel={() => setDraft(null)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="Salvar"
        width={760}
        destroyOnHidden
      >
        {draft ? (
          <Form layout="vertical">
            <Form.Item label="Nome" required>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Form.Item>
            <Space wrap>
              <Form.Item label="Importancia (so organiza, nao muda a ordem de execucao)">
                <Select style={{ minWidth: 200 }} value={draft.importance}
                  onChange={(v) => setDraft({ ...draft, importance: v })}
                  options={IMPORTANCES.map((i) => ({ value: i.value, label: i.label }))} />
              </Form.Item>
              <Form.Item label="Area de trabalho" required>
                <Select style={{ minWidth: 220 }} disabled={!!editingId} value={draft.workspace_id || undefined}
                  onChange={(v) => setDraft({ ...draft, workspace_id: v, board_id: undefined })}
                  options={workspaces.map((w) => ({ value: w.id, label: w.name }))} />
              </Form.Item>
              <Form.Item label="Quadro (opcional)">
                <Select style={{ minWidth: 260 }} allowClear placeholder="Todos os quadros" value={draft.board_id}
                  onChange={(v) => setDraft({ ...draft, board_id: v })}
                  options={workspaceBoards.map((b) => ({ value: b.id, label: `${b.project_name}${b.name ? ` / ${b.name}` : ""}` }))} />
              </Form.Item>
            </Space>

            <Divider>Quando isto acontecer</Divider>
            <Space wrap align="baseline">
              <Typography.Text strong style={{ color: "#1677ff" }}>Quando</Typography.Text>
              <Select variant="underlined" style={{ minWidth: 280 }} value={draft.trigger_type}
                onChange={(v) => setDraft({ ...draft, trigger_type: v, trigger_config: {} })}
                options={(catalog?.triggers ?? []).map((t) => ({ value: t.type, label: t.label }))} />
              {renderConfig(triggerSpecs, draft.trigger_config, (c) => setDraft({ ...draft, trigger_config: c }))}
            </Space>

            <Divider>Condicao (opcional)</Divider>
            {draft.conditions.map((c, i) => (
              <Space key={i} style={{ marginBottom: 8 }} wrap align="baseline">
                <Typography.Text strong style={{ color: "#1677ff" }}>{i === 0 ? "Se" : "E se"}</Typography.Text>
                <Select variant="underlined" style={{ minWidth: 150 }} value={c.field}
                  onChange={(v) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, field: v } : x)) })}
                  options={(catalog?.condition_fields ?? []).map((f) => ({ value: f, label: FIELD_LABELS[f] ?? f }))} />
                <Select variant="underlined" style={{ minWidth: 190 }} value={c.op}
                  onChange={(v) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, op: v } : x)) })}
                  options={(catalog?.condition_ops ?? []).map((o) => ({ value: o, label: OP_LABELS[o] ?? o }))} />
                {NO_VALUE_OPS.has(c.op) ? null : (
                  <Input variant="underlined" style={{ width: 200 }} value={c.value ?? ""}
                    onChange={(e) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                )}
                <Button danger icon={<DeleteOutlined />} onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })} />
              </Space>
            ))}
            <div>
              <Button size="small" icon={<PlusOutlined />}
                onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "status", op: "eq", value: "" }] })}>
                Adicionar condicao
              </Button>
            </div>

            <Divider>Entao faca isso</Divider>
            {draft.actions.map((a, i) => {
              const specs = catalog?.actions.find((x) => x.type === a.type)?.config ?? [];
              return (
                <Card key={i} size="small" style={{ marginBottom: 8 }}>
                  <Space wrap align="baseline">
                    <Typography.Text strong style={{ color: "#1677ff" }}>{i === 0 ? "Entao" : "E tambem"}</Typography.Text>
                    <Select variant="underlined" style={{ minWidth: 220 }} value={a.type}
                      onChange={(v) => setDraft({ ...draft, actions: draft.actions.map((x, j) => (j === i ? { type: v, config: {} } : x)) })}
                      options={(catalog?.actions ?? []).map((x) => ({ value: x.type, label: x.label }))} />
                    {renderConfig(specs, a.config, (c) =>
                      setDraft({ ...draft, actions: draft.actions.map((x, j) => (j === i ? { ...x, config: c } : x)) }))}
                    <Button danger icon={<DeleteOutlined />} disabled={draft.actions.length === 1}
                      onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })} />
                  </Space>
                </Card>
              );
            })}
            <Button size="small" icon={<PlusOutlined />}
              onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: "set_status", config: {} }] })}>
              Adicionar acao
            </Button>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Variaveis nos textos: {(catalog?.template_variables ?? []).map((v) => `{{${v}}}`).join("  ")}
            </Typography.Paragraph>
          </Form>
        ) : null}
      </Modal>

      <Modal
        title={`Testar: ${testing?.name ?? ""}`}
        open={!!testing}
        onCancel={() => setTesting(null)}
        onOk={() => void runTest()}
        confirmLoading={testRunning}
        okText={testDryRun ? "Simular" : "Executar de verdade"}
        okButtonProps={{ danger: !testDryRun }}
      >
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Input placeholder="Link da tarefa (Copiar link) ou ID" value={testTaskRef} onChange={(e) => setTestTaskRef(e.target.value)} />
          <Space>
            <Switch checked={testDryRun} onChange={setTestDryRun} />
            <span>{testDryRun ? "Somente simular (nao altera nada)" : "Executar de verdade na tarefa"}</span>
          </Space>
          {testResult ? (
            <Card size="small" title={testResult.status === "success" ? "Resultado: ok" : "Resultado: falhou"}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {testResult.actions_log.map((l, i) => (
                  <li key={i}>{l.ok ? "✔" : "✖"} {actionLabel[l.type] ?? l.type}: {l.detail}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </Space>
      </Modal>

      <Modal title="Receitas prontas" open={recipesOpen} onCancel={() => setRecipesOpen(false)} footer={null} width={720}>
        <Space orientation="vertical" style={{ width: "100%" }}>
          {(catalog?.recipes ?? []).map((r) => (
            <Card key={r.key} size="small" hoverable onClick={() => openNew(r)}>
              <Typography.Text strong>{r.name}</Typography.Text>
              <div><Typography.Text type="secondary">{r.description}</Typography.Text></div>
            </Card>
          ))}
        </Space>
      </Modal>

      <Drawer title="Historico de execucoes" open={runs !== null} onClose={() => setRuns(null)} size={620}>
        <Table<RunItem>
          rowKey="id"
          size="small"
          dataSource={runs ?? []}
          pagination={{ pageSize: 15, hideOnSinglePage: true }}
          expandable={{
            expandedRowRender: (r) => (
              <ul style={{ margin: 0 }}>
                {r.actions_log.map((l, i) => (
                  <li key={i}>{l.ok ? "✔" : "✖"} {actionLabel[l.type] ?? l.type}: {l.detail}</li>
                ))}
              </ul>
            ),
          }}
          columns={[
            { title: "Quando", dataIndex: "created_at", render: (v: string) => new Date(v).toLocaleString("pt-BR") },
            { title: "Automacao", dataIndex: "automation_name" },
            { title: "Tarefa", dataIndex: "task_title", render: (v: string | null) => v ?? "-" },
            {
              title: "Status",
              render: (_, r) => (
                <Tag color={r.status === "success" ? "green" : "red"}>
                  {r.status === "success" ? "ok" : "falhou"}{r.is_dry_run ? " (teste)" : ""}
                </Tag>
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  );
}
