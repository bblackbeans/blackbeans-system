"use client";

import {
  BellOutlined,
  DashboardOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  LoginOutlined,
  LogoutOutlined,
  SafetyOutlined,
  SettingOutlined,
  StockOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "@/lib/api";

const { Header, Sider, Content } = Layout;
const AUTH_STORAGE_KEY = "bb_access_token";
const REFRESH_STORAGE_KEY = "bb_refresh_token";
const BOARD_STORAGE_KEY = "bb_selected_board_id";
const TASK_STATUS_FILTER_KEY = "bb_task_status_filter";
const TASK_SEARCH_FILTER_KEY = "bb_task_search_filter";

const PERMISSION_KEY_OPTIONS = ["tasks.read", "tasks.write", "boards.read", "boards.write"].map((key) => ({
  value: key,
  label: key,
}));

const SCOPE_TYPE_OPTIONS = (["workspace", "portfolio", "project", "board"] as const).map((value) => ({
  value,
  label: value,
}));

type ApiHealthData = {
  ok: boolean;
  status?: string;
  timestamp?: string;
  checks?: Record<string, string>;
  message?: string;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

type TaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  end_date: string | null;
  board_id: string;
  group_id: string;
};

type TaskActivity = {
  event_type: string;
  summary: string;
  created_at: string;
};

type TimeLog = {
  id: string;
  status: string;
  total_seconds: number;
  started_at: string | null;
  ended_at: string | null;
};

type AuthStep = "credentials" | "2fa";
type TwoFactorMethod = "challenge" | "totp";
type BoardItem = { id: string; name: string; project_id: string; workspace_id: string };
type GroupItem = { id: string; board_id: string; name: string; position: number; wip_limit: number };
type KanbanGroup = { group: GroupItem; tasks: TaskItem[] };

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function secondsToText(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function AuthPanel({
  loading,
  step,
  username,
  onCredentials,
  on2fa,
  method,
}: {
  loading: boolean;
  step: AuthStep;
  username: string;
  onCredentials: (values: { username: string; password: string }) => void;
  on2fa: (values: { code: string }) => void;
  method: TwoFactorMethod;
}) {
  return (
    <Row justify="center" align="middle" style={{ minHeight: "100vh", padding: 24 }}>
      <Col xs={24} md={14} lg={10} xl={8}>
        <Card>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            Entrar no BlackBeans
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            Autenticacao admin com JWT + 2FA integrada aos endpoints reais da API.
          </Typography.Paragraph>
          {step === "credentials" ? (
            <Form layout="vertical" onFinish={onCredentials}>
              <Form.Item label="Usuario" name="username" rules={[{ required: true, message: "Informe o usuario." }]}>
                <Input autoComplete="username" data-testid="login-username" />
              </Form.Item>
              <Form.Item label="Senha" name="password" rules={[{ required: true, message: "Informe a senha." }]}>
                <Input.Password autoComplete="current-password" data-testid="login-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} icon={<LoginOutlined />}>
                Entrar
              </Button>
            </Form>
          ) : (
            <Form layout="vertical" onFinish={on2fa}>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                title={
                  method === "totp"
                    ? `Codigo do Authenticator necessario para ${username}.`
                    : `Codigo 2FA necessario para ${username}.`
                }
              />
              <Form.Item label="Codigo 2FA" name="code" rules={[{ required: true, message: "Informe o codigo." }]}>
                <Input placeholder="Ex.: 123456" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                Validar e entrar
              </Button>
            </Form>
          )}
        </Card>
      </Col>
    </Row>
  );
}

export function AppShell() {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEY) : null,
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(REFRESH_STORAGE_KEY) : null,
  );
  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>("challenge");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [activeKey, setActiveKey] = useState("dashboard");

  const [health, setHealth] = useState<ApiHealthData>({ ok: false, message: "Carregando..." });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(TASK_STATUS_FILTER_KEY) ?? "all" : "all",
  );
  const [taskSearchFilter, setTaskSearchFilter] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(TASK_SEARCH_FILTER_KEY) ?? "" : "",
  );
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [drawerGroups, setDrawerGroups] = useState<GroupItem[]>([]);
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [taskSummary, setTaskSummary] = useState<{ total_seconds: number; logs: TimeLog[] }>({
    total_seconds: 0,
    logs: [],
  });
  const [apiMessage, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [auditLogFilterForm] = Form.useForm();

  const [auditOverview, setAuditOverview] = useState<Record<string, unknown>>({});
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [statsResult, setStatsResult] = useState<Record<string, unknown> | null>(null);
  const [governanceResult, setGovernanceResult] = useState<Record<string, unknown> | null>(null);
  const [conflictPreviewResult, setConflictPreviewResult] = useState<Record<string, unknown> | null>(null);
  const lastConflictRequestRef = useRef<{
    workspace_id: string;
    context: {
      subject_type: "user";
      subject_id: number;
      scope_type: string;
      scope_id: string;
      permission_key: string;
    };
    proposed: { effect: "allow" | "deny" };
  } | null>(null);
  const [profileResult, setProfileResult] = useState<Record<string, unknown> | null>(null);
  const [clients, setClients] = useState<Record<string, unknown>[]>([]);
  const [workspaces, setWorkspaces] = useState<Record<string, unknown>[]>([]);
  const [portfolios, setPortfolios] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(BOARD_STORAGE_KEY) : null,
  );
  const [kanbanGroups, setKanbanGroups] = useState<KanbanGroup[]>([]);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [totpSettings, setTotpSettings] = useState<{
    totp_enabled: boolean;
    has_pending_enrollment: boolean;
    recovery_codes_count: number;
  } | null>(null);
  const [, setTotpEnrollment] = useState<{
    manual_entry_key: string;
    otpauth_uri: string;
  } | null>(null);

  const menuItems = useMemo(
    () => [
      { key: "dashboard", icon: <DashboardOutlined />, label: "Dashboard" },
      { key: "tasks", icon: <UnorderedListOutlined />, label: "Tarefas" },
      { key: "profile", icon: <UserOutlined />, label: "Perfil" },
      { key: "notifications", icon: <BellOutlined />, label: "Notificacoes" },
      { key: "governance", icon: <SafetyOutlined />, label: "Governanca" },
      { key: "audit", icon: <HistoryOutlined />, label: "Auditoria" },
      { key: "stats", icon: <StockOutlined />, label: "Estatisticas" },
      { key: "projects", icon: <FolderOpenOutlined />, label: "Projetos" },
    ],
    [],
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = taskStatusFilter === "all" || task.status === taskStatusFilter;
      const normalizedSearch = taskSearchFilter.trim().toLowerCase();
      const matchesSearch = normalizedSearch.length === 0 || task.title.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [taskSearchFilter, taskStatusFilter, tasks]);

  const fetchHealth = useCallback(async () => {
    const response = await apiRequest<{ status: string; timestamp: string; checks: Record<string, string> }>("/health", {
      token,
    });
    if (!response.ok) {
      setGlobalError(response.error?.message ?? "Falha ao consultar estado da API.");
      setHealth({ ok: false, message: response.error?.message });
      return;
    }
    setGlobalError(null);
    setHealth({
      ok: true,
      status: response.data?.status,
      timestamp: response.data?.timestamp,
      checks: response.data?.checks,
    });
  }, [token]);

  const fetchNotifications = useCallback(async () => {
    const [listResp, unreadResp] = await Promise.all([
      apiRequest<{ notifications: NotificationItem[] }>("/notifications?page=1&page_size=20", { token }),
      apiRequest<{ unread_count: number }>("/notifications/unread-count", { token }),
    ]);
    if (listResp.ok) setNotifications(listResp.data?.notifications ?? []);
    if (unreadResp.ok) setUnreadCount(unreadResp.data?.unread_count ?? 0);
    if (!listResp.ok || !unreadResp.ok) {
      setGlobalError(listResp.error?.message ?? unreadResp.error?.message ?? "Falha ao carregar notificacoes.");
    }
  }, [token]);

  const fetchTasks = useCallback(async () => {
    const response = await apiRequest<{ tasks: TaskItem[] }>("/my-tasks", { token });
    if (response.ok) {
      setTasks(response.data?.tasks ?? []);
    }
  }, [token]);

  const fetchAuditOverview = useCallback(async () => {
    const overviewResp = await apiRequest<Record<string, unknown>>("/audit/dashboard", { token });
    if (overviewResp.ok) setAuditOverview(overviewResp.data ?? {});
  }, [token]);

  const fetchAuditLogs = useCallback(async (query?: string) => {
    const path =
      query && query.length > 0 ? `/audit/logs?${query}` : "/audit/logs?page=1&page_size=20";
    const logsResp = await apiRequest<{ logs: Record<string, unknown>[] }>(path, { token });
    if (logsResp.ok) setAuditLogs(logsResp.data?.logs ?? []);
  }, [token]);

  const fetchAudit = useCallback(async () => {
    await Promise.all([fetchAuditOverview(), fetchAuditLogs()]);
  }, [fetchAuditLogs, fetchAuditOverview]);

  const fetch2FASettings = useCallback(async () => {
    const response = await apiRequest<{
      totp_enabled: boolean;
      has_pending_enrollment: boolean;
      recovery_codes_count: number;
    }>("/auth/2fa/settings", { token });
    if (response.ok) {
      setTotpSettings(response.data ?? null);
    }
  }, [token]);

  const fetchProfile = useCallback(async () => {
    const response = await apiRequest<{ profile: Record<string, unknown> }>("/me/collaborator-profile", { token });
    if (!response.ok) {
      setProfileResult(null);
      return;
    }
    setProfileResult(response.data?.profile ?? null);
  }, [token]);

  const fetchCrudData = useCallback(async () => {
    const [clientsResp, workspacesResp, portfoliosResp, projectsResp] = await Promise.all([
      apiRequest<{ clients: Record<string, unknown>[] }>("/clients?page=1&page_size=50", { token }),
      apiRequest<{ workspaces: Record<string, unknown>[] }>("/workspaces", { token }),
      apiRequest<{ portfolios: Record<string, unknown>[] }>("/portfolios", { token }),
      apiRequest<{ projects: Record<string, unknown>[] }>("/projects", { token }),
    ]);
    if (clientsResp.ok) setClients(clientsResp.data?.clients ?? []);
    if (workspacesResp.ok) setWorkspaces(workspacesResp.data?.workspaces ?? []);
    if (portfoliosResp.ok) setPortfolios(portfoliosResp.data?.portfolios ?? []);
    if (projectsResp.ok) setProjects(projectsResp.data?.projects ?? []);
  }, [token]);

  const fetchBoards = useCallback(async () => {
    const response = await apiRequest<{ boards: BoardItem[] }>("/boards", { token });
    if (!response.ok) return;
    const rows = response.data?.boards ?? [];
    setBoards(rows);
    if (!selectedBoardId && rows.length > 0) {
      setSelectedBoardId(rows[0].id);
    }
  }, [selectedBoardId, token]);

  const fetchKanban = useCallback(
    async (boardId: string) => {
      setKanbanLoading(true);
      const response = await apiRequest<{ groups: KanbanGroup[] }>(`/boards/${boardId}?view=kanban`, { token });
      setKanbanLoading(false);
      if (!response.ok) {
        apiMessage.error(response.error?.message ?? "Falha ao carregar board.");
        return;
      }
      setKanbanGroups(response.data?.groups ?? []);
    },
    [apiMessage, token],
  );

  const loadAllData = useCallback(async () => {
    if (!token) return;
    await Promise.all([
      fetchHealth(),
      fetchNotifications(),
      fetchTasks(),
      fetchAudit(),
      fetch2FASettings(),
      fetchProfile(),
      fetchCrudData(),
      fetchBoards(),
    ]);
  }, [
    fetch2FASettings,
    fetchAudit,
    fetchBoards,
    fetchCrudData,
    fetchHealth,
    fetchNotifications,
    fetchProfile,
    fetchTasks,
    token,
  ]);

  useEffect(() => {
    if (!token) return;
    queueMicrotask(() => {
      loadAllData().catch(() => undefined);
    });
  }, [loadAllData, token]);

  useEffect(() => {
    if (!token || !selectedBoardId) return;
    queueMicrotask(() => {
      fetchKanban(selectedBoardId).catch(() => undefined);
    });
  }, [fetchKanban, selectedBoardId, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedBoardId) {
      localStorage.setItem(BOARD_STORAGE_KEY, selectedBoardId);
    } else {
      localStorage.removeItem(BOARD_STORAGE_KEY);
    }
  }, [selectedBoardId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TASK_STATUS_FILTER_KEY, taskStatusFilter);
  }, [taskStatusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TASK_SEARCH_FILTER_KEY, taskSearchFilter);
  }, [taskSearchFilter]);

  async function handleCredentials(values: { username: string; password: string }) {
    setAuthLoading(true);
    const response = await apiRequest<{
      challenge_id?: string;
      method?: TwoFactorMethod;
      access_token?: string;
      refresh_token?: string;
      requires_2fa_setup?: boolean;
    }>("/auth/tokens", {
      method: "POST",
      body: values,
    });
    setAuthLoading(false);
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha no login.");
      return;
    }
    const access = response.data?.access_token;
    const refresh = response.data?.refresh_token;
    if (access && refresh) {
      setToken(access);
      setRefreshToken(refresh);
      localStorage.setItem(AUTH_STORAGE_KEY, access);
      localStorage.setItem(REFRESH_STORAGE_KEY, refresh);
      setAuthStep("credentials");
      setChallengeId(null);
      apiMessage.success(
        response.data?.requires_2fa_setup
          ? "Login concluido. Recomendado configurar 2FA no perfil."
          : "Sessao iniciada com sucesso.",
      );
      return;
    }

    setUsername(values.username);
    setChallengeId(response.data?.challenge_id ?? null);
    setTwoFactorMethod(response.data?.method ?? "totp");
    setAuthStep("2fa");
    apiMessage.success("Informe o codigo do app autenticador.");
  }

  async function handle2fa(values: { code: string }) {
    if (!challengeId) return;
    setAuthLoading(true);
    const response = await apiRequest<{ access_token: string; refresh_token: string }>("/auth/tokens/2fa/verify", {
      method: "POST",
      body: { challenge_id: challengeId, code: values.code },
    });
    setAuthLoading(false);
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha na verificacao 2FA.");
      return;
    }
    const access = response.data?.access_token ?? "";
    const refresh = response.data?.refresh_token ?? "";
    setToken(access);
    setRefreshToken(refresh);
    localStorage.setItem(AUTH_STORAGE_KEY, access);
    localStorage.setItem(REFRESH_STORAGE_KEY, refresh);
    setAuthStep("credentials");
    setChallengeId(null);
    apiMessage.success("Sessao iniciada com sucesso.");
  }

  async function markNotificationAsRead(id: string) {
    const response = await apiRequest(`/notifications/${id}/read`, { method: "POST", token, body: {} });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Nao foi possivel marcar a notificacao.");
      return;
    }
    fetchNotifications().catch(() => undefined);
  }

  async function openTask(task: TaskItem) {
    setSelectedTask(task);
    const [activityResp, summaryResp, groupsResp] = await Promise.all([
      apiRequest<{ activities: TaskActivity[] }>(`/tasks/${task.id}/activity`, { token }),
      apiRequest<{ total_seconds: number; logs: TimeLog[] }>(`/tasks/${task.id}/time-summary`, { token }),
      apiRequest<{ groups: GroupItem[] }>(`/boards/${task.board_id}/groups`, { token }),
    ]);
    setTaskActivity(activityResp.data?.activities ?? []);
    setTaskSummary({
      total_seconds: summaryResp.data?.total_seconds ?? 0,
      logs: summaryResp.data?.logs ?? [],
    });
    setDrawerGroups(groupsResp.data?.groups ?? []);
    if (!activityResp.ok || !summaryResp.ok || !groupsResp.ok) {
      setGlobalError(activityResp.error?.message ?? summaryResp.error?.message ?? groupsResp.error?.message ?? "Falha ao carregar detalhes da tarefa.");
    }
  }

  async function taskAction(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    if (!selectedTask) return;
    const response = await apiRequest(path, { method, token, body });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha na acao da tarefa.");
      setGlobalError(response.error?.message ?? "Falha na acao da tarefa.");
      return;
    }
    setGlobalError(null);
    apiMessage.success("Acao executada com sucesso.");
    await fetchTasks();
    await openTask(selectedTask);
  }

  async function moveTaskToGroup(taskId: string, nextGroupId: string) {
    const response = await apiRequest(`/tasks/${taskId}`, {
      method: "PATCH",
      token,
      body: { group_id: nextGroupId },
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao mover tarefa.");
      setGlobalError(response.error?.message ?? "Falha ao mover tarefa.");
      return;
    }
    setGlobalError(null);
    if (selectedBoardId) {
      await fetchKanban(selectedBoardId);
    }
    await fetchTasks();
    if (selectedTask?.id === taskId) {
      await openTask({ ...selectedTask, group_id: nextGroupId });
    }
  }

  async function refreshSession() {
    if (!refreshToken) return;
    const response = await apiRequest<{ access_token: string; refresh_token: string }>("/auth/tokens/refresh", {
      method: "POST",
      body: { refresh: refreshToken },
    });
    if (!response.ok) {
      apiMessage.error("Sessao expirada. Entre novamente.");
      handleLogout();
      return;
    }
    const access = response.data?.access_token ?? "";
    const refresh = response.data?.refresh_token ?? "";
    setToken(access);
    setRefreshToken(refresh);
    localStorage.setItem(AUTH_STORAGE_KEY, access);
    localStorage.setItem(REFRESH_STORAGE_KEY, refresh);
    apiMessage.success("Token renovado.");
  }

  function handleLogout() {
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(REFRESH_STORAGE_KEY);
    setSelectedTask(null);
    setNotifications([]);
    setTasks([]);
  }

  async function patchEntity(path: string, payload: Record<string, unknown>, successMessage: string) {
    const response = await apiRequest(path, { method: "PATCH", token, body: payload });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao atualizar registro.");
      setGlobalError(response.error?.message ?? "Falha ao atualizar registro.");
      return false;
    }
    setGlobalError(null);
    apiMessage.success(successMessage);
    await fetchCrudData();
    await fetchBoards();
    return true;
  }

  async function deleteEntity(path: string, successMessage: string) {
    const response = await apiRequest(path, { method: "DELETE", token });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao remover registro.");
      setGlobalError(response.error?.message ?? "Falha ao remover registro.");
      return false;
    }
    setGlobalError(null);
    apiMessage.success(successMessage);
    await fetchCrudData();
    await fetchBoards();
    return true;
  }

  function openTextInputModal(params: {
    title: string;
    initialValue?: string;
    placeholder?: string;
    okText?: string;
    onSubmit: (value: string) => Promise<void>;
  }) {
    let currentValue = params.initialValue ?? "";
    modal.confirm({
      title: params.title,
      okText: params.okText ?? "Salvar",
      cancelText: "Cancelar",
      content: (
        <Input
          autoFocus
          defaultValue={params.initialValue}
          placeholder={params.placeholder}
          onChange={(event) => {
            currentValue = event.target.value;
          }}
        />
      ),
      onOk: async () => {
        const value = currentValue.trim();
        if (!value) {
          apiMessage.error("Informe um valor valido.");
          throw new Error("empty_value");
        }
        await params.onSubmit(value);
      },
    });
  }

  function openDeleteConfirmModal(params: { title: string; onConfirm: () => Promise<void> }) {
    modal.confirm({
      title: params.title,
      okText: "Excluir",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: params.onConfirm,
    });
  }

  function open2FASetupModal(enrollment: { manual_entry_key: string; otpauth_uri: string }) {
    let currentCode = "";
    modal.confirm({
      title: "Ativar 2FA com QR Code",
      width: 560,
      okText: "Confirmar ativacao",
      cancelText: "Cancelar",
      content: (
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Typography.Text>Escaneie o QR Code no app autenticador.</Typography.Text>
          <Image
            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(enrollment.otpauth_uri)}`}
            alt="QR Code 2FA"
            width={220}
            height={220}
            style={{ border: "1px solid #f0f0f0", borderRadius: 8 }}
          />
          <Typography.Text copyable={{ text: enrollment.manual_entry_key }}>
            Chave manual: {enrollment.manual_entry_key}
          </Typography.Text>
          <Input
            placeholder="Digite o codigo de 6 digitos"
            onChange={(event) => {
              currentCode = event.target.value;
            }}
          />
        </Space>
      ),
      onOk: async () => {
        const code = currentCode.trim();
        if (!code) {
          apiMessage.error("Informe o codigo do app autenticador.");
          throw new Error("empty_2fa_code");
        }
        const response = await apiRequest<{ recovery_codes: string[] }>("/auth/2fa/enroll/confirm", {
          method: "POST",
          token,
          body: { code },
        });
        if (!response.ok) {
          apiMessage.error(response.error?.message ?? "Falha ao confirmar ativacao.");
          throw new Error("invalid_2fa_code");
        }
        setTotpEnrollment(null);
        await fetch2FASettings();
        modal.info({
          title: "2FA ativado com sucesso",
          content: (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{(response.data?.recovery_codes ?? []).join("\n")}</pre>
          ),
        });
      },
    });
  }

  function openConflictResolveModal() {
    const payload = lastConflictRequestRef.current;
    if (!payload) {
      apiMessage.warning("Gere um preview de conflito antes de resolver.");
      return;
    }
    let optionId: "apply_proposed" | "keep_current" = "apply_proposed";
    modal.confirm({
      title: "Resolver conflito de permissao",
      okText: "Confirmar resolucao",
      cancelText: "Cancelar",
      content: (
        <Radio.Group
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          defaultValue="apply_proposed"
          onChange={(event) => {
            optionId = event.target.value;
          }}
        >
          <Radio value="apply_proposed">Aplicar efeito proposto</Radio>
          <Radio value="keep_current">Manter estado atual</Radio>
        </Radio.Group>
      ),
      onOk: async () => {
        const response = await apiRequest("/permissions/conflicts/resolve", {
          method: "POST",
          token,
          body: { ...payload, option_id: optionId },
        });
        if (!response.ok) {
          apiMessage.error(response.error?.message ?? "Falha ao resolver conflito.");
          throw new Error("conflict_resolve_failed");
        }
        apiMessage.success("Conflito resolvido.");
        await fetchAudit();
      },
    });
  }

  if (!token) {
    return (
      <>
        {contextHolder}
        {modalContextHolder}
        <AuthPanel
          loading={authLoading}
          step={authStep}
          username={username}
          onCredentials={handleCredentials}
          on2fa={handle2fa}
          method={twoFactorMethod}
        />
      </>
    );
  }

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <a
        href="#conteudo-principal"
        style={{
          position: "absolute",
          left: 8,
          top: 8,
          zIndex: 1000,
          padding: "8px 12px",
          background: "#111",
          color: "#fff",
          borderRadius: 6,
          transform: "translateY(-120%)",
          transition: "transform 0.15s ease",
        }}
        onFocus={(event) => {
          event.currentTarget.style.transform = "translateY(0)";
        }}
        onBlur={(event) => {
          event.currentTarget.style.transform = "translateY(-120%)";
        }}
      >
        Ir para o conteudo principal
      </a>
      <Layout style={{ minHeight: "100vh" }}>
        <Sider theme="dark" width={248} breakpoint="lg" collapsedWidth={0}>
          <div style={{ color: "#F4F0ED", fontWeight: 700, padding: "18px 18px 8px" }}>BlackBeans System</div>
          <nav aria-label="Navegacao principal">
            <Menu theme="dark" mode="inline" selectedKeys={[activeKey]} onClick={(item) => setActiveKey(item.key)} items={menuItems} />
          </nav>
        </Sider>
        <Layout>
          <Header
            style={{
              background: "#FFFFFF",
              borderBottom: "1px solid #E8E8E8",
              paddingInline: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography.Title level={4} style={{ margin: 0 }}>
              Operacao BlackBeans
            </Typography.Title>
            <Space>
              <Badge count={unreadCount} size="small">
                <Button
                  type="text"
                  aria-label={`Notificacoes, ${unreadCount} nao lidas`}
                  icon={<BellOutlined />}
                  onClick={() => setActiveKey("notifications")}
                />
              </Badge>
              <Button type="text" aria-label="Renovar sessao JWT" icon={<SettingOutlined />} onClick={refreshSession}>
                Renovar sessao
              </Button>
              <Button danger type="text" aria-label="Encerrar sessao" icon={<LogoutOutlined />} onClick={handleLogout}>
                Sair
              </Button>
            </Space>
          </Header>
          <Content id="conteudo-principal" tabIndex={-1} style={{ padding: 24 }}>
            <Spin spinning={false}>
              <>
                {globalError && (
                  <Alert
                    type="error"
                    showIcon
                    closable
                    onClose={() => setGlobalError(null)}
                    style={{ marginBottom: 16 }}
                    title={globalError}
                  />
                )}
                {activeKey === "dashboard" && (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card title="Estado da API">
                        {health.ok ? (
                          <Space wrap>
                            <Tag color={health.status === "ok" ? "success" : "warning"}>{health.status?.toUpperCase()}</Tag>
                            <Typography.Text>Timestamp: {health.timestamp}</Typography.Text>
                            {Object.entries(health.checks ?? {}).map(([key, value]) => (
                              <Tag color={value === "ok" ? "success" : "error"} key={key}>
                                {key}:{value}
                              </Tag>
                            ))}
                          </Space>
                        ) : (
                          <Alert type="error" showIcon title={health.message ?? "Falha ao consultar a API."} />
                        )}
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Notificacoes">
                        <Typography.Text strong>{unreadCount}</Typography.Text>
                        <Typography.Text type="secondary"> nao lidas</Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
                          Atualizacao por polling e refresh de sessao.
                        </Typography.Paragraph>
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Auditoria (visao geral)">
                        <Typography.Paragraph style={{ marginBottom: 6 }}>
                          Total de logs: {String(auditOverview.total_logs ?? "-")}
                        </Typography.Paragraph>
                        <Typography.Paragraph style={{ marginBottom: 0 }}>
                          Falhas: {String(auditOverview.failures ?? "-")}
                        </Typography.Paragraph>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "tasks" && (
                  <Card title="Minhas tarefas">
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Select
                        value={taskStatusFilter}
                        onChange={(value) => setTaskStatusFilter(value)}
                        style={{ minWidth: 180 }}
                        options={[
                          { value: "all", label: "Todos os status" },
                          { value: "todo", label: "Todo" },
                          { value: "in_progress", label: "In Progress" },
                          { value: "blocked", label: "Blocked" },
                          { value: "done", label: "Done" },
                        ]}
                      />
                      <Input
                        placeholder="Buscar por titulo"
                        value={taskSearchFilter}
                        onChange={(event) => setTaskSearchFilter(event.target.value)}
                        style={{ width: 260 }}
                      />
                      <Tag color="processing">{filteredTasks.length} tarefas visiveis</Tag>
                    </Space>
                    <Table<TaskItem>
                      rowKey="id"
                      dataSource={filteredTasks}
                      pagination={{ pageSize: 8 }}
                      onRow={(record) => ({ onClick: () => openTask(record) })}
                      columns={[
                        { title: "Titulo", dataIndex: "title" },
                        { title: "Status", dataIndex: "status", render: (v: string) => <Tag>{v}</Tag> },
                        { title: "Prioridade", dataIndex: "priority" },
                        { title: "Prazo", dataIndex: "end_date", render: (v: string | null) => formatDate(v) },
                      ]}
                    />
                  </Card>
                )}

                {activeKey === "profile" && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Card title="Perfil do usuario">
                        {profileResult ? (
                          <Space orientation="vertical" style={{ width: "100%" }}>
                            <Typography.Text strong>{String(profileResult.display_name ?? "-")}</Typography.Text>
                            <Typography.Text type="secondary">Cargo: {String(profileResult.job_title ?? "-")}</Typography.Text>
                            <Typography.Text type="secondary">Email: {String(profileResult.professional_email ?? "-")}</Typography.Text>
                            <Typography.Text type="secondary">Telefone: {String(profileResult.phone ?? "-")}</Typography.Text>
                          </Space>
                        ) : (
                          <Alert
                            type="info"
                            showIcon
                            title="Sem perfil de colaborador vinculado. O login funciona normalmente, mas o perfil detalhado depende do vinculo."
                          />
                        )}
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Autenticacao de Dois Fatores (2FA)">
                        <Space orientation="vertical" style={{ width: "100%" }}>
                          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            Fluxo correto: primeiro voce ativa no perfil (QR code), depois o login passa a exigir codigo do app autenticador.
                          </Typography.Paragraph>
                          <Space wrap>
                            <Tag color={totpSettings?.totp_enabled ? "success" : "default"}>
                              2FA ativo: {String(Boolean(totpSettings?.totp_enabled))}
                            </Tag>
                            <Tag>Recovery codes: {totpSettings?.recovery_codes_count ?? 0}</Tag>
                          </Space>
                          <Space wrap>
                            <Button
                              type="primary"
                              onClick={async () => {
                                const response = await apiRequest<{ manual_entry_key: string; otpauth_uri: string }>(
                                  "/auth/2fa/enroll/start",
                                  { method: "POST", token, body: {} },
                                );
                                if (!response.ok) {
                                  apiMessage.error(response.error?.message ?? "Falha ao iniciar ativacao.");
                                  return;
                                }
                                setTotpEnrollment({
                                  manual_entry_key: response.data?.manual_entry_key ?? "",
                                  otpauth_uri: response.data?.otpauth_uri ?? "",
                                });
                                apiMessage.success("Ativacao iniciada.");
                                open2FASetupModal({
                                  manual_entry_key: response.data?.manual_entry_key ?? "",
                                  otpauth_uri: response.data?.otpauth_uri ?? "",
                                });
                              }}
                            >
                              Iniciar ativacao por QR
                            </Button>
                            <Button
                              danger
                              onClick={async () => {
                                openTextInputModal({
                                  title: "Desativar 2FA",
                                  placeholder: "Codigo do app ou recovery code",
                                  okText: "Desativar",
                                  onSubmit: async (code) => {
                                    const response = await apiRequest("/auth/2fa/disable", {
                                      method: "POST",
                                      token,
                                      body: { code },
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao desativar.");
                                      throw new Error("disable_2fa_failed");
                                    }
                                    setTotpEnrollment(null);
                                    await fetch2FASettings();
                                    apiMessage.success("2FA desativado.");
                                  },
                                });
                              }}
                            >
                              Desativar 2FA
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "notifications" && (
                  <Card title="Central de notificacoes">
                    <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                      {notifications.map((item) => (
                        <Card key={item.id} size="small">
                          <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                            <Space>
                              <Typography.Text strong>{item.title}</Typography.Text>
                              <Tag color={item.is_read ? "default" : "processing"}>{item.is_read ? "Lida" : "Nova"}</Tag>
                            </Space>
                            {!item.is_read ? (
                              <Button size="small" onClick={() => markNotificationAsRead(item.id)}>
                                Marcar como lida
                              </Button>
                            ) : null}
                          </Space>
                          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
                            {item.message} - {formatDate(item.created_at)}
                          </Typography.Paragraph>
                        </Card>
                      ))}
                    </Space>
                  </Card>
                )}

                {activeKey === "governance" && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Card title="Matriz de permissoes">
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            const response = await apiRequest<Record<string, unknown>>(
                              `/permissions/matrix?workspace_id=${values.workspace_id}`,
                              { token },
                            );
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Erro ao consultar matriz.");
                              return;
                            }
                            setGovernanceResult(response.data ?? null);
                          }}
                        >
                          <Form.Item name="workspace_id" label="Workspace" rules={[{ required: true }]}>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Selecione o workspace"
                              options={workspaces.map((row) => ({
                                value: String(row.id),
                                label: String(row.name ?? row.id),
                              }))}
                            />
                          </Form.Item>
                          <Button htmlType="submit" type="primary">
                            Consultar matriz
                          </Button>
                        </Form>
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Resultado">
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                          {governanceResult ? JSON.stringify(governanceResult, null, 2) : "Sem dados"}
                        </pre>
                      </Card>
                    </Col>
                    <Col xs={24}>
                      <Card title="Conflitos de permissao (preview e resolucao)">
                        <Form
                          layout="vertical"
                          initialValues={{ proposed_effect: "allow", scope_type: "workspace" }}
                          onFinish={async (values) => {
                            const body = {
                              workspace_id: values.workspace_id,
                              context: {
                                subject_type: "user" as const,
                                subject_id: values.subject_id,
                                scope_type: values.scope_type,
                                scope_id: values.scope_id,
                                permission_key: values.permission_key,
                              },
                              proposed: { effect: values.proposed_effect },
                            };
                            const response = await apiRequest<Record<string, unknown>>(
                              "/permissions/conflicts/resolve-preview",
                              { method: "POST", token, body },
                            );
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Erro no preview de conflito.");
                              setConflictPreviewResult(null);
                              lastConflictRequestRef.current = null;
                              return;
                            }
                            lastConflictRequestRef.current = body;
                            setConflictPreviewResult(response.data ?? null);
                            apiMessage.success("Preview calculado.");
                          }}
                        >
                          <Form.Item name="workspace_id" label="Workspace" rules={[{ required: true }]}>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Workspace"
                              options={workspaces.map((row) => ({
                                value: String(row.id),
                                label: String(row.name ?? row.id),
                              }))}
                            />
                          </Form.Item>
                          <Form.Item name="subject_id" label="Usuario (ID)" rules={[{ required: true }]}>
                            <InputNumber min={1} style={{ width: "100%" }} placeholder="Ex.: 1" />
                          </Form.Item>
                          <Form.Item name="scope_type" label="Tipo de escopo" rules={[{ required: true }]}>
                            <Select options={SCOPE_TYPE_OPTIONS} placeholder="Escopo" />
                          </Form.Item>
                          <Form.Item name="scope_id" label="ID do escopo (UUID)" rules={[{ required: true }]}>
                            <Input placeholder="UUID do portfolio, projeto, board ou workspace" />
                          </Form.Item>
                          <Form.Item name="permission_key" label="Permissao" rules={[{ required: true }]}>
                            <Select options={PERMISSION_KEY_OPTIONS} placeholder="Chave" />
                          </Form.Item>
                          <Form.Item name="proposed_effect" label="Efeito proposto" rules={[{ required: true }]}>
                            <Select
                              options={[
                                { value: "allow", label: "allow" },
                                { value: "deny", label: "deny" },
                              ]}
                            />
                          </Form.Item>
                          <Space wrap>
                            <Button htmlType="submit" type="primary">
                              Preview de conflito
                            </Button>
                            <Button onClick={() => openConflictResolveModal()}>Resolver (superuser)</Button>
                          </Space>
                        </Form>
                        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 8 }}>
                          A resolucao exige perfil superuser na API. Use o mesmo formulario: preencha os campos, gere o
                          preview e confirme a resolucao.
                        </Typography.Paragraph>
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                          {conflictPreviewResult ? JSON.stringify(conflictPreviewResult, null, 2) : "Sem preview"}
                        </pre>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "audit" && (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card title="Dashboard de auditoria">
                        <Space wrap style={{ marginBottom: 12 }}>
                          <Button onClick={() => fetchAuditOverview().catch(() => undefined)}>Atualizar visao geral</Button>
                        </Space>
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(auditOverview, null, 2)}</pre>
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="Logs">
                        <Form
                          form={auditLogFilterForm}
                          layout="vertical"
                          onFinish={async (values) => {
                            const sp = new URLSearchParams({ page: "1", page_size: "20" });
                            if (values.workspace_id) sp.set("workspace_id", values.workspace_id);
                            if (values.event_type?.trim()) sp.set("event_type", values.event_type.trim());
                            if (values.actor_id?.trim()) sp.set("actor_id", values.actor_id.trim());
                            await fetchAuditLogs(sp.toString());
                            apiMessage.success("Logs atualizados.");
                          }}
                          initialValues={{ event_type: "", actor_id: "" }}
                        >
                          <Row gutter={16}>
                            <Col xs={24} md={8}>
                              <Form.Item name="workspace_id" label="Workspace">
                                <Select
                                  allowClear
                                  showSearch
                                  optionFilterProp="label"
                                  placeholder="Todos"
                                  options={workspaces.map((row) => ({
                                    value: String(row.id),
                                    label: String(row.name ?? row.id),
                                  }))}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="event_type" label="Tipo de evento (exato)">
                                <Input placeholder="Ex.: workspace.created" allowClear />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="actor_id" label="ID do ator">
                                <Input placeholder="ID numerico do usuario" allowClear />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Space wrap>
                            <Button type="primary" htmlType="submit">
                              Filtrar logs
                            </Button>
                            <Button
                              onClick={() => {
                                auditLogFilterForm.resetFields();
                                fetchAuditLogs().catch(() => undefined);
                              }}
                            >
                              Limpar filtros
                            </Button>
                          </Space>
                        </Form>
                        <Table<Record<string, unknown>>
                          style={{ marginTop: 16 }}
                          rowKey={(record) => String(record.id)}
                          dataSource={auditLogs}
                          pagination={{ pageSize: 8 }}
                          columns={[
                            { title: "Evento", dataIndex: "event_type" },
                            { title: "Acao", dataIndex: "action" },
                            { title: "Entidade", dataIndex: "entity_type" },
                            { title: "Criado em", dataIndex: "created_at", render: (v: string) => formatDate(v) },
                          ]}
                        />
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "stats" && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={8}>
                      <Card title="Workspace stats">
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            const response = await apiRequest<Record<string, unknown>>(`/workspaces/${values.id}/stats`, { token });
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Erro ao carregar stats.");
                              return;
                            }
                            setStatsResult(response.data ?? null);
                          }}
                        >
                          <Form.Item name="id" label="Workspace" rules={[{ required: true }]}>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Selecione"
                              options={workspaces.map((row) => ({
                                value: String(row.id),
                                label: String(row.name ?? row.id),
                              }))}
                            />
                          </Form.Item>
                          <Button htmlType="submit">Consultar</Button>
                        </Form>
                      </Card>
                    </Col>
                    <Col xs={24} lg={8}>
                      <Card title="Portfolio stats">
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            const response = await apiRequest<Record<string, unknown>>(`/portfolios/${values.id}/stats`, { token });
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Erro ao carregar stats.");
                              return;
                            }
                            setStatsResult(response.data ?? null);
                          }}
                        >
                          <Form.Item name="id" label="Portfolio" rules={[{ required: true }]}>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Selecione"
                              options={portfolios.map((row) => ({
                                value: String(row.id),
                                label: String(row.name ?? row.id),
                              }))}
                            />
                          </Form.Item>
                          <Button htmlType="submit">Consultar</Button>
                        </Form>
                      </Card>
                    </Col>
                    <Col xs={24} lg={8}>
                      <Card title="Project stats">
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            const response = await apiRequest<Record<string, unknown>>(`/projects/${values.id}/stats`, { token });
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Erro ao carregar stats.");
                              return;
                            }
                            setStatsResult(response.data ?? null);
                          }}
                        >
                          <Form.Item name="id" label="Projeto" rules={[{ required: true }]}>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Selecione"
                              options={projects.map((row) => ({
                                value: String(row.id),
                                label: String(row.name ?? row.id),
                              }))}
                            />
                          </Form.Item>
                          <Button htmlType="submit">Consultar</Button>
                        </Form>
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="Resultado">
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{statsResult ? JSON.stringify(statsResult, null, 2) : "Sem dados"}</pre>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "projects" && (
                  <Tabs
                    items={[
                      {
                        key: "clients",
                        label: "Clientes",
                        children: (
                          <Row gutter={[16, 16]}>
                            <Col xs={24} lg={8}>
                              <Card title="Novo cliente">
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest<{ client: Record<string, unknown> }>("/clients", {
                                      method: "POST",
                                      token,
                                      body: values,
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao criar cliente.");
                                      return;
                                    }
                                    apiMessage.success("Cliente criado.");
                                    await fetchCrudData();
                                  }}
                                >
                                  <Form.Item name="name" label="Nome" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="description" label="Descricao">
                                    <Input.TextArea rows={3} />
                                  </Form.Item>
                                  <Button type="primary" htmlType="submit">
                                    Criar cliente
                                  </Button>
                                </Form>
                              </Card>
                            </Col>
                            <Col xs={24} lg={16}>
                              <Card title="Clientes cadastrados">
                                <Table<Record<string, unknown>>
                                  rowKey={(record) => String(record.id)}
                                  dataSource={clients}
                                  pagination={{ pageSize: 8 }}
                                  columns={[
                                    { title: "Nome", dataIndex: "name" },
                                    { title: "Status", dataIndex: "status", render: (value: string) => <Tag>{value}</Tag> },
                                    { title: "Atualizado", dataIndex: "updated_at", render: (value: string) => formatDate(value) },
                                    {
                                      title: "Acoes",
                                      render: (record: Record<string, unknown>) => (
                                        <Space>
                                          <Button
                                            size="small"
                                            onClick={async () => {
                                              openTextInputModal({
                                                title: "Editar cliente",
                                                initialValue: String(record.name ?? ""),
                                                placeholder: "Novo nome do cliente",
                                                onSubmit: async (nextName) => {
                                                  await patchEntity(`/clients/${String(record.id)}`, { name: nextName }, "Cliente atualizado.");
                                                },
                                              });
                                            }}
                                          >
                                            Editar
                                          </Button>
                                          <Button
                                            size="small"
                                            onClick={async () => {
                                              const response = await apiRequest(`/clients/${String(record.id)}/status-toggle`, {
                                                method: "POST",
                                                token,
                                                body: {},
                                              });
                                              if (!response.ok) {
                                                apiMessage.error(response.error?.message ?? "Falha ao alterar status.");
                                                return;
                                              }
                                              apiMessage.success("Status do cliente atualizado.");
                                              await fetchCrudData();
                                            }}
                                          >
                                            Ativar/Inativar
                                          </Button>
                                        </Space>
                                      ),
                                    },
                                  ]}
                                />
                              </Card>
                            </Col>
                          </Row>
                        ),
                      },
                      {
                        key: "operations",
                        label: "Operacoes",
                        children: (
                          <Row gutter={[16, 16]}>
                            <Col xs={24} lg={8}>
                              <Card title="Novo workspace">
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest("/workspaces", { method: "POST", token, body: values });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao criar workspace.");
                                      return;
                                    }
                                    apiMessage.success("Workspace criado.");
                                    await fetchCrudData();
                                  }}
                                >
                                  <Form.Item name="name" label="Nome" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="client_id" label="Client ID">
                                    <Select
                                      allowClear
                                      showSearch
                                      optionFilterProp="label"
                                      options={clients.map((client) => ({
                                        value: String(client.id),
                                        label: `${String(client.name)} (${String(client.id).slice(0, 8)})`,
                                      }))}
                                    />
                                  </Form.Item>
                                  <Button htmlType="submit">Criar workspace</Button>
                                </Form>
                              </Card>
                            </Col>
                            <Col xs={24} lg={8}>
                              <Card title="Novo portfolio">
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest("/portfolios", { method: "POST", token, body: values });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao criar portfolio.");
                                      return;
                                    }
                                    apiMessage.success("Portfolio criado.");
                                    await fetchCrudData();
                                  }}
                                >
                                  <Form.Item name="name" label="Nome" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="workspace_id" label="Workspace" rules={[{ required: true }]}>
                                    <Select
                                      showSearch
                                      optionFilterProp="label"
                                      options={workspaces.map((workspace) => ({
                                        value: String(workspace.id),
                                        label: `${String(workspace.name)} (${String(workspace.id).slice(0, 8)})`,
                                      }))}
                                    />
                                  </Form.Item>
                                  <Button htmlType="submit">Criar portfolio</Button>
                                </Form>
                              </Card>
                            </Col>
                            <Col xs={24} lg={8}>
                              <Card title="Novo projeto">
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest("/projects", { method: "POST", token, body: values });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao criar projeto.");
                                      return;
                                    }
                                    apiMessage.success("Projeto criado.");
                                    await fetchCrudData();
                                  }}
                                >
                                  <Form.Item name="name" label="Nome" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="portfolio_id" label="Portfolio" rules={[{ required: true }]}>
                                    <Select
                                      showSearch
                                      optionFilterProp="label"
                                      options={portfolios.map((portfolio) => ({
                                        value: String(portfolio.id),
                                        label: `${String(portfolio.name)} (${String(portfolio.id).slice(0, 8)})`,
                                      }))}
                                    />
                                  </Form.Item>
                                  <Form.Item name="client_id" label="Cliente">
                                    <Select
                                      allowClear
                                      showSearch
                                      optionFilterProp="label"
                                      options={clients.map((client) => ({
                                        value: String(client.id),
                                        label: `${String(client.name)} (${String(client.id).slice(0, 8)})`,
                                      }))}
                                    />
                                  </Form.Item>
                                  <Button type="primary" htmlType="submit">
                                    Criar projeto
                                  </Button>
                                </Form>
                              </Card>
                            </Col>
                            <Col xs={24}>
                              <Card title="Resumo">
                                <Space wrap>
                                  <Tag>Workspaces: {workspaces.length}</Tag>
                                  <Tag>Portfolios: {portfolios.length}</Tag>
                                  <Tag>Projetos: {projects.length}</Tag>
                                </Space>
                                <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
                                  <Col xs={24} lg={8}>
                                    <Card size="small" title="Workspaces">
                                      <Table<Record<string, unknown>>
                                        size="small"
                                        rowKey={(record) => String(record.id)}
                                        dataSource={workspaces}
                                        pagination={{ pageSize: 5 }}
                                        columns={[
                                          { title: "Nome", dataIndex: "name" },
                                          {
                                            title: "Acoes",
                                            render: (record: Record<string, unknown>) => (
                                              <Space>
                                                <Button
                                                  size="small"
                                                  onClick={async () => {
                                                    openTextInputModal({
                                                      title: "Editar workspace",
                                                      initialValue: String(record.name ?? ""),
                                                      placeholder: "Novo nome do workspace",
                                                      onSubmit: async (nextName) => {
                                                        await patchEntity(
                                                          `/workspaces/${String(record.id)}`,
                                                          { name: nextName },
                                                          "Workspace atualizado.",
                                                        );
                                                      },
                                                    });
                                                  }}
                                                >
                                                  Editar
                                                </Button>
                                                <Button
                                                  size="small"
                                                  danger
                                                  onClick={async () => {
                                                    openDeleteConfirmModal({
                                                      title: "Confirma exclusao do workspace?",
                                                      onConfirm: async () => {
                                                        await deleteEntity(
                                                          `/workspaces/${String(record.id)}`,
                                                          "Workspace removido.",
                                                        );
                                                      },
                                                    });
                                                  }}
                                                >
                                                  Excluir
                                                </Button>
                                              </Space>
                                            ),
                                          },
                                        ]}
                                      />
                                    </Card>
                                  </Col>
                                  <Col xs={24} lg={8}>
                                    <Card size="small" title="Portfolios">
                                      <Table<Record<string, unknown>>
                                        size="small"
                                        rowKey={(record) => String(record.id)}
                                        dataSource={portfolios}
                                        pagination={{ pageSize: 5 }}
                                        columns={[
                                          { title: "Nome", dataIndex: "name" },
                                          {
                                            title: "Acoes",
                                            render: (record: Record<string, unknown>) => (
                                              <Space>
                                                <Button
                                                  size="small"
                                                  onClick={async () => {
                                                    openTextInputModal({
                                                      title: "Editar portfolio",
                                                      initialValue: String(record.name ?? ""),
                                                      placeholder: "Novo nome do portfolio",
                                                      onSubmit: async (nextName) => {
                                                        await patchEntity(
                                                          `/portfolios/${String(record.id)}`,
                                                          { name: nextName },
                                                          "Portfolio atualizado.",
                                                        );
                                                      },
                                                    });
                                                  }}
                                                >
                                                  Editar
                                                </Button>
                                                <Button
                                                  size="small"
                                                  danger
                                                  onClick={async () => {
                                                    openDeleteConfirmModal({
                                                      title: "Confirma exclusao do portfolio?",
                                                      onConfirm: async () => {
                                                        await deleteEntity(
                                                          `/portfolios/${String(record.id)}`,
                                                          "Portfolio removido.",
                                                        );
                                                      },
                                                    });
                                                  }}
                                                >
                                                  Excluir
                                                </Button>
                                              </Space>
                                            ),
                                          },
                                        ]}
                                      />
                                    </Card>
                                  </Col>
                                  <Col xs={24} lg={8}>
                                    <Card size="small" title="Projetos">
                                      <Table<Record<string, unknown>>
                                        size="small"
                                        rowKey={(record) => String(record.id)}
                                        dataSource={projects}
                                        pagination={{ pageSize: 5 }}
                                        columns={[
                                          { title: "Nome", dataIndex: "name" },
                                          { title: "Status", dataIndex: "status", render: (value: string) => <Tag>{value}</Tag> },
                                          {
                                            title: "Acoes",
                                            render: (record: Record<string, unknown>) => (
                                              <Space>
                                                <Button
                                                  size="small"
                                                  onClick={async () => {
                                                    openTextInputModal({
                                                      title: "Editar projeto",
                                                      initialValue: String(record.name ?? ""),
                                                      placeholder: "Novo nome do projeto",
                                                      onSubmit: async (nextName) => {
                                                        await patchEntity(
                                                          `/projects/${String(record.id)}`,
                                                          { name: nextName },
                                                          "Projeto atualizado.",
                                                        );
                                                      },
                                                    });
                                                  }}
                                                >
                                                  Editar
                                                </Button>
                                                <Button
                                                  size="small"
                                                  onClick={async () => {
                                                    openTextInputModal({
                                                      title: "Atualizar status do projeto",
                                                      initialValue: String(record.status ?? "planning"),
                                                      placeholder: "planning|active|at_risk|completed|cancelled",
                                                      onSubmit: async (nextStatus) => {
                                                        const response = await apiRequest(`/projects/${String(record.id)}/status`, {
                                                          method: "PATCH",
                                                          token,
                                                          body: { status: nextStatus },
                                                        });
                                                        if (!response.ok) {
                                                          apiMessage.error(response.error?.message ?? "Falha ao atualizar status.");
                                                          throw new Error("project_status_failed");
                                                        }
                                                        apiMessage.success("Status do projeto atualizado.");
                                                        await fetchCrudData();
                                                      },
                                                    });
                                                  }}
                                                >
                                                  Status
                                                </Button>
                                                <Button
                                                  size="small"
                                                  danger
                                                  onClick={async () => {
                                                    openDeleteConfirmModal({
                                                      title: "Confirma exclusao do projeto?",
                                                      onConfirm: async () => {
                                                        await deleteEntity(`/projects/${String(record.id)}`, "Projeto removido.");
                                                      },
                                                    });
                                                  }}
                                                >
                                                  Excluir
                                                </Button>
                                              </Space>
                                            ),
                                          },
                                        ]}
                                      />
                                    </Card>
                                  </Col>
                                </Row>
                              </Card>
                            </Col>
                          </Row>
                        ),
                      },
                      {
                        key: "kanban",
                        label: "Kanban",
                        children: (
                          <Row gutter={[16, 16]}>
                            <Col xs={24} lg={8}>
                              <Card title="Configurar board">
                                <Space orientation="vertical" style={{ width: "100%" }}>
                                  <Form
                                    layout="vertical"
                                    onFinish={async (values) => {
                                      const response = await apiRequest("/boards", { method: "POST", token, body: values });
                                      if (!response.ok) {
                                        apiMessage.error(response.error?.message ?? "Falha ao criar board.");
                                        return;
                                      }
                                      apiMessage.success("Board criado.");
                                      await fetchBoards();
                                    }}
                                  >
                                    <Form.Item name="project_id" label="Projeto" rules={[{ required: true }]}>
                                      <Select
                                        showSearch
                                        optionFilterProp="label"
                                        options={projects.map((project) => ({
                                          value: String(project.id),
                                          label: `${String(project.name)} (${String(project.id).slice(0, 8)})`,
                                        }))}
                                      />
                                    </Form.Item>
                                    <Form.Item name="name" label="Nome do board" rules={[{ required: true }]}>
                                      <Input placeholder="Ex.: Board principal" />
                                    </Form.Item>
                                    <Button htmlType="submit">Criar board</Button>
                                  </Form>

                                  <Form
                                    layout="vertical"
                                    onFinish={async (values) => {
                                      if (!selectedBoardId) {
                                        apiMessage.error("Selecione um board antes de criar grupo.");
                                        return;
                                      }
                                      const response = await apiRequest(`/boards/${selectedBoardId}/groups`, {
                                        method: "POST",
                                        token,
                                        body: values,
                                      });
                                      if (!response.ok) {
                                        apiMessage.error(response.error?.message ?? "Falha ao criar grupo.");
                                        return;
                                      }
                                      apiMessage.success("Grupo criado.");
                                      await fetchKanban(selectedBoardId);
                                    }}
                                  >
                                    <Form.Item name="name" label="Novo grupo" rules={[{ required: true }]}>
                                      <Input placeholder="Ex.: Em andamento" />
                                    </Form.Item>
                                    <Form.Item name="wip_limit" label="WIP limit" rules={[{ required: true }]}>
                                      <Input type="number" min={1} />
                                    </Form.Item>
                                    <Button htmlType="submit">Criar grupo</Button>
                                  </Form>
                                </Space>
                              </Card>
                            </Col>
                            <Col xs={24} lg={16}>
                              <Card
                                title="Board Kanban"
                                extra={
                                  <Select
                                    style={{ minWidth: 280 }}
                                    placeholder="Selecione um board"
                                    value={selectedBoardId ?? undefined}
                                    onChange={(value) => setSelectedBoardId(value)}
                                    options={boards.map((board) => ({
                                      value: board.id,
                                      label: `${board.name} (${board.id.slice(0, 8)})`,
                                    }))}
                                  />
                                }
                              >
                                {selectedBoardId && (
                                  <Form
                                    layout="inline"
                                    onFinish={async (values) => {
                                      const response = await apiRequest("/tasks", {
                                        method: "POST",
                                        token,
                                        body: values,
                                      });
                                      if (!response.ok) {
                                        apiMessage.error(response.error?.message ?? "Falha ao criar tarefa.");
                                        return;
                                      }
                                      apiMessage.success("Tarefa criada.");
                                      await fetchKanban(selectedBoardId);
                                    }}
                                    style={{ marginBottom: 16 }}
                                  >
                                    <Form.Item name="title" rules={[{ required: true }]}>
                                      <Input placeholder="Nova tarefa" />
                                    </Form.Item>
                                    <Form.Item name="group_id" rules={[{ required: true }]}>
                                      <Select
                                        style={{ minWidth: 200 }}
                                        placeholder="Grupo"
                                        options={kanbanGroups.map((item) => ({
                                          value: item.group.id,
                                          label: item.group.name,
                                        }))}
                                      />
                                    </Form.Item>
                                    <Form.Item name="priority" initialValue="medium">
                                      <Select
                                        style={{ width: 120 }}
                                        options={[
                                          { value: "low", label: "Baixa" },
                                          { value: "medium", label: "Media" },
                                          { value: "high", label: "Alta" },
                                          { value: "critical", label: "Critica" },
                                        ]}
                                      />
                                    </Form.Item>
                                    <Button htmlType="submit" type="primary">
                                      Criar tarefa
                                    </Button>
                                  </Form>
                                )}

                                <Spin spinning={kanbanLoading}>
                                  <Row gutter={[12, 12]} wrap={false} style={{ overflowX: "auto" }}>
                                    {kanbanGroups.map((column) => (
                                      <Col key={column.group.id} flex="0 0 280px">
                                        <Card
                                          size="small"
                                          title={`${column.group.name} (${column.tasks.length})`}
                                          onDragOver={(event) => {
                                            event.preventDefault();
                                          }}
                                          onDrop={async () => {
                                            if (!draggingTaskId) return;
                                            await moveTaskToGroup(draggingTaskId, column.group.id);
                                            setDraggingTaskId(null);
                                          }}
                                          style={{
                                            minHeight: 140,
                                            borderColor: draggingTaskId ? "#d9d9d9" : undefined,
                                          }}
                                        >
                                          <Space orientation="vertical" style={{ width: "100%" }}>
                                            {column.tasks.map((task) => (
                                              <Card
                                                key={task.id}
                                                type="inner"
                                                size="small"
                                                draggable
                                                onDragStart={(event) => {
                                                  event.dataTransfer.setData("text/plain", task.id);
                                                  setDraggingTaskId(task.id);
                                                }}
                                                onDragEnd={() => {
                                                  setDraggingTaskId(null);
                                                }}
                                              >
                                                <Typography.Text strong>{task.title}</Typography.Text>
                                                <div>
                                                  <Tag>{task.status}</Tag>
                                                  <Tag>{task.priority}</Tag>
                                                </div>
                                                <Select
                                                  size="small"
                                                  style={{ width: "100%", marginTop: 8 }}
                                                  value={task.group_id}
                                                  options={kanbanGroups.map((groupOption) => ({
                                                    value: groupOption.group.id,
                                                    label: groupOption.group.name,
                                                  }))}
                                                  onChange={async (nextGroupId) => {
                                                    await moveTaskToGroup(task.id, nextGroupId);
                                                  }}
                                                />
                                              </Card>
                                            ))}
                                          </Space>
                                        </Card>
                                      </Col>
                                    ))}
                                  </Row>
                                </Spin>
                              </Card>
                            </Col>
                          </Row>
                        ),
                      },
                    ]}
                  />
                )}
              </>
            </Spin>
          </Content>
        </Layout>
      </Layout>

      <Drawer
        title={selectedTask ? `Task: ${selectedTask.title}` : "Task"}
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        size="large"
      >
        {selectedTask && (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <Tag>{selectedTask.status}</Tag>
              <Tag>{selectedTask.priority}</Tag>
              <Tag>Prazo: {formatDate(selectedTask.end_date)}</Tag>
            </Space>

            <Space wrap>
              <Button onClick={() => taskAction(`/tasks/${selectedTask.id}/time/start`, "POST", {})}>Start</Button>
              <Button onClick={() => taskAction(`/tasks/${selectedTask.id}/time/pause`, "POST", {})}>Pause</Button>
              <Button onClick={() => taskAction(`/tasks/${selectedTask.id}/time/resume`, "POST", {})}>Resume</Button>
              <Button type="primary" onClick={() => taskAction(`/tasks/${selectedTask.id}/complete`, "POST", {})}>
                Complete
              </Button>
            </Space>

            <Form
              layout="vertical"
              onFinish={(values) => taskAction(`/tasks/${selectedTask.id}/status`, "PATCH", { status: values.status })}
            >
              <Form.Item label="Atualizar status" name="status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "Todo", value: "todo" },
                    { label: "In Progress", value: "in_progress" },
                    { label: "Blocked", value: "blocked" },
                    { label: "Done", value: "done" },
                  ]}
                />
              </Form.Item>
              <Button htmlType="submit">Salvar status</Button>
            </Form>

            <Form
              key={`quick-edit-${selectedTask.id}`}
              layout="vertical"
              onFinish={(values) =>
                taskAction(`/tasks/${selectedTask.id}`, "PATCH", {
                  title: values.title,
                  priority: values.priority,
                  group_id: values.group_id,
                })
              }
              initialValues={{
                title: selectedTask.title,
                priority: selectedTask.priority,
                group_id: selectedTask.group_id,
              }}
            >
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Edicao rapida da tarefa
              </Typography.Title>
              <Form.Item label="Titulo" name="title" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Prioridade" name="priority" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "Baixa", value: "low" },
                    { label: "Media", value: "medium" },
                    { label: "Alta", value: "high" },
                    { label: "Critica", value: "critical" },
                  ]}
                />
              </Form.Item>
              <Form.Item label="Grupo" name="group_id" rules={[{ required: true }]}>
                <Select
                  options={drawerGroups.map((group) => ({
                    label: `${group.name} (WIP ${group.wip_limit})`,
                    value: group.id,
                  }))}
                />
              </Form.Item>
              <Button htmlType="submit">Salvar edicao rapida</Button>
            </Form>

            <Form
              layout="vertical"
              onFinish={(values) => taskAction(`/tasks/${selectedTask.id}/comments`, "POST", { content: values.content })}
            >
              <Form.Item label="Comentario contextual" name="content" rules={[{ required: true }]}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button htmlType="submit">Adicionar comentario</Button>
            </Form>

            <Tabs
              items={[
                {
                  key: "summary",
                  label: "Tempo",
                  children: (
                    <div>
                      <Typography.Paragraph>Total: {secondsToText(taskSummary.total_seconds)}</Typography.Paragraph>
                      <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                        {taskSummary.logs.map((log) => (
                          <Card key={log.id} size="small">
                            <Space orientation="vertical" size={0}>
                              <Typography.Text>
                                {log.status} - {secondsToText(log.total_seconds)}
                              </Typography.Text>
                              <Typography.Text type="secondary">
                                {formatDate(log.started_at)} ate {formatDate(log.ended_at)}
                              </Typography.Text>
                            </Space>
                          </Card>
                        ))}
                      </Space>
                    </div>
                  ),
                },
                {
                  key: "activity",
                  label: "Historico",
                  children: (
                    <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                      {taskActivity.map((item, index) => (
                        <Card key={`${item.event_type}-${item.created_at}-${index}`} size="small">
                          <Space orientation="vertical" size={0}>
                            <Typography.Text>{item.event_type}</Typography.Text>
                            <Typography.Text type="secondary">{item.summary}</Typography.Text>
                            <Typography.Text type="secondary">{formatDate(item.created_at)}</Typography.Text>
                          </Space>
                        </Card>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        )}
      </Drawer>
    </>
  );
}
