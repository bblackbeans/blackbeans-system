"use client";

import {
  CheckOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  DatePicker,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api";

type IntakeDraft = {
  id: string;
  title: string;
  description: string;
  assignee_hint: string;
  suggested_assignee_id: number | null;
  suggested_assignee_name: string;
  suggested_client_id: string | null;
  suggested_client_label: string;
  target_project_id: string | null;
  target_project_label: string;
  task_status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  status: string;
};

type IntakeBatch = {
  id: string;
  filename: string;
  status: string;
  suggested_client_name: string;
  suggested_client_id: string | null;
  suggested_client_label: string;
  drafts_count?: number | null;
  drafts?: IntakeDraft[];
  created_at?: string | null;
};

type ProjectOption = { id: string; name: string; client_id?: string | null };
type ClientOption = { id: string; name: string };
type AssigneeOption = { id: number; name: string };
type StatusOption = { value: string; label: string };
type BatchDefaults = { clientId: string | null; projectId: string | null };

const FALLBACK_STATUSES: StatusOption[] = [
  { value: "todo", label: "A fazer" },
  { value: "in_progress", label: "Em andamento" },
  { value: "blocked", label: "Bloqueada" },
  { value: "done", label: "Concluída" },
];

const PRIORITY_OPTIONS: StatusOption[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

type TaskIntakePanelProps = {
  token: string;
};

function statusTag(status: string) {
  if (status === "converted") return <Tag color="green">Convertido</Tag>;
  if (status === "discarded") return <Tag>Descartado</Tag>;
  return <Tag color="gold">Para aprovacao</Tag>;
}

function formatIntakeDate(iso?: string | null) {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("pt-BR");
}

function groupTitle(batch: IntakeBatch) {
  const dateLabel = formatIntakeDate(batch.created_at);
  const name = batch.filename || "Ata";
  return dateLabel ? `${name} · ${dateLabel}` : name;
}

function draftDueValue(raw?: string | null) {
  if (!raw) return null;
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const parsed = dayjs(`${ymd}T12:00:00`);
  return parsed.isValid() ? parsed : null;
}

function IntakeField({
  label,
  required,
  error,
  minWidth,
  children,
}: {
  label: string;
  required?: boolean;
  error?: boolean;
  minWidth: number;
  children: ReactNode;
}) {
  return (
    <Form.Item
      label={label}
      required={required}
      validateStatus={error ? "error" : undefined}
      help={error ? "Obrigatorio" : undefined}
      style={{ marginBottom: 0, minWidth }}
    >
      {children}
    </Form.Item>
  );
}

export function TaskIntakePanel({ token }: TaskIntakePanelProps) {
  const { modal } = App.useApp();
  const [msg, msgHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [convertingKey, setConvertingKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [batches, setBatches] = useState<IntakeBatch[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<StatusOption[]>(FALLBACK_STATUSES);
  const [defaultsByBatch, setDefaultsByBatch] = useState<Record<string, BatchDefaults>>({});
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState<Record<string, boolean>>({});

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest<{ batches: IntakeBatch[] }>("/task-intake", { token });
    setLoading(false);
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao carregar o imputador.");
      return;
    }
    const nextBatches = response.data?.batches ?? [];
    setBatches(nextBatches);
    setDefaultsByBatch((prev) => {
      const next = { ...prev };
      for (const batch of nextBatches) {
        if (next[batch.id]) continue;
        next[batch.id] = {
          clientId: batch.suggested_client_id,
          projectId: null,
        };
      }
      return next;
    });
  }, [msg, token]);

  const fetchLookups = useCallback(async () => {
    const [projectsResp, assigneesResp, clientsResp, statusesResp] = await Promise.all([
      apiRequest<{ projects: ProjectOption[] }>("/projects", { token }),
      apiRequest<{ users: AssigneeOption[] }>("/assignees", { token }),
      apiRequest<{ clients: ClientOption[] }>("/clients?page=1&page_size=200", { token }),
      apiRequest<{
        statuses?: Array<{ key?: string; label?: string; is_active?: boolean; position?: number }>;
      }>("/task-statuses", { token }),
    ]);
    if (projectsResp.ok) setProjects(projectsResp.data?.projects ?? []);
    if (assigneesResp.ok) {
      setAssignees(
        (assigneesResp.data?.users ?? []).map((row) => ({
          id: Number(row.id),
          name: row.name,
        })),
      );
    }
    if (clientsResp.ok) setClients(clientsResp.data?.clients ?? []);
    if (statusesResp.ok) {
      const rows = (statusesResp.data?.statuses ?? [])
        .filter((row) => row.is_active !== false)
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
        .map((row) => ({
          value: String(row.key ?? "").trim(),
          label: String(row.label ?? row.key ?? "").trim(),
        }))
        .filter((row) => row.value);
      if (rows.length > 0) setTaskStatuses(rows);
    }
  }, [token]);

  useEffect(() => {
    void fetchBatches();
    void fetchLookups();
  }, [fetchBatches, fetchLookups]);

  const replaceDraft = (batchId: string, draft: IntakeDraft) => {
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === batchId
          ? { ...batch, drafts: (batch.drafts ?? []).map((row) => (row.id === draft.id ? draft : row)) }
          : batch,
      ),
    );
  };

  const updateDraftLocal = (batchId: string, draftId: string, patch: Partial<IntakeDraft>) => {
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              drafts: (batch.drafts ?? []).map((row) => (row.id === draftId ? { ...row, ...patch } : row)),
            }
          : batch,
      ),
    );
  };

  const uploadAta = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const response = await apiRequest<{ batch: IntakeBatch }>("/task-intake", {
      method: "POST",
      token,
      body: form,
    });
    setUploading(false);
    if (!response.ok || !response.data?.batch) {
      msg.error(response.error?.message ?? "Falha ao processar a ata.");
      return false;
    }
    const batch = response.data.batch;
    const count = batch.drafts?.length ?? 0;
    if (count === 0) {
      msg.info("Ata lida, mas nenhuma acao clara foi encontrada. Adicione rascunhos para aprovar.");
    } else {
      msg.success(`${count} rascunho(s) gerado(s) para aprovacao.`);
    }
    await fetchBatches();
    return false;
  };

  const patchDraft = async (batchId: string, draftId: string, body: Record<string, unknown>) => {
    const response = await apiRequest<{ draft: IntakeDraft }>(
      `/task-intake/${batchId}/drafts/${draftId}`,
      { method: "PATCH", token, body },
    );
    if (!response.ok || !response.data?.draft) {
      msg.error(response.error?.message ?? "Falha ao salvar rascunho.");
      return;
    }
    replaceDraft(batchId, response.data.draft);
  };

  const deleteDraft = async (batchId: string, draftId: string) => {
    setDeletingDraftId(draftId);
    const response = await apiRequest<{ deleted?: boolean }>(`/task-intake/${batchId}/drafts/${draftId}`, {
      method: "DELETE",
      token,
    });
    setDeletingDraftId(null);
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao excluir rascunho.");
      throw new Error("intake_draft_delete_failed");
    }
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              drafts: (batch.drafts ?? []).filter((row) => row.id !== draftId),
              drafts_count: Math.max(0, (batch.drafts_count ?? 1) - 1),
            }
          : batch,
      ),
    );
  };

  const confirmDeleteDraft = (batch: IntakeBatch, draft: IntakeDraft) => {
    modal.confirm({
      title: `Excluir o rascunho "${draft.title.trim() || "sem titulo"}"?`,
      content: "Remove so este rascunho da ata. Essa acao nao pode ser desfeita.",
      okText: "Excluir",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: () => deleteDraft(batch.id, draft.id),
    });
  };

  const addDraft = async (batchId: string) => {
    const response = await apiRequest<{ draft: IntakeDraft }>(`/task-intake/${batchId}/drafts`, {
      method: "POST",
      token,
      body: { title: "Nova tarefa", description: "" },
    });
    if (!response.ok || !response.data?.draft) {
      msg.error(response.error?.message ?? "Falha ao adicionar rascunho.");
      return;
    }
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              drafts: [...(batch.drafts ?? []), response.data!.draft],
              drafts_count: (batch.drafts_count ?? 0) + 1,
            }
          : batch,
      ),
    );
  };

  const deleteBatch = (batch: IntakeBatch) => {
    modal.confirm({
      title: `Excluir a ata "${batch.filename || "Ata"}"?`,
      content: "Remove a ata e os rascunhos desta lista. Tarefas ja criadas no projeto permanecem.",
      okText: "Excluir",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        setDeletingId(batch.id);
        const response = await apiRequest<{ deleted?: boolean }>(`/task-intake/${batch.id}`, {
          method: "DELETE",
          token,
        });
        setDeletingId(null);
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao excluir a ata.");
          throw new Error("intake_batch_delete_failed");
        }
        msg.success("Ata excluida.");
        setBatches((prev) => prev.filter((row) => row.id !== batch.id));
        setDefaultsByBatch((prev) => {
          const next = { ...prev };
          delete next[batch.id];
          return next;
        });
      },
    });
  };

  const convert = async (batch: IntakeBatch, draftIds?: string[]) => {
    const defaults = defaultsByBatch[batch.id] ?? { clientId: null, projectId: null };
    const pending = (batch.drafts ?? []).filter((row) => {
      if (row.status === "discarded" || row.status === "converted") return false;
      if (!draftIds) return true;
      return draftIds.includes(row.id);
    });
    const missingClient = pending.some((row) => !row.suggested_client_id && !defaults.clientId);
    const missingProject = pending.some((row) => !row.target_project_id && !defaults.projectId);
    if (pending.length === 0) {
      msg.warning("Nenhum rascunho para converter.");
      return;
    }
    if (missingClient || missingProject) {
      setShowMissing((prev) => ({ ...prev, [batch.id]: true }));
      if (missingClient && missingProject) {
        msg.warning("Informe cliente e projeto (padrao ou em cada tarefa).");
      } else if (missingClient) {
        msg.warning("Escolha o cliente padrao ou o cliente de cada tarefa.");
      } else {
        msg.warning("Escolha o projeto padrao ou o projeto de cada tarefa.");
      }
      return;
    }
    const convertingToken = draftIds?.length === 1 ? `one:${draftIds[0]}` : `all:${batch.id}`;
    setConvertingKey(convertingToken);
    const response = await apiRequest<{ batch: IntakeBatch; tasks?: unknown[] }>(
      `/task-intake/${batch.id}/convert`,
      {
        method: "POST",
        token,
        body: {
          default_client_id: defaults.clientId,
          default_project_id: defaults.projectId,
          ...(draftIds ? { draft_ids: draftIds } : {}),
        },
      },
    );
    setConvertingKey(null);
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao criar as tarefas.");
      return;
    }
    const created = response.data?.tasks?.length ?? pending.length;
    setShowMissing((prev) => ({ ...prev, [batch.id]: false }));
    msg.success(created === 1 ? "Tarefa criada." : `${created} tarefas criadas.`);
    await fetchBatches();
  };

  const clientOptions = useMemo(
    () => clients.map((row) => ({ value: row.id, label: row.name })),
    [clients],
  );

  const projectOptionsFor = (clientId: string | null) => {
    const filtered = clientId
      ? projects.filter((row) => !row.client_id || String(row.client_id) === clientId)
      : projects;
    return filtered.map((row) => ({ value: row.id, label: row.name }));
  };

  return (
    <Card
      title="Imputador de tarefas"
      extra={
        <Space>
          <Upload
            accept=".pdf,.docx,.doc,.txt,.md"
            showUploadList={false}
            beforeUpload={(file) => {
              void uploadAta(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploading} type="primary">
              Anexar ata
            </Button>
          </Upload>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchBatches()}>
            Atualizar
          </Button>
        </Space>
      }
    >
      {msgHolder}
      <Typography.Paragraph type="secondary">
        Anexe a ata da reuniao (PDF com texto selecionavel, Word .docx, .txt ou .md). O sistema gera
        rascunhos separados para voce editar e so cria tarefas no projeto quando voce confirmar. PDF so
        com imagem/escaneado nao funciona.
      </Typography.Paragraph>
      {loading && batches.length === 0 ? (
        <Empty description="Carregando atas..." />
      ) : batches.length === 0 ? (
        <Empty description="Nenhuma ata anexada ainda." />
      ) : (
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          {batches.map((batch) => {
            const converted = batch.status === "converted";
            const defaults = defaultsByBatch[batch.id] ?? {
              clientId: batch.suggested_client_id,
              projectId: null,
            };
            const drafts = batch.drafts ?? [];
            const pendingDrafts = drafts.filter(
              (row) => row.status !== "converted" && row.status !== "discarded",
            );
            const highlightMissing = Boolean(showMissing[batch.id]);
            const defaultClientMissing = !defaults.clientId;
            const defaultProjectMissing = !defaults.projectId;
            return (
              <Collapse
                key={`${batch.id}-${converted ? "converted" : "open"}`}
                size="small"
                defaultActiveKey={converted ? [] : [batch.id]}
                items={[
                  {
                    key: batch.id,
                    label: (
                      <Space wrap align="center">
                        <Typography.Text strong>{groupTitle(batch)}</Typography.Text>
                        {statusTag(batch.status)}
                        <Typography.Text type="secondary">
                          {drafts.length} rascunho{drafts.length === 1 ? "" : "s"}
                        </Typography.Text>
                      </Space>
                    ),
                    extra: (
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        loading={deletingId === batch.id}
                        aria-label="Excluir ata"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteBatch(batch);
                        }}
                      />
                    ),
                    children: (
                <Form layout="vertical" requiredMark component="div">
                <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                  <Typography.Text type="secondary">
                    Cliente e projeto sao obrigatorios. O padrao preenche as tarefas que nao tiverem o
                    seu.
                  </Typography.Text>
                  <Space wrap align="start" style={{ width: "100%" }}>
                    <IntakeField label="Cliente padrao" required minWidth={220}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Selecione o cliente"
                        value={defaults.clientId ?? undefined}
                        disabled={converted}
                        style={{ minWidth: 220 }}
                        options={clientOptions}
                        status={highlightMissing && defaultClientMissing ? "error" : undefined}
                        onChange={(value) =>
                          setDefaultsByBatch((prev) => ({
                            ...prev,
                            [batch.id]: { clientId: value ?? null, projectId: null },
                          }))
                        }
                      />
                    </IntakeField>
                    <IntakeField label="Projeto padrao" required minWidth={260}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Selecione o projeto"
                        value={defaults.projectId ?? undefined}
                        disabled={converted}
                        style={{ minWidth: 260 }}
                        options={projectOptionsFor(defaults.clientId)}
                        status={highlightMissing && defaultProjectMissing ? "error" : undefined}
                        onChange={(value) =>
                          setDefaultsByBatch((prev) => ({
                            ...prev,
                            [batch.id]: { clientId: prev[batch.id]?.clientId ?? null, projectId: value ?? null },
                          }))
                        }
                      />
                    </IntakeField>
                  </Space>
                  {drafts.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      title="Nenhuma acao encontrada nesta ata"
                      description="Adicione rascunhos na mao: titulo, descricao, cliente e projeto."
                    />
                  ) : null}
                  {drafts.map((draft) => {
                    const draftLocked = converted || draft.status === "converted";
                    const draftClient = draft.suggested_client_id ?? defaults.clientId;
                    const taskStatus = draft.task_status || "todo";
                    const taskPriority = draft.priority || "medium";
                    const clientMissing = !draft.suggested_client_id && !defaults.clientId;
                    const projectMissing = !draft.target_project_id && !defaults.projectId;
                    return (
                      <Card
                        key={draft.id}
                        size="small"
                        title={
                          <Input
                            value={draft.title}
                            disabled={draftLocked}
                            placeholder="Titulo da tarefa"
                            onChange={(event) =>
                              updateDraftLocal(batch.id, draft.id, { title: event.target.value })
                            }
                            onBlur={() => void patchDraft(batch.id, draft.id, { title: draft.title })}
                          />
                        }
                        extra={
                          <Space>
                            {draft.status === "converted" ? <Tag color="green">Convertida</Tag> : null}
                            {draftLocked ? null : (
                              <>
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<CheckOutlined />}
                                  loading={convertingKey === `one:${draft.id}`}
                                  disabled={Boolean(convertingKey)}
                                  onClick={() => void convert(batch, [draft.id])}
                                >
                                  Converter
                                </Button>
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  loading={deletingDraftId === draft.id}
                                  aria-label="Excluir rascunho"
                                  onClick={() => confirmDeleteDraft(batch, draft)}
                                />
                              </>
                            )}
                          </Space>
                        }
                      >
                        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                          <Input.TextArea
                            rows={3}
                            value={draft.description}
                            disabled={draftLocked}
                            placeholder="Descricao"
                            onChange={(event) =>
                              updateDraftLocal(batch.id, draft.id, { description: event.target.value })
                            }
                            onBlur={() =>
                              void patchDraft(batch.id, draft.id, { description: draft.description })
                            }
                          />
                          <Space wrap align="start" style={{ width: "100%" }}>
                            <IntakeField label="Responsavel" minWidth={200}>
                              <Select
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                placeholder="Opcional"
                                value={draft.suggested_assignee_id ?? undefined}
                                disabled={draftLocked}
                                style={{ minWidth: 200 }}
                                options={assignees.map((row) => ({ value: row.id, label: row.name }))}
                                onChange={(value) => {
                                  updateDraftLocal(batch.id, draft.id, {
                                    suggested_assignee_id: value ?? null,
                                  });
                                  void patchDraft(batch.id, draft.id, {
                                    suggested_assignee_id: value ?? null,
                                  });
                                }}
                              />
                            </IntakeField>
                            <IntakeField label="Status" minWidth={160}>
                              <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="Status"
                                value={taskStatus}
                                disabled={draftLocked}
                                style={{ minWidth: 160 }}
                                options={taskStatuses}
                                onChange={(value) => {
                                  const next = value || "todo";
                                  updateDraftLocal(batch.id, draft.id, { task_status: next });
                                  void patchDraft(batch.id, draft.id, { task_status: next });
                                }}
                              />
                            </IntakeField>
                            <IntakeField label="Prioridade" minWidth={140}>
                              <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="Prioridade"
                                value={taskPriority}
                                disabled={draftLocked}
                                style={{ minWidth: 140 }}
                                options={PRIORITY_OPTIONS}
                                onChange={(value) => {
                                  const next = value || "medium";
                                  updateDraftLocal(batch.id, draft.id, { priority: next });
                                  void patchDraft(batch.id, draft.id, { priority: next });
                                }}
                              />
                            </IntakeField>
                            <IntakeField label="Prazo" minWidth={168}>
                              <DatePicker
                                allowClear
                                format="DD/MM/YYYY"
                                placeholder="Opcional"
                                value={draftDueValue(draft.due_date)}
                                disabled={draftLocked}
                                style={{ minWidth: 168, width: "100%" }}
                                onChange={(value) => {
                                  const next = value ? value.format("YYYY-MM-DD") : null;
                                  updateDraftLocal(batch.id, draft.id, { due_date: next });
                                  void patchDraft(batch.id, draft.id, { due_date: next });
                                }}
                              />
                            </IntakeField>
                            <IntakeField
                              label="Cliente desta tarefa"
                              required
                              error={highlightMissing && clientMissing}
                              minWidth={200}
                            >
                              <Select
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                placeholder={defaults.clientId ? "Usa o cliente padrao" : "Selecione o cliente"}
                                value={draft.suggested_client_id ?? undefined}
                                disabled={draftLocked}
                                style={{ minWidth: 200 }}
                                options={clientOptions}
                                status={highlightMissing && clientMissing ? "error" : undefined}
                                onChange={(value) => {
                                  updateDraftLocal(batch.id, draft.id, {
                                    suggested_client_id: value ?? null,
                                    target_project_id: null,
                                  });
                                  void patchDraft(batch.id, draft.id, {
                                    suggested_client_id: value ?? null,
                                    target_project_id: null,
                                  });
                                }}
                              />
                            </IntakeField>
                            <IntakeField
                              label="Projeto desta tarefa"
                              required
                              error={highlightMissing && projectMissing}
                              minWidth={220}
                            >
                              <Select
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                placeholder={defaults.projectId ? "Usa o projeto padrao" : "Selecione o projeto"}
                                value={draft.target_project_id ?? undefined}
                                disabled={draftLocked}
                                style={{ minWidth: 220 }}
                                options={projectOptionsFor(draftClient)}
                                status={highlightMissing && projectMissing ? "error" : undefined}
                                onChange={(value) => {
                                  updateDraftLocal(batch.id, draft.id, {
                                    target_project_id: value ?? null,
                                  });
                                  void patchDraft(batch.id, draft.id, {
                                    target_project_id: value ?? null,
                                  });
                                }}
                              />
                            </IntakeField>
                          </Space>
                        </Space>
                      </Card>
                    );
                  })}
                  {converted ? null : (
                    <Space wrap>
                      <Button icon={<PlusOutlined />} onClick={() => void addDraft(batch.id)}>
                        Adicionar rascunho
                      </Button>
                      <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        loading={convertingKey === `all:${batch.id}`}
                        disabled={pendingDrafts.length === 0 || Boolean(convertingKey)}
                        onClick={() => void convert(batch)}
                      >
                        Converter todas
                      </Button>
                    </Space>
                  )}
                </Space>
                </Form>
                    ),
                  },
                ]}
              />
            );
          })}
        </Space>
      )}
    </Card>
  );
}
