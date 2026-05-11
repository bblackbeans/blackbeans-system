"use client";

import {
  AppstoreOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RightOutlined,
  SafetyOutlined,
  SettingOutlined,
  StockOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Affix,
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Grid,
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
  Upload,
  message,
} from "antd";
import type { MenuProps } from "antd";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "@/lib/api";

const { Header, Sider, Content } = Layout;
const AUTH_STORAGE_KEY = "bb_access_token";
const REFRESH_STORAGE_KEY = "bb_refresh_token";
const BOARD_STORAGE_KEY = "bb_selected_board_id";
const TASK_STATUS_FILTER_KEY = "bb_task_status_filter";
const TASK_SEARCH_FILTER_KEY = "bb_task_search_filter";
const STATUS_PALETTE_STORAGE_KEY = "bb_status_palette";
const BRANDING_STORAGE_KEY = "bb_branding_config";
const ADMIN_USERS_STORAGE_KEY = "bb_admin_users_cache";
const ADMIN_USER_META_STORAGE_KEY = "bb_admin_users_meta";
const SELECTED_WORKSPACE_STORAGE_KEY = "bb_selected_workspace_id";
const SELECTED_CLIENT_STORAGE_KEY = "bb_selected_client_id";
const SELECTED_PROJECT_STORAGE_KEY = "bb_selected_project_id";
const PROJECT_SIDEBAR_EXPANDED_KEY = "bb_projects_sidebar_expanded_keys";
const DEFAULT_PORTFOLIO_STORAGE_KEY = "bb_default_portfolio_by_workspace";
const DEFAULT_PORTFOLIO_NAME = "Default";

const PERMISSION_KEY_OPTIONS = (
  [
    ["tasks.read", "Tarefas: leitura"],
    ["tasks.write", "Tarefas: escrita"],
    ["boards.read", "Quadros: leitura"],
    ["boards.write", "Quadros: escrita"],
  ] as const
).map(([value, label]) => ({ value, label }));

const SCOPE_TYPE_OPTIONS = (
  [
    ["workspace", "Area de trabalho"],
    ["portfolio", "Portfolio"],
    ["project", "Projeto"],
    ["board", "Quadro"],
  ] as const
).map(([value, label]) => ({ value, label }));

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
  description: string;
  status: string;
  priority: string;
  effort_points: number;
  assignee_id: number | null;
  start_date: string | null;
  end_date: string | null;
  board_id: string;
  group_id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type TaskActivity = {
  event_type: string;
  summary: string;
  created_at: string;
};

type TaskCommentItem = {
  id: string;
  task_id: string;
  author_id: number;
  content: string;
  created_at: string;
  updated_at?: string;
};

type TimeLog = {
  id: string;
  status: string;
  total_seconds: number;
  started_at: string | null;
  current_started_at?: string | null;
  ended_at: string | null;
  user_id?: number;
  task_id?: string;
};

type AuthStep = "credentials" | "2fa";
type TwoFactorMethod = "challenge" | "totp";
type BoardItem = { id: string; name: string; project_id: string; workspace_id: string };
type GroupItem = { id: string; board_id: string; name: string; position: number; wip_limit: number };
type KanbanGroup = { group: GroupItem; tasks: TaskItem[] };
type TaskDrawerTab = "summary" | "activity" | "comments";
type BoardViewMode = "kanban" | "list" | "timeline";
type MenuKey =
  | "dashboard"
  | "my-work"
  | "tasks"
  | "users"
  | "admin-ops"
  | "status-config"
  | "admin-settings"
  | "profile"
  | "notifications"
  | "governance"
  | "audit"
  | "stats"
  | "projects";

const MENU_KEYS: MenuKey[] = ["dashboard", "my-work", "tasks", "users", "admin-ops", "status-config", "admin-settings", "profile", "notifications", "governance", "audit", "stats", "projects"];
const RESTRICTED_ADMIN_KEYS: MenuKey[] = ["tasks", "users", "admin-ops", "status-config", "admin-settings", "governance", "audit", "stats"];

const DEFAULT_STATUS_META: Record<string, { label: string; color: string }> = {
  todo: { label: "A fazer", color: "default" },
  in_progress: { label: "Em progresso", color: "processing" },
  blocked: { label: "Bloqueada", color: "warning" },
  done: { label: "Concluida", color: "success" },
};
const STATUS_COMPAT_ALIASES: Record<string, string[]> = {
  todo: ["a_fazer", "to_do"],
  in_progress: ["em_progresso", "doing"],
  blocked: ["bloqueada", "bloqueado"],
  done: ["concluida", "concluido", "completed"],
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low: { label: "Baixa", color: "blue" },
  medium: { label: "Media", color: "gold" },
  high: { label: "Alta", color: "volcano" },
  critical: { label: "Critica", color: "red" },
};

function getMenuKeyFromHash(hash: string, fallback: MenuKey = "my-work"): MenuKey {
  const normalized = hash.replace(/^#/, "");
  if (MENU_KEYS.includes(normalized as MenuKey)) {
    return normalized as MenuKey;
  }
  return fallback;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getUserIdFromToken(token: string | null): number | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const raw = payload.user_id ?? payload.sub ?? payload.id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAdminFromToken(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const role = typeof payload.role === "string" ? payload.role.toLowerCase() : "";
  const roles = Array.isArray(payload.roles) ? payload.roles.map((item) => String(item).toLowerCase()) : [];
  return Boolean(
    payload.is_superuser ||
      payload.is_staff ||
      payload.superuser ||
      payload.staff ||
      role === "admin" ||
      role === "superuser" ||
      roles.includes("admin") ||
      roles.includes("superuser"),
  );
}

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

function formatEffortHoursDisplay(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "0 h";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "0 h";
  return `${Number.isInteger(n) ? String(n) : n.toFixed(1)} h`;
}

function normalizeBirthDateInput(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return raw;
  const startsWithYear = Number(digits.slice(0, 4));
  if (startsWithYear >= 1900 && startsWithYear <= 2100) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

function maskBirthDateInput(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseCommentReplyMeta(content: string): { replyToId: string | null; cleanContent: string } {
  const tokenMatch = content.match(/^\[reply_to:([a-f0-9-]{8,36})\]\s*/i);
  if (tokenMatch) {
    return {
      replyToId: tokenMatch[1],
      cleanContent: content.slice(tokenMatch[0].length),
    };
  }
  const legacyMatch = content.match(/^↳\s*resposta para #([a-f0-9]{8})\s*\n?/i);
  if (legacyMatch) {
    return {
      replyToId: legacyMatch[1],
      cleanContent: content.replace(legacyMatch[0], ""),
    };
  }
  return { replyToId: null, cleanContent: content };
}

/** Rotulos PT para nomes de coluna do quadro vindos do banco (ex.: seed em ingles). */
function formatColumnLabel(name: string) {
  const map: Record<string, string> = {
    Todo: "A fazer",
    "In Progress": "Em progresso",
    Done: "Concluida",
    Blocked: "Bloqueada",
  };
  return map[name] ?? name;
}

function formatTimeLogStatus(status: string) {
  const key = String(status).toLowerCase();
  const map: Record<string, string> = {
    active: "Ativa",
    paused: "Pausada",
    completed: "Concluida",
    closed: "Encerrada",
  };
  return map[key] ?? status;
}

function liveTotalSecondsFromSummary(
  totalSeconds: number,
  logs: TimeLog[],
  fetchedAtMs: number,
  nowMs: number,
): number {
  const active = logs.find((log) => String(log.status).toLowerCase() === "active");
  if (!active) return totalSeconds;
  const deltaSeconds = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
  return totalSeconds + deltaSeconds;
}

function renderPriorityTag(value: string) {
  const meta = PRIORITY_META[value] ?? { label: value, color: "default" };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function safeJsonArrayParse(value: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((row) => row && typeof row === "object")) return null;
    return parsed as Record<string, unknown>[];
  } catch {
    return null;
  }
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

type ProjectsSidebarNodeType = "workspace" | "client" | "project" | "board";
type ProjectsSidebarNode = {
  key: string;
  title: string;
  type: ProjectsSidebarNodeType;
  children?: ProjectsSidebarNode[];
};

type ProjectsSidebarTreeProps = {
  data: ProjectsSidebarNode[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onAction: (action: "rename" | "delete", node: ProjectsSidebarNode) => void;
  showActions: boolean;
  level?: number;
};

function ProjectsSidebarTree({
  data,
  expanded,
  onToggle,
  selectedKey,
  onSelect,
  onAction,
  showActions,
  level = 0,
}: ProjectsSidebarTreeProps) {
  return (
    <ul
      role={level === 0 ? "tree" : "group"}
      style={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      {data.map((node) => {
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const isOpen = expanded.has(node.key);
        const isSelected = selectedKey === node.key;
        const Icon =
          node.type === "workspace"
            ? AppstoreOutlined
            : node.type === "client"
              ? TeamOutlined
              : node.type === "project"
                ? FolderOpenOutlined
                : UnorderedListOutlined;
        return (
          <li key={node.key} role="none">
            <div
              role="treeitem"
              aria-expanded={hasChildren ? isOpen : undefined}
              aria-selected={isSelected}
              tabIndex={0}
              className="bb-sidebar-row"
              onClick={() => onSelect(node.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node.key);
                  return;
                }
                if (hasChildren && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
                  event.preventDefault();
                  onToggle(node.key);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
                paddingInlineStart: 8 + level * 16,
                borderRadius: 6,
                color: "#F4F0ED",
                cursor: "pointer",
                background: isSelected ? "rgba(22,119,255,0.22)" : "transparent",
                outline: "none",
              }}
            >
              <span
                role={hasChildren ? "button" : undefined}
                aria-label={hasChildren ? (isOpen ? "Recolher" : "Expandir") : undefined}
                tabIndex={hasChildren ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasChildren) onToggle(node.key);
                }}
                onKeyDown={(event) => {
                  if (!hasChildren) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggle(node.key);
                  }
                }}
                style={{
                  width: 16,
                  height: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: hasChildren ? "rgba(244,240,237,0.7)" : "transparent",
                  cursor: hasChildren ? "pointer" : "default",
                  flex: "0 0 auto",
                }}
              >
                {hasChildren ? (isOpen ? <DownOutlined /> : <RightOutlined />) : null}
              </span>
              <Icon
                style={{
                  color: "rgba(244,240,237,0.85)",
                  fontSize: 14,
                  flex: "0 0 auto",
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 13,
                }}
                title={node.title}
              >
                {node.title}
              </span>
              {showActions ? (
                <span
                  className="bb-sidebar-actions"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  style={{ display: "flex", gap: 2, flex: "0 0 auto" }}
                >
                  <Button
                    type="text"
                    size="small"
                    aria-label="Renomear"
                    icon={
                      <EditOutlined
                        style={{ color: "rgba(244,240,237,0.92)", fontSize: 13 }}
                      />
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      onAction("rename", node);
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    aria-label="Excluir"
                    icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAction("delete", node);
                    }}
                  />
                </span>
              ) : null}
            </div>
            {hasChildren && isOpen ? (
              <ProjectsSidebarTree
                data={node.children ?? []}
                expanded={expanded}
                onToggle={onToggle}
                selectedKey={selectedKey}
                onSelect={onSelect}
                onAction={onAction}
                showActions={showActions}
                level={level + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell() {
  const [hydratedSession, setHydratedSession] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>("challenge");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [activeKey, setActiveKey] = useState<MenuKey>("my-work");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [health, setHealth] = useState<ApiHealthData>({ ok: false, message: "Carregando..." });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [allTasks, setAllTasks] = useState<TaskItem[]>([]);
  const [allTasksLoading, setAllTasksLoading] = useState<boolean>(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>("all");
  const [taskSearchFilter, setTaskSearchFilter] = useState<string>("");
  const [taskPeriodFilter, setTaskPeriodFilter] = useState<string>("this_week");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>("all");
  const [taskProjectFilter, setTaskProjectFilter] = useState<string>("all");
  const [taskBoardFilter, setTaskBoardFilter] = useState<string>("all");
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [taskDrawerTab, setTaskDrawerTab] = useState<TaskDrawerTab>("summary");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [taskAssigneePickList, setTaskAssigneePickList] = useState<Array<{ id: number; name: string; email: string }>>(
    [],
  );
  const [taskComments, setTaskComments] = useState<TaskCommentItem[]>([]);
  const [taskCommentDraft, setTaskCommentDraft] = useState("");
  const [taskCommentReplyTo, setTaskCommentReplyTo] = useState<TaskCommentItem | null>(null);
  const [taskCommentEditingId, setTaskCommentEditingId] = useState<string | null>(null);
  const [taskCommentEditingContent, setTaskCommentEditingContent] = useState("");
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [taskSummary, setTaskSummary] = useState<{ total_seconds: number; logs: TimeLog[] }>({
    total_seconds: 0,
    logs: [],
  });
  const [taskSummaryFetchedAtMs, setTaskSummaryFetchedAtMs] = useState<number>(0);
  const [liveTickMs, setLiveTickMs] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(0);
  const [apiMessage, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [auditLogFilterForm] = Form.useForm();
  const [myWorkQuickCreateForm] = Form.useForm();
  const [profileDetailsForm] = Form.useForm();
  const [manageUserProfileForm] = Form.useForm();
  const [adminOpsCreateUserForm] = Form.useForm();
  const [adminOpsManageProfileForm] = Form.useForm();
  const [statusPaletteForm] = Form.useForm();
  const [adminOpsResult, setAdminOpsResult] = useState<Record<string, unknown> | null>(null);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [collaboratorDashboardHours, setCollaboratorDashboardHours] = useState<{
    today: number;
    week: number;
    month: number;
  }>({ today: 0, week: 0, month: 0 });
  const [boardProgress, setBoardProgress] = useState<Record<string, unknown> | null>(null);

  const [auditOverview, setAuditOverview] = useState<Record<string, unknown>>({});
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [statsResult, setStatsResult] = useState<Record<string, unknown> | null>(null);
  const [governanceResult, setGovernanceResult] = useState<Record<string, unknown> | null>(null);
  const [bulkPreviewId, setBulkPreviewId] = useState<string | null>(null);
  const [bulkPermissionItemsText, setBulkPermissionItemsText] = useState<string>(
    JSON.stringify(
      [
        {
          subject_type: "user",
          subject_id: 1,
          scope_type: "workspace",
          scope_id: "00000000-0000-0000-0000-000000000000",
          permission_key: "tasks.read",
          effect: "allow",
        },
      ],
      null,
      2,
    ),
  );
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
  const [boardGroupsIndex, setBoardGroupsIndex] = useState<Record<string, GroupItem>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [boardKanbanByBoardId, setBoardKanbanByBoardId] = useState<Record<string, KanbanGroup[]>>({});
  const [boardViewModeByBoardId, setBoardViewModeByBoardId] = useState<Record<string, BoardViewMode>>({});
  const [boardListTasksByBoardId, setBoardListTasksByBoardId] = useState<Record<string, TaskItem[]>>({});
  const [boardKanbanLoading, setBoardKanbanLoading] = useState<Record<string, boolean>>({});
  const [composeBoardId, setComposeBoardId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverBoardId, setDragOverBoardId] = useState<string | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [editWorkspaceOpen, setEditWorkspaceOpen] = useState(false);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createWorkspaceForm] = Form.useForm();
  const [editWorkspaceForm] = Form.useForm();
  const [createClientForm] = Form.useForm();
  const [createProjectForm] = Form.useForm();
  const [createBoardForm] = Form.useForm();
  const [createGroupForm] = Form.useForm();
  const [createTaskForm] = Form.useForm();
  const [kanbanGroups, setKanbanGroups] = useState<KanbanGroup[]>([]);
  const [boardViewMode] = useState<BoardViewMode>("list");
  const [usersTabKey, setUsersTabKey] = useState<string>("u-list-page");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [selectedTaskIdsByBoardId, setSelectedTaskIdsByBoardId] = useState<Record<string, string[]>>({});
  const [bulkMoveTargetGroupByBoardId, setBulkMoveTargetGroupByBoardId] = useState<Record<string, string>>({});
  const [bulkMoveGlobalTargetByProjectId, setBulkMoveGlobalTargetByProjectId] = useState<Record<string, string>>({});
  const [projectSidebarExpandedKeys, setProjectSidebarExpandedKeys] = useState<string[]>([]);
  const [myWorkPriorityFilter, setMyWorkPriorityFilter] = useState<string>("all");
  const [myWorkDeadlineFilter, setMyWorkDeadlineFilter] = useState<string>("all");
  const [myWorkPeriodFilter, setMyWorkPeriodFilter] = useState<string>("all");
  const [taskTimeSummaryByTaskId, setTaskTimeSummaryByTaskId] = useState<
    Record<string, { total_seconds: number; logs: TimeLog[]; fetchedAtMs: number }>
  >({});
  const [taskTimeTickMs, setTaskTimeTickMs] = useState(0);
  const [totpSettings, setTotpSettings] = useState<{
    totp_enabled: boolean;
    has_pending_enrollment: boolean;
    recovery_codes_count: number;
  } | null>(null);
  const [, setTotpEnrollment] = useState<{
    manual_entry_key: string;
    otpauth_uri: string;
  } | null>(null);
  const [statusPalette, setStatusPalette] = useState<Record<string, { label: string; color: string }>>(DEFAULT_STATUS_META);
  const [brandingConfig, setBrandingConfig] = useState<{ app_name: string; logo_url: string }>({
    app_name: "BlackBeans System",
    logo_url: "",
  });
  const [profileAvatarDataUrl, setProfileAvatarDataUrl] = useState<string>("");
  const [meWorkspaceAccess, setMeWorkspaceAccess] = useState<{ all: boolean; workspace_ids: string[] } | null>(null);
  const [adminUsersCache, setAdminUsersCache] = useState<
    Array<{ id: number; name: string; email: string; type: "admin" | "collaborador"; birth_date: string }>
  >([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const isAdmin = useMemo(() => {
    if (getAdminFromToken(token)) return true;
    if (profileResult?.is_staff || profileResult?.is_superuser) return true;
    const profileHint = `${String(profileResult?.professional_email ?? "")} ${String(profileResult?.display_name ?? "")} ${String(profileResult?.username ?? "")}`.toLowerCase();
    return profileHint.includes("admin");
  }, [profileResult, token]);
  const isSuperuser = Boolean(profileResult?.is_superuser);
  const screens = Grid.useBreakpoint();
  const isCompactNav = screens.lg !== true;
  const menuItems = useMemo<NonNullable<MenuProps["items"]>>(
    () => {
      if (!isAdmin) {
        return [
          { key: "dashboard", icon: <AppstoreOutlined />, label: "Dashboard" },
          { key: "my-work", icon: <UnorderedListOutlined />, label: "Meu trabalho" },
          { key: "projects", icon: <FolderOpenOutlined />, label: "Projetos" },
        ];
      }
      const base: NonNullable<MenuProps["items"]> = [
        { key: "my-work", icon: <UnorderedListOutlined />, label: "Meu trabalho" },
        { key: "tasks", icon: <UnorderedListOutlined />, label: "Tarefas" },
        { key: "projects", icon: <FolderOpenOutlined />, label: "Projetos" },
      ];
      return [
        ...base,
        { type: "divider" },
        {
          key: "admin-root",
          icon: <SettingOutlined />,
          label: "Administracao",
          children: [
            { key: "users", icon: <TeamOutlined />, label: "Usuarios" },
            { key: "admin-settings", icon: <SettingOutlined />, label: "Configuracoes admin" },
            { key: "status-config", icon: <CheckCircleOutlined />, label: "Status globais" },
            { key: "admin-ops", icon: <SettingOutlined />, label: "Operacoes admin" },
            { key: "governance", icon: <SafetyOutlined />, label: "Governanca" },
            { key: "audit", icon: <HistoryOutlined />, label: "Auditoria" },
            { key: "stats", icon: <StockOutlined />, label: "Estatisticas" },
          ],
        },
      ];
    },
    [isAdmin],
  );
  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  );
  const boardById = useMemo(
    () =>
      boards.reduce<Record<string, BoardItem>>((acc, board) => {
        acc[board.id] = board;
        return acc;
      }, {}),
    [boards],
  );
  const projectNameById = useMemo(
    () =>
      projects.reduce<Record<string, string>>((acc, project) => {
        const key = String(project.id ?? "");
        if (key) acc[key] = String(project.name ?? key);
        return acc;
      }, {}),
    [projects],
  );
  const activeTimeLog = useMemo(
    () => taskSummary.logs.find((log) => String(log.status).toLowerCase() === "active") ?? null,
    [taskSummary.logs],
  );
  const pausedTimeLog = useMemo(
    () => taskSummary.logs.find((log) => String(log.status).toLowerCase() === "paused") ?? null,
    [taskSummary.logs],
  );
  const liveTaskTotalSeconds = useMemo(() => {
    if (!activeTimeLog) {
      return taskSummary.total_seconds;
    }
    const deltaSeconds = Math.max(0, Math.floor((liveTickMs - taskSummaryFetchedAtMs) / 1000));
    return taskSummary.total_seconds + deltaSeconds;
  }, [activeTimeLog, liveTickMs, taskSummary.total_seconds, taskSummaryFetchedAtMs]);
  const currentUserId = useMemo(() => getUserIdFromToken(token), [token]);
  const currentUserIdentity = useMemo(() => {
    const displayNameRaw =
      profileResult?.display_name ??
      profileResult?.full_name ??
      profileResult?.name ??
      profileResult?.professional_email ??
      profileResult?.email;
    const displayName =
      typeof displayNameRaw === "string" && displayNameRaw.trim().length > 0
        ? displayNameRaw.trim()
        : currentUserId
          ? `Usuario ${currentUserId}`
          : "-";
    const avatarRaw = profileResult?.avatar_url ?? profileResult?.photo_url ?? profileResult?.image_url;
    const avatarUrl = typeof avatarRaw === "string" && avatarRaw.trim().length > 0 ? avatarRaw : null;
    const initial = displayName && displayName !== "-" ? displayName.charAt(0).toUpperCase() : "U";
    return { displayName, avatarUrl, initial };
  }, [currentUserId, profileResult]);
  const resolveStatusMeta = useCallback(
    (value: string) => {
      const direct = statusPalette[value];
      if (direct) return direct;
      const aliases = STATUS_COMPAT_ALIASES[value] ?? [];
      for (const alias of aliases) {
        if (statusPalette[alias]) return statusPalette[alias];
      }
      return { label: value, color: "default" };
    },
    [statusPalette],
  );
  const statusOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    Object.entries(statusPalette).forEach(([value, meta]) => {
      options.set(value, { value, label: meta.label });
    });
    Object.keys(DEFAULT_STATUS_META).forEach((key) => {
      if (!options.has(key)) {
        const meta = resolveStatusMeta(key);
        options.set(key, { value: key, label: meta.label });
      }
    });
    return Array.from(options.values());
  }, [resolveStatusMeta, statusPalette]);
  const renderStatusTag = useCallback(
    (value: string) => {
      const meta = resolveStatusMeta(value);
      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
    [resolveStatusMeta],
  );

  const navigateTo = useCallback((nextKey: MenuKey) => {
    const defaultKey: MenuKey = isAdmin ? "my-work" : "dashboard";
    if (!isAdmin && RESTRICTED_ADMIN_KEYS.includes(nextKey)) {
      setActiveKey(defaultKey);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${defaultKey}`);
      }
      return;
    }
    setActiveKey(nextKey);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${nextKey}`);
    }
  }, [isAdmin]);
  const handleMainMenuClick = useCallback(
    (info: Parameters<NonNullable<MenuProps["onClick"]>>[0]) => {
      const key = String(info.key);
      if (!MENU_KEYS.includes(key as MenuKey)) return;
      navigateTo(key as MenuKey);
      setMobileNavOpen(false);
    },
    [navigateTo],
  );
  const accountMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Perfil",
      onClick: () => navigateTo("profile"),
    },
    ...(isAdmin
      ? [
          {
            key: "admin-group",
            type: "group" as const,
            label: "Admin",
            children: [
              {
                key: "admin-refresh",
                icon: <SettingOutlined />,
                label: "Renovar sessao",
                onClick: () => refreshSession(),
              },
              {
                key: "admin-settings",
                icon: <SettingOutlined />,
                label: "Configuracoes admin",
                onClick: () => navigateTo("admin-settings"),
              },
              {
                key: "users",
                icon: <UserOutlined />,
                label: "Usuarios",
                onClick: () => navigateTo("users"),
              },
              {
                key: "status-config",
                icon: <CheckCircleOutlined />,
                label: "Status globais",
                onClick: () => navigateTo("status-config"),
              },
              {
                key: "admin-ops",
                icon: <SettingOutlined />,
                label: "Operacoes admin",
                onClick: () => navigateTo("admin-ops"),
              },
              {
                key: "governance",
                icon: <SafetyOutlined />,
                label: "Governanca",
                onClick: () => navigateTo("governance"),
              },
              {
                key: "audit",
                icon: <HistoryOutlined />,
                label: "Auditoria",
                onClick: () => navigateTo("audit"),
              },
              {
                key: "stats",
                icon: <StockOutlined />,
                label: "Estatisticas",
                onClick: () => navigateTo("stats"),
              },
            ],
          },
        ]
      : []),
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Sair",
      danger: true,
      onClick: () => handleLogout(),
    },
  ];

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = taskStatusFilter === "all" || task.status === taskStatusFilter;
      const normalizedSearch = taskSearchFilter.trim().toLowerCase();
      const matchesSearch = normalizedSearch.length === 0 || task.title.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [taskSearchFilter, taskStatusFilter, tasks]);
  const tasksTabSource = useMemo<TaskItem[]>(() => (isAdmin ? allTasks : tasks), [allTasks, isAdmin, tasks]);
  const tasksTabFiltered = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    const dayOfWeek = now.getDay();
    const startOfWeek = startOfToday - dayOfWeek * 24 * 60 * 60 * 1000;
    const endOfWeek = startOfWeek + 7 * 24 * 60 * 60 * 1000 - 1;
    const sevenDaysFwdMs = nowMs + 7 * 24 * 60 * 60 * 1000;
    const normalizedSearch = taskSearchFilter.trim().toLowerCase();
    return tasksTabSource.filter((task) => {
      if (taskStatusFilter !== "all" && task.status !== taskStatusFilter) return false;
      if (taskPriorityFilter !== "all" && task.priority !== taskPriorityFilter) return false;
      if (normalizedSearch.length > 0 && !task.title.toLowerCase().includes(normalizedSearch)) return false;
      if (taskBoardFilter !== "all" && String(task.board_id ?? "") !== taskBoardFilter) return false;
      if (taskProjectFilter !== "all") {
        const board = task.board_id ? boardById[task.board_id] : null;
        if (!board || String(board.project_id ?? "") !== taskProjectFilter) return false;
      }
      if (taskAssigneeFilter !== "all") {
        if (taskAssigneeFilter === "unassigned") {
          if (task.assignee_id) return false;
        } else if (String(task.assignee_id ?? "") !== taskAssigneeFilter) return false;
      }
      const endMs = task.end_date ? new Date(task.end_date).getTime() : null;
      const isOpen = task.status !== "done";
      switch (taskPeriodFilter) {
        case "all":
          break;
        case "today":
          if (!isOpen || endMs === null || !(endMs >= startOfToday && endMs <= endOfToday)) return false;
          break;
        case "this_week":
          if (!isOpen) return false;
          if (task.status === "in_progress") break;
          if (endMs === null) return false;
          if (!(endMs >= startOfWeek && endMs <= endOfWeek)) return false;
          break;
        case "next_7":
          if (!isOpen || endMs === null || !(endMs >= nowMs && endMs <= sevenDaysFwdMs)) return false;
          break;
        case "overdue":
          if (!isOpen || endMs === null || endMs >= startOfToday) return false;
          break;
        case "no_due":
          if (!isOpen || endMs !== null) return false;
          break;
        case "in_progress":
          if (task.status !== "in_progress") return false;
          break;
        case "done":
          if (task.status !== "done") return false;
          break;
        default:
          break;
      }
      return true;
    });
  }, [
    boardById,
    nowMs,
    taskAssigneeFilter,
    taskBoardFilter,
    taskPeriodFilter,
    taskPriorityFilter,
    taskProjectFilter,
    taskSearchFilter,
    taskStatusFilter,
    tasksTabSource,
  ]);
  const myWorkMetrics = useMemo(() => {
    const total = tasks.length;
    const todo = tasks.filter((task) => task.status === "todo").length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    const done = tasks.filter((task) => task.status === "done").length;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const dueSoon = tasks.filter((task) => {
      if (!task.end_date || task.status === "done") return false;
      const end = new Date(task.end_date).getTime();
      return end >= nowMs && end <= nowMs + sevenDaysMs;
    }).length;
    return { total, todo, inProgress, blocked, done, dueSoon };
  }, [nowMs, tasks]);
  const collaboratorDashboardMetrics = useMemo(() => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStartMs = startOfMonth.getTime();
    const completedThisMonth = tasks.filter((task) => {
      if (task.status !== "done" || !task.updated_at) return false;
      return new Date(task.updated_at).getTime() >= monthStartMs;
    }).length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    const overdue = tasks.filter((task) => {
      if (!task.end_date || task.status === "done") return false;
      return new Date(task.end_date).getTime() < nowMs;
    }).length;
    const dueSoon = tasks.filter((task) => {
      if (!task.end_date || task.status === "done") return false;
      const end = new Date(task.end_date).getTime();
      return end >= nowMs && end <= nowMs + 7 * 24 * 60 * 60 * 1000;
    }).length;
    return { completedThisMonth, inProgress, blocked, overdue, dueSoon };
  }, [nowMs, tasks]);
  const collaboratorUpcomingTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "done" && task.end_date)
        .sort((a, b) => new Date(a.end_date ?? 0).getTime() - new Date(b.end_date ?? 0).getTime())
        .slice(0, 5),
    [tasks],
  );
  const collaboratorRecentDoneTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "done")
        .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
        .slice(0, 5),
    [tasks],
  );
  const myWorkFilteredTasks = useMemo(() => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000 - 1;
    return filteredTasks.filter((task) => {
      const matchesPriority = myWorkPriorityFilter === "all" || task.priority === myWorkPriorityFilter;
      if (!matchesPriority) return false;
      const endMs = task.end_date ? new Date(task.end_date).getTime() : null;
      if (myWorkDeadlineFilter !== "all") {
        if (myWorkDeadlineFilter === "no_due" && endMs !== null) return false;
        if (myWorkDeadlineFilter !== "no_due") {
          if (endMs === null) return false;
          if (myWorkDeadlineFilter === "overdue" && !(endMs < nowMs && task.status !== "done")) return false;
          if (myWorkDeadlineFilter === "due_7" && !(endMs >= nowMs && endMs <= nowMs + sevenDaysMs && task.status !== "done")) return false;
        }
      }
      if (myWorkPeriodFilter !== "all") {
        const isOpen = task.status !== "done";
        if (myWorkPeriodFilter === "no_due") {
          if (!(isOpen && endMs === null)) return false;
        } else if (endMs === null) {
          return false;
        } else if (myWorkPeriodFilter === "today") {
          if (!(isOpen && endMs >= startOfToday && endMs <= endOfToday)) return false;
        } else if (myWorkPeriodFilter === "week") {
          if (!(isOpen && endMs > endOfToday && endMs <= endOfWeek)) return false;
        } else if (myWorkPeriodFilter === "overdue") {
          if (!(isOpen && endMs < startOfToday)) return false;
        }
      }
      return true;
    });
  }, [filteredTasks, myWorkDeadlineFilter, myWorkPeriodFilter, myWorkPriorityFilter, nowMs]);
  const taskTimeSummaryTargets = useMemo(() => {
    const map = new Map<string, TaskItem>();
    if (activeKey === "my-work") {
      myWorkFilteredTasks.forEach((t) => map.set(t.id, t));
    }
    if (activeKey === "tasks" && isAdmin) {
      tasksTabFiltered.forEach((t) => map.set(t.id, t));
    }
    return Array.from(map.values());
  }, [activeKey, isAdmin, myWorkFilteredTasks, tasksTabFiltered]);
  const taskTimeSummaryIdsKey = useMemo(
    () => taskTimeSummaryTargets.map((t) => t.id).sort().join(","),
    [taskTimeSummaryTargets],
  );
  const anyTaskTimeSummaryActive = useMemo(
    () =>
      Object.values(taskTimeSummaryByTaskId).some((row) =>
        row.logs.some((log) => String(log.status).toLowerCase() === "active"),
      ),
    [taskTimeSummaryByTaskId],
  );
  const myWorkOverdueTasks = useMemo(() => {
    return tasks
      .filter((task) => task.end_date && task.status !== "done" && new Date(task.end_date).getTime() < nowMs)
      .sort((a, b) => new Date(a.end_date ?? 0).getTime() - new Date(b.end_date ?? 0).getTime())
      .slice(0, 8);
  }, [nowMs, tasks]);
  const myWorkGrouped = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000 - 1;
    const openTasks = tasks.filter((task) => task.status !== "done");
    const withDue = openTasks.filter((task) => !!task.end_date);
    const noDue = openTasks.filter((task) => !task.end_date);
    const today = withDue.filter((task) => {
      const t = new Date(task.end_date ?? "").getTime();
      return t >= startOfToday && t <= endOfToday;
    });
    const week = withDue.filter((task) => {
      const t = new Date(task.end_date ?? "").getTime();
      return t > endOfToday && t <= endOfWeek;
    });
    const overdue = withDue.filter((task) => new Date(task.end_date ?? "").getTime() < startOfToday);
    return { today, week, overdue, noDue };
  }, [tasks]);
  const visibleWorkspaceIds = useMemo(() => {
    if (isAdmin) return null;
    const ids = new Set<string>();
    tasks.forEach((task) => {
      const board = boardById[task.board_id];
      if (board?.workspace_id) ids.add(String(board.workspace_id));
    });
    if (!meWorkspaceAccess || meWorkspaceAccess.all) {
      return ids;
    }
    meWorkspaceAccess.workspace_ids.forEach((wid) => ids.add(String(wid)));
    return ids;
  }, [boardById, isAdmin, meWorkspaceAccess, tasks]);
  const visibleWorkspaces = useMemo(() => {
    if (!visibleWorkspaceIds) return workspaces;
    return workspaces.filter((row) => visibleWorkspaceIds.has(String(row.id)));
  }, [visibleWorkspaceIds, workspaces]);
  const projectsByWorkspace = useMemo(() => {
    const result: Record<string, Record<string, unknown>[]> = {};
    projects.forEach((project) => {
      const portfolioId = String(project.portfolio_id ?? "");
      const portfolio = portfolios.find((item) => String(item.id) === portfolioId);
      const workspaceId = portfolio ? String(portfolio.workspace_id ?? "") : "";
      if (!workspaceId) return;
      if (!result[workspaceId]) result[workspaceId] = [];
      result[workspaceId].push(project);
    });
    return result;
  }, [portfolios, projects]);
  const clientsForWorkspace = useCallback(
    (workspaceId: string) => {
      const projectsInWs = projectsByWorkspace[workspaceId] ?? [];
      const seenClientIds = new Set<string>();
      projectsInWs.forEach((project) => {
        const clientId = project.client_id ? String(project.client_id) : "";
        if (clientId) seenClientIds.add(clientId);
      });
      return clients.filter((client) => seenClientIds.has(String(client.id)));
    },
    [clients, projectsByWorkspace],
  );
  const projectsForClient = useCallback(
    (workspaceId: string, clientId: string) => {
      const projectsInWs = projectsByWorkspace[workspaceId] ?? [];
      return projectsInWs.filter((project) => String(project.client_id ?? "") === clientId);
    },
    [projectsByWorkspace],
  );
  const boardsForProject = useCallback(
    (projectId: string) => boards.filter((board) => board.project_id === projectId),
    [boards],
  );
  const selectedWorkspace = useMemo(
    () => (selectedWorkspaceId ? workspaces.find((row) => String(row.id) === selectedWorkspaceId) ?? null : null),
    [selectedWorkspaceId, workspaces],
  );
  const selectedClient = useMemo(
    () => (selectedClientId ? clients.find((row) => String(row.id) === selectedClientId) ?? null : null),
    [clients, selectedClientId],
  );
  const selectedProject = useMemo(
    () => (selectedProjectId ? projects.find((row) => String(row.id) === selectedProjectId) ?? null : null),
    [projects, selectedProjectId],
  );
  const projectSidebarTreeData = useMemo<ProjectsSidebarNode[]>(() => {
    return visibleWorkspaces.map((workspace) => {
      const workspaceId = String(workspace.id);
      return {
        key: `ws:${workspaceId}`,
        title: String(workspace.name ?? "Area de trabalho"),
        type: "workspace",
        children: clientsForWorkspace(workspaceId).map((client) => {
          const clientId = String(client.id);
          return {
            key: `cl:${clientId}`,
            title: String(client.name ?? "Cliente"),
            type: "client",
            children: projectsForClient(workspaceId, clientId).map((project) => {
              const projectId = String(project.id);
              return {
                key: `pr:${projectId}`,
                title: String(project.name ?? "Projeto"),
                type: "project",
                children: boardsForProject(projectId).map((board) => ({
                  key: `bd:${board.id}`,
                  title: String(board.name ?? "Quadro"),
                  type: "board" as const,
                })),
              };
            }),
          };
        }),
      };
    });
  }, [boardsForProject, clientsForWorkspace, projectsForClient, visibleWorkspaces]);
  const projectSidebarAncestorMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    const walk = (nodes: ProjectsSidebarNode[], ancestors: string[]) => {
      for (const node of nodes) {
        map[node.key] = ancestors;
        if (node.children && node.children.length > 0) {
          walk(node.children, [...ancestors, node.key]);
        }
      }
    };
    walk(projectSidebarTreeData, []);
    return map;
  }, [projectSidebarTreeData]);
  const selectedProjectSidebarKey = useMemo(() => {
    const ws = selectedWorkspaceId;
    const cl = selectedClientId;
    const pr = selectedProjectId;
    const bd = selectedBoardId;
    if (!ws) return null;
    const clientOk = Boolean(cl && clientsForWorkspace(ws).some((row) => String(row.id) === cl));
    const projectOk = Boolean(
      cl &&
        pr &&
        clientOk &&
        projectsForClient(ws, String(cl)).some((row) => String(row.id) === String(pr)),
    );
    let boardMatchesProject = false;
    if (projectOk && bd) {
      const boardRow = boards.find((item) => item.id === bd);
      boardMatchesProject = Boolean(boardRow?.project_id === pr);
    }
    if (boardMatchesProject && cl && pr && bd) return `bd:${bd}`;
    if (projectOk && cl && pr) return `pr:${pr}`;
    if (clientOk && cl) return `cl:${cl}`;
    return `ws:${ws}`;
  }, [
    boards,
    clientsForWorkspace,
    projectsForClient,
    selectedBoardId,
    selectedClientId,
    selectedProjectId,
    selectedWorkspaceId,
  ]);
  const projectSidebarExpandedKeysSet = useMemo(
    () => new Set(projectSidebarExpandedKeys),
    [projectSidebarExpandedKeys],
  );
  const toggleProjectSidebarKey = useCallback((key: string) => {
    setProjectSidebarExpandedKeys((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return Array.from(set);
    });
  }, []);
  const handleProjectSidebarSelect = useCallback(
    (selectedKeys: string[]) => {
      const raw = String(selectedKeys[0] ?? "");
      if (!raw) return;
      if (activeKey !== "projects") navigateTo("projects");
      if (raw.startsWith("ws:")) {
        const workspaceId = raw.replace("ws:", "");
        setSelectedWorkspaceId(workspaceId);
        setSelectedClientId(null);
        setSelectedProjectId(null);
        setSelectedBoardId(null);
        return;
      }
      if (raw.startsWith("cl:")) {
        const clientId = raw.replace("cl:", "");
        const parentWorkspace = visibleWorkspaces.find((workspace) =>
          clientsForWorkspace(String(workspace.id)).some((client) => String(client.id) === clientId),
        );
        if (parentWorkspace) setSelectedWorkspaceId(String(parentWorkspace.id));
        setSelectedClientId(clientId);
        setSelectedProjectId(null);
        setSelectedBoardId(null);
        return;
      }
      if (raw.startsWith("pr:")) {
        const projectId = raw.replace("pr:", "");
        const project = projects.find((row) => String(row.id) === projectId) ?? null;
        const workspaceId = project
          ? String(portfolios.find((item) => String(item.id) === String(project.portfolio_id ?? ""))?.workspace_id ?? "")
          : "";
        if (workspaceId) setSelectedWorkspaceId(workspaceId);
        if (project?.client_id) setSelectedClientId(String(project.client_id));
        setSelectedProjectId(projectId);
        const firstBoard = boardsForProject(projectId)[0]?.id ?? null;
        setSelectedBoardId(firstBoard);
        return;
      }
      if (raw.startsWith("bd:")) {
        const boardId = raw.replace("bd:", "");
        const board = boards.find((item) => item.id === boardId) ?? null;
        if (!board) return;
        setSelectedBoardId(boardId);
        setSelectedProjectId(board.project_id);
        const project = projects.find((row) => String(row.id) === board.project_id) ?? null;
        if (project?.client_id) setSelectedClientId(String(project.client_id));
        const workspaceId = project
          ? String(portfolios.find((item) => String(item.id) === String(project.portfolio_id ?? ""))?.workspace_id ?? "")
          : board.workspace_id;
        if (workspaceId) setSelectedWorkspaceId(workspaceId);
      }
    },
    [
      activeKey,
      boards,
      boardsForProject,
      clientsForWorkspace,
      navigateTo,
      portfolios,
      projects,
      visibleWorkspaces,
    ],
  );
  const taskContext = useCallback(
    (task: TaskItem) => {
      const board = boardById[task.board_id];
      const group = boardGroupsIndex[task.group_id];
      const projectName = board?.project_id ? projectNameById[board.project_id] ?? board.project_id : "-";
      const isCurrentUserTask = currentUserId !== null && task.assignee_id === currentUserId;
      const personLabel = isCurrentUserTask
        ? currentUserIdentity.displayName
        : task.assignee_id
          ? `Usuario ${task.assignee_id}`
          : "-";
      return {
        personLabel,
        personAvatarUrl: isCurrentUserTask ? currentUserIdentity.avatarUrl : null,
        personInitial: isCurrentUserTask ? currentUserIdentity.initial : personLabel.charAt(0).toUpperCase(),
        projectLabel: projectName,
        boardLabel: board?.name ?? task.board_id,
        groupLabel: group?.name ?? task.group_id,
      };
    },
    [boardById, boardGroupsIndex, currentUserId, currentUserIdentity, projectNameById],
  );

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
    } else {
      setGlobalError(null);
    }
  }, [token]);

  const fetchTasks = useCallback(async () => {
    const response = await apiRequest<{ tasks: TaskItem[] }>("/my-tasks", { token });
    if (response.ok) {
      setTasks(response.data?.tasks ?? []);
    }
  }, [token]);

  const fetchAllTasks = useCallback(async () => {
    if (!token) return;
    setAllTasksLoading(true);
    const response = await apiRequest<{ tasks?: TaskItem[]; results?: TaskItem[] }>("/tasks", { token });
    setAllTasksLoading(false);
    if (response.ok) {
      const payload = response.data ?? {};
      const list = Array.isArray(payload.tasks)
        ? payload.tasks
        : Array.isArray(payload.results)
          ? payload.results
          : [];
      setAllTasks(list);
    }
  }, [token]);

  const hydrateTaskAssigneePickList = useCallback(async () => {
    if (!token) return;
    const resp = await apiRequest<{
      users?: Array<{ id?: number; name?: string; email?: string }>;
    }>("/users?page=1&page_size=200", { token });
    if (resp.ok) {
      const rows = resp.data?.users ?? [];
      setTaskAssigneePickList(
        rows
          .map((row) => {
            const id = Number(row.id);
            const nameRaw = String(row.name ?? "").trim();
            const email = String(row.email ?? "").trim();
            return {
              id,
              name: nameRaw || email || `Usuario ${id}`,
              email,
            };
          })
          .filter((row) => Number.isFinite(row.id))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
      return;
    }
    const fromAdmin = adminUsersCache
      .map((u) => ({
        id: u.id,
        name: String(u.name ?? "").trim() || u.email || `Usuario ${u.id}`,
        email: u.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (fromAdmin.length > 0) {
      setTaskAssigneePickList(fromAdmin);
      return;
    }
    const uniq = new Map<number, { id: number; name: string; email: string }>();
    const ensure = (id: number | null | undefined, name: string) => {
      if (id == null || !Number.isFinite(Number(id))) return;
      const n = Number(id);
      if (!uniq.has(n)) uniq.set(n, { id: n, name, email: "" });
    };
    for (const task of [...tasks, ...allTasks]) {
      if (task.assignee_id == null) continue;
      ensure(
        task.assignee_id,
        task.assignee_id === currentUserId
          ? currentUserIdentity.displayName
          : `Usuario ${task.assignee_id}`,
      );
    }
    if (currentUserId != null) {
      ensure(currentUserId, currentUserIdentity.displayName);
    }
    setTaskAssigneePickList(Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  }, [token, adminUsersCache, tasks, allTasks, currentUserId, currentUserIdentity.displayName]);

  useEffect(() => {
    if (!createTaskOpen || !token) return;
    void hydrateTaskAssigneePickList();
  }, [createTaskOpen, token, hydrateTaskAssigneePickList]);

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
    const meResp = await apiRequest<{ user: Record<string, unknown> }>("/me", { token });
    let baseProfile: Record<string, unknown> = {};
    if (meResp.ok) {
      const meUser = (meResp.data as { user?: Record<string, unknown> } | null)?.user ?? {};
      baseProfile = {
        ...meUser,
        is_staff: Boolean((meUser as Record<string, unknown>)?.is_staff),
        is_superuser: Boolean((meUser as Record<string, unknown>)?.is_superuser),
      };
    }
    const response = await apiRequest<{ profile: Record<string, unknown> }>("/me/collaborator-profile", { token });
    const collabProfile = response.ok ? (response.data?.profile ?? {}) : {};
    setProfileResult({ ...baseProfile, ...collabProfile, is_staff: Boolean(baseProfile.is_staff), is_superuser: Boolean(baseProfile.is_superuser) });
  }, [token]);

  const fetchMeWorkspaceAccess = useCallback(async () => {
    const response = await apiRequest<{ all?: boolean; workspace_ids?: string[] }>("/me/workspace-access", { token });
    if (!response.ok) {
      setMeWorkspaceAccess({ all: false, workspace_ids: [] });
      return;
    }
    const payload = response.data ?? {};
    setMeWorkspaceAccess({
      all: Boolean(payload.all),
      workspace_ids: Array.isArray(payload.workspace_ids) ? payload.workspace_ids.map(String) : [],
    });
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
  const fetchBoardGroupsIndex = useCallback(
    async (currentBoards: BoardItem[]) => {
      if (!currentBoards.length) {
        setBoardGroupsIndex({});
        return;
      }
      const responses = await Promise.all(
        currentBoards.map((board) => apiRequest<{ groups: GroupItem[] }>(`/boards/${board.id}/groups`, { token })),
      );
      const nextIndex: Record<string, GroupItem> = {};
      responses.forEach((resp) => {
        if (!resp.ok) return;
        (resp.data?.groups ?? []).forEach((group) => {
          nextIndex[group.id] = group;
        });
      });
      setBoardGroupsIndex(nextIndex);
    },
    [token],
  );

  const fetchBoards = useCallback(async () => {
    const response = await apiRequest<{ boards: BoardItem[] }>("/boards", { token });
    if (!response.ok) return;
    const rows = response.data?.boards ?? [];
    setBoards(rows);
    fetchBoardGroupsIndex(rows).catch(() => undefined);
    if (rows.length === 0) {
      setSelectedBoardId(null);
      setKanbanGroups([]);
      return;
    }
    if (!selectedBoardId) {
      setSelectedBoardId(rows[0].id);
      return;
    }
    if (!rows.some((board) => board.id === selectedBoardId)) {
      setSelectedBoardId(rows[0].id);
    }
  }, [fetchBoardGroupsIndex, selectedBoardId, token]);

  const fetchBoardView = useCallback(
    async (boardId: string, view: BoardViewMode) => {
      const response = await apiRequest<Record<string, unknown>>(`/boards/${boardId}?view=${view}`, { token });
      if (!response.ok) {
        apiMessage.error(response.error?.message ?? "Falha ao carregar grupo.");
        if (view !== "kanban") return;
      }
      const payload = response.data ?? null;
      if (view === "kanban") {
        const groups = Array.isArray(payload?.groups) ? (payload.groups as KanbanGroup[]) : [];
        setKanbanGroups(groups);
      }
    },
    [apiMessage, token],
  );
  const fetchKanban = useCallback(async (boardId: string) => {
    await fetchBoardView(boardId, "kanban");
  }, [fetchBoardView]);

  const findBoardOfTask = useCallback(
    (taskId: string): string | null => {
      for (const [bId, groups] of Object.entries(boardKanbanByBoardId)) {
        for (const column of groups) {
          if (column.tasks.some((t) => t.id === taskId)) return bId;
        }
      }
      return null;
    },
    [boardKanbanByBoardId],
  );

  const fetchKanbanForBoard = useCallback(
    async (boardId: string, view: BoardViewMode = "list") => {
      setBoardKanbanLoading((prev) => ({ ...prev, [boardId]: true }));
      const response = await apiRequest<Record<string, unknown>>(`/boards/${boardId}?view=${view}`, { token });
      setBoardKanbanLoading((prev) => ({ ...prev, [boardId]: false }));
      if (!response.ok) {
        if (view === "kanban") setBoardKanbanByBoardId((prev) => ({ ...prev, [boardId]: [] }));
        if (view === "list") setBoardListTasksByBoardId((prev) => ({ ...prev, [boardId]: [] }));
        return;
      }
      const payload = response.data ?? {};
      if (view === "kanban") {
        const groups = Array.isArray(payload?.groups) ? (payload.groups as KanbanGroup[]) : [];
        setBoardKanbanByBoardId((prev) => ({ ...prev, [boardId]: groups }));
      } else {
        const list = Array.isArray(payload?.tasks) ? (payload.tasks as TaskItem[]) : [];
        setBoardListTasksByBoardId((prev) => ({ ...prev, [boardId]: list }));
      }
    },
    [token],
  );

  const refreshBoardViewsForProject = useCallback(
    async (projectId: string | null) => {
      if (!projectId) return;
      const projectBoards = boards.filter((board) => board.project_id === projectId);
      await Promise.all(
        projectBoards.map((board) =>
          fetchKanbanForBoard(board.id, boardViewModeByBoardId[board.id] ?? "list"),
        ),
      );
    },
    [boards, boardViewModeByBoardId, fetchKanbanForBoard],
  );

  const ensureDefaultPortfolio = useCallback(
    async (workspaceId: string): Promise<string | null> => {
      if (!workspaceId) return null;
      const cacheRaw = typeof window !== "undefined" ? localStorage.getItem(DEFAULT_PORTFOLIO_STORAGE_KEY) : null;
      const cache = cacheRaw ? (JSON.parse(cacheRaw) as Record<string, string>) : {};
      if (cache[workspaceId]) {
        const cached = cache[workspaceId];
        const stillExists = portfolios.some(
          (item) => String(item.id) === cached && String(item.workspace_id) === workspaceId,
        );
        if (stillExists) return cached;
      }
      const existing = portfolios.find(
        (item) => String(item.workspace_id) === workspaceId && String(item.name) === DEFAULT_PORTFOLIO_NAME,
      );
      if (existing) {
        const id = String(existing.id);
        cache[workspaceId] = id;
        if (typeof window !== "undefined") {
          localStorage.setItem(DEFAULT_PORTFOLIO_STORAGE_KEY, JSON.stringify(cache));
        }
        return id;
      }
      const response = await apiRequest<{ portfolio: Record<string, unknown> }>("/portfolios", {
        method: "POST",
        token,
        body: { name: DEFAULT_PORTFOLIO_NAME, workspace_id: workspaceId },
      });
      if (!response.ok) {
        apiMessage.error(response.error?.message ?? "Falha ao preparar portfolio padrao.");
        return null;
      }
      const created = response.data?.portfolio as { id?: string } | undefined;
      const newId = created?.id ? String(created.id) : null;
      if (newId) {
        cache[workspaceId] = newId;
        if (typeof window !== "undefined") {
          localStorage.setItem(DEFAULT_PORTFOLIO_STORAGE_KEY, JSON.stringify(cache));
        }
        await fetchCrudData();
      }
      return newId;
    },
    [apiMessage, fetchCrudData, portfolios, token],
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
      fetchMeWorkspaceAccess(),
      fetchCrudData(),
      fetchBoards(),
    ]);
  }, [
    fetch2FASettings,
    fetchAudit,
    fetchBoards,
    fetchCrudData,
    fetchHealth,
    fetchMeWorkspaceAccess,
    fetchNotifications,
    fetchProfile,
    fetchTasks,
    token,
  ]);

  const silentRefresh = useCallback(async (): Promise<boolean> => {
    if (!refreshToken) return false;
    const response = await apiRequest<{ access_token: string; refresh_token: string }>(
      "/auth/tokens/refresh",
      { method: "POST", body: { refresh: refreshToken } },
    );
    if (!response.ok) return false;
    const access = response.data?.access_token ?? "";
    const refresh = response.data?.refresh_token ?? "";
    if (!access) return false;
    setToken(access);
    setRefreshToken(refresh || refreshToken);
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_STORAGE_KEY, refresh);
    }
    return true;
  }, [refreshToken]);

  useEffect(() => {
    if (!token) return;
    queueMicrotask(() => {
      loadAllData().catch(() => undefined);
    });
  }, [loadAllData, token]);

  useEffect(() => {
    if (!token) return;
    const intervalId = window.setInterval(() => {
      fetchNotifications().catch(() => undefined);
    }, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchNotifications, token]);

  useEffect(() => {
    if (!token || !refreshToken) return;
    const intervalId = window.setInterval(() => {
      silentRefresh().catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshToken, silentRefresh, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const storedToken = localStorage.getItem(AUTH_STORAGE_KEY);
      const fallbackKey: MenuKey = getAdminFromToken(storedToken) ? "my-work" : "dashboard";
      setToken(storedToken);
      setRefreshToken(localStorage.getItem(REFRESH_STORAGE_KEY));
      setActiveKey(getMenuKeyFromHash(window.location.hash, fallbackKey));
      setTaskStatusFilter(localStorage.getItem(TASK_STATUS_FILTER_KEY) ?? "all");
      setTaskSearchFilter(localStorage.getItem(TASK_SEARCH_FILTER_KEY) ?? "");
      setSelectedBoardId(localStorage.getItem(BOARD_STORAGE_KEY));
      setSelectedWorkspaceId(localStorage.getItem(SELECTED_WORKSPACE_STORAGE_KEY));
      setSelectedClientId(localStorage.getItem(SELECTED_CLIENT_STORAGE_KEY));
      setSelectedProjectId(localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY));
      const rawSidebarExpanded = localStorage.getItem(PROJECT_SIDEBAR_EXPANDED_KEY);
      if (rawSidebarExpanded) {
        try {
          const parsed = JSON.parse(rawSidebarExpanded) as string[];
          if (Array.isArray(parsed)) setProjectSidebarExpandedKeys(parsed);
        } catch {
          // ignore malformed local storage payload
        }
      }
      const rawStatusPalette = localStorage.getItem(STATUS_PALETTE_STORAGE_KEY);
      if (rawStatusPalette) {
        try {
          const parsed = JSON.parse(rawStatusPalette) as Record<string, { label?: string; color?: string }>;
          const nextPalette = { ...DEFAULT_STATUS_META };
          Object.keys(DEFAULT_STATUS_META).forEach((key) => {
            if (parsed[key]) {
              nextPalette[key] = {
                label: parsed[key].label ?? DEFAULT_STATUS_META[key].label,
                color: parsed[key].color ?? DEFAULT_STATUS_META[key].color,
              };
            }
          });
          setStatusPalette(nextPalette);
        } catch {
          // ignore malformed local storage payload
        }
      }
      const rawBranding = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (rawBranding) {
        try {
          const parsed = JSON.parse(rawBranding) as { app_name?: string; logo_url?: string };
          const nextBranding = {
            app_name: String(parsed.app_name ?? "BlackBeans System"),
            logo_url: String(parsed.logo_url ?? ""),
          };
          setBrandingConfig(nextBranding);
        } catch {
          // ignore malformed branding config
        }
      }
      const rawUsersCache = localStorage.getItem(ADMIN_USERS_STORAGE_KEY);
      const rawUsersMeta = localStorage.getItem(ADMIN_USER_META_STORAGE_KEY);
      if (rawUsersCache) {
        try {
          const parsed = JSON.parse(rawUsersCache) as Array<{ id: number; name: string; email: string; is_staff?: boolean }>;
          const meta = rawUsersMeta
            ? (JSON.parse(rawUsersMeta) as Record<string, { birth_date?: string; type?: "admin" | "collaborador" }>)
            : {};
          const enriched = parsed.map((row) => ({
            id: Number(row.id),
            name: String(row.name ?? ""),
            email: String(row.email ?? ""),
            type: meta[String(row.id)]?.type ?? (row.is_staff ? "admin" : "collaborador"),
            birth_date: String(meta[String(row.id)]?.birth_date ?? ""),
          }));
          setAdminUsersCache(enriched);
        } catch {
          // ignore malformed cache payload
        }
      }
      setNowMs(new Date().getTime());
      setHydratedSession(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hydratedSession) return;
    const syncWithHash = () => {
      const defaultKey: MenuKey = isAdmin ? "my-work" : "dashboard";
      const nextKey = getMenuKeyFromHash(window.location.hash, defaultKey);
      if (!isAdmin && RESTRICTED_ADMIN_KEYS.includes(nextKey)) {
        setActiveKey(defaultKey);
        window.history.replaceState(null, "", `#${defaultKey}`);
        return;
      }
      setActiveKey(nextKey);
    };
    syncWithHash();
    window.addEventListener("hashchange", syncWithHash);
    return () => {
      window.removeEventListener("hashchange", syncWithHash);
    };
  }, [hydratedSession, isAdmin]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const intervalId = window.setInterval(() => {
      setNowMs(new Date().getTime());
    }, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!token || isAdmin || activeKey !== "dashboard") return;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = (startOfToday.getDay() + 6) % 7;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = now.toISOString().slice(0, 10);
    const mkQuery = (from: Date) => `from=${from.toISOString().slice(0, 10)}&to=${endDate}&page=1&page_size=200`;
    const totalHours = (logs: TimeLog[]) =>
      logs.reduce((acc, log) => acc + Number(log.total_seconds ?? 0), 0) / 3600;
    Promise.all([
      apiRequest<{ time_logs: TimeLog[] }>(`/time-logs?${mkQuery(startOfToday)}`, { token }),
      apiRequest<{ time_logs: TimeLog[] }>(`/time-logs?${mkQuery(startOfWeek)}`, { token }),
      apiRequest<{ time_logs: TimeLog[] }>(`/time-logs?${mkQuery(startOfMonth)}`, { token }),
    ])
      .then(([todayResp, weekResp, monthResp]) => {
        if (!todayResp.ok || !weekResp.ok || !monthResp.ok) return;
        setCollaboratorDashboardHours({
          today: totalHours(todayResp.data?.time_logs ?? []),
          week: totalHours(weekResp.data?.time_logs ?? []),
          month: totalHours(monthResp.data?.time_logs ?? []),
        });
      })
      .catch(() => undefined);
  }, [activeKey, isAdmin, token]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUserId) return;
    if (activeKey !== "profile") return;
    const stored = localStorage.getItem(`bb_profile_extra_${currentUserId}`);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        full_name?: string;
        personal_email?: string;
        phone?: string;
        birth_date?: string;
        hourly_cost?: number;
        avatar_data_url?: string;
      };
      const next = {
        full_name: parsed.full_name ?? "",
        personal_email: parsed.personal_email ?? "",
        phone: parsed.phone ?? "",
        birth_date: parsed.birth_date ?? "",
        hourly_cost: Number(parsed.hourly_cost ?? 0),
      };
      profileDetailsForm.setFieldsValue(next);
      setProfileAvatarDataUrl(String(parsed.avatar_data_url ?? ""));
    } catch {
      // ignore parse errors for legacy payloads
    }
  }, [activeKey, currentUserId, profileDetailsForm]);
  useEffect(() => {
    if (!profileResult) return;
    if (activeKey !== "profile") return;
    profileDetailsForm.setFieldsValue({
      full_name:
        String(
          profileResult.display_name ??
            profileResult.full_name ??
            profileResult.name ??
            "",
        ) || "",
      personal_email:
        String(
          profileResult.professional_email ??
            profileResult.email ??
            profileResult.personal_email ??
            "",
        ) || "",
      phone: String(profileResult.phone ?? ""),
    });
  }, [activeKey, profileDetailsForm, profileResult]);
  useEffect(() => {
    if (!selectedTask || !activeTimeLog) return;
    const intervalId = window.setInterval(() => {
      setLiveTickMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTimeLog, selectedTask]);

  useEffect(() => {
    if (!token) {
      setTaskTimeSummaryByTaskId({});
      return;
    }
    if (taskTimeSummaryTargets.length === 0) {
      setTaskTimeSummaryByTaskId({});
      return;
    }
    let cancelled = false;
    const targets = taskTimeSummaryTargets;
    (async () => {
      const entries = await Promise.all(
        targets.map(async (t) => {
          const resp = await apiRequest<{ total_seconds: number; logs: TimeLog[] }>(`/tasks/${t.id}/time-summary`, {
            token,
          });
          if (!resp.ok) return [t.id, null] as const;
          return [
            t.id,
            { total_seconds: resp.data?.total_seconds ?? 0, logs: resp.data?.logs ?? [] },
          ] as const;
        }),
      );
      if (cancelled) return;
      const fetchedAtMs = Date.now();
      setTaskTimeSummaryByTaskId(() => {
        const next: Record<string, { total_seconds: number; logs: TimeLog[]; fetchedAtMs: number }> = {};
        for (const [id, data] of entries) {
          if (data) next[id] = { ...data, fetchedAtMs };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, taskTimeSummaryIdsKey, taskTimeSummaryTargets]);

  useEffect(() => {
    if (!anyTaskTimeSummaryActive) return;
    const intervalId = window.setInterval(() => setTaskTimeTickMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [anyTaskTimeSummaryActive]);

  useEffect(() => {
    if (!token || !selectedBoardId) return;
    queueMicrotask(() => {
      fetchKanban(selectedBoardId).catch(() => undefined);
    });
  }, [fetchKanban, selectedBoardId, token]);
  useEffect(() => {
    if (!token || !selectedBoardId) return;
    queueMicrotask(() => {
      fetchBoardView(selectedBoardId, boardViewMode).catch(() => undefined);
    });
  }, [boardViewMode, fetchBoardView, selectedBoardId, token]);
  useEffect(() => {
    if (!token || !selectedProjectId) return;
    const projectBoards = boards.filter((board) => board.project_id === selectedProjectId);
    if (projectBoards.length === 0) return;
    queueMicrotask(() => {
      Promise.all(
        projectBoards.map((board) => {
          const view = boardViewModeByBoardId[board.id] ?? "list";
          return fetchKanbanForBoard(board.id, view).catch(() => undefined);
        }),
      ).catch(() => undefined);
    });
  }, [boards, boardViewModeByBoardId, fetchKanbanForBoard, selectedProjectId, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedBoardId) {
      localStorage.setItem(BOARD_STORAGE_KEY, selectedBoardId);
    } else {
      localStorage.removeItem(BOARD_STORAGE_KEY);
    }
  }, [selectedBoardId]);
  /** Na area Projetos, board so faz sentido com projeto atual; senao sobrevive stale do LS/outras telas e a arvore destaca board errado. */
  useEffect(() => {
    if (activeKey !== "projects") return;
    if (!selectedBoardId) return;
    if (!selectedProjectId) {
      setSelectedBoardId(null);
      return;
    }
    if (!selectedWorkspaceId || !selectedClientId) {
      setSelectedBoardId(null);
      return;
    }
    const boardRow = boards.find((b) => b.id === selectedBoardId);
    if (!boardRow || boardRow.project_id !== selectedProjectId) {
      setSelectedBoardId(null);
    }
  }, [
    activeKey,
    boards,
    selectedBoardId,
    selectedClientId,
    selectedProjectId,
    selectedWorkspaceId,
  ]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedWorkspaceId) {
      localStorage.setItem(SELECTED_WORKSPACE_STORAGE_KEY, selectedWorkspaceId);
    } else {
      localStorage.removeItem(SELECTED_WORKSPACE_STORAGE_KEY);
    }
  }, [selectedWorkspaceId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedClientId) {
      localStorage.setItem(SELECTED_CLIENT_STORAGE_KEY, selectedClientId);
    } else {
      localStorage.removeItem(SELECTED_CLIENT_STORAGE_KEY);
    }
  }, [selectedClientId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedProjectId) {
      localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, selectedProjectId);
    } else {
      localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    }
  }, [selectedProjectId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(PROJECT_SIDEBAR_EXPANDED_KEY, JSON.stringify(projectSidebarExpandedKeys));
  }, [projectSidebarExpandedKeys]);

  /** Quando a navegacao muda na area principal, garante ancestrais abertos uma vez sem impedir toggle manual. */
  const lastRevealSidebarAncestorsRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedProjectSidebarKey) {
      lastRevealSidebarAncestorsRef.current = null;
      return;
    }
    if (lastRevealSidebarAncestorsRef.current === selectedProjectSidebarKey) return;
    lastRevealSidebarAncestorsRef.current = selectedProjectSidebarKey;
    const ancestors = projectSidebarAncestorMap[selectedProjectSidebarKey] ?? [];
    if (ancestors.length === 0) return;
    queueMicrotask(() => {
      setProjectSidebarExpandedKeys((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const key of ancestors) {
          if (!next.has(key)) {
            next.add(key);
            changed = true;
          }
        }
        return changed ? Array.from(next) : prev;
      });
    });
  }, [projectSidebarAncestorMap, selectedProjectSidebarKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TASK_STATUS_FILTER_KEY, taskStatusFilter);
  }, [taskStatusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TASK_SEARCH_FILTER_KEY, taskSearchFilter);
  }, [taskSearchFilter]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cachePayload = adminUsersCache.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      is_staff: row.type === "admin",
    }));
    const metaPayload: Record<string, { birth_date: string; type: "admin" | "collaborador" }> = {};
    adminUsersCache.forEach((row) => {
      metaPayload[String(row.id)] = { birth_date: row.birth_date, type: row.type };
    });
    localStorage.setItem(ADMIN_USERS_STORAGE_KEY, JSON.stringify(cachePayload));
    localStorage.setItem(ADMIN_USER_META_STORAGE_KEY, JSON.stringify(metaPayload));
  }, [adminUsersCache]);
  const fetchAdminUsers = useCallback(async () => {
    if (!token || !isAdmin) return;
    setAdminUsersLoading(true);
    const response = await apiRequest<
      | Array<{ id?: number; name?: string; username?: string; email?: string; is_staff?: boolean }>
      | {
          users?: Array<{ id?: number; name?: string; username?: string; email?: string; is_staff?: boolean }>;
          results?: Array<{ id?: number; name?: string; username?: string; email?: string; is_staff?: boolean }>;
          data?: Array<{ id?: number; name?: string; username?: string; email?: string; is_staff?: boolean }>;
        }
    >("/users?page=1&page_size=200", { method: "GET", token });
    setAdminUsersLoading(false);
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao consultar usuarios.");
      return;
    }
    const payload = response.data;
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.users)
          ? payload.users
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
    const previousMeta =
      typeof window !== "undefined"
        ? (JSON.parse(localStorage.getItem(ADMIN_USER_META_STORAGE_KEY) ?? "{}") as Record<
            string,
            { birth_date?: string; type?: "admin" | "collaborador" }
          >)
        : {};
    const normalized = rows
      .map((row) => {
        const id = Number(row.id);
        if (!Number.isFinite(id)) return null;
        const prev = previousMeta[String(id)];
        const isStaff = Boolean(row.is_staff);
        return {
          id,
          name: String(row.name ?? row.username ?? ""),
          email: String(row.email ?? ""),
          type: prev?.type ?? (isStaff ? "admin" : "collaborador"),
          birth_date: String(prev?.birth_date ?? ""),
        };
      })
      .filter((row): row is { id: number; name: string; email: string; type: "admin" | "collaborador"; birth_date: string } => Boolean(row));
    setAdminUsersCache(normalized);
  }, [apiMessage, isAdmin, token]);
  useEffect(() => {
    if (activeKey !== "users" || !token || !isAdmin) return;
    queueMicrotask(() => {
      fetchAdminUsers().catch(() => undefined);
    });
  }, [activeKey, fetchAdminUsers, isAdmin, token]);
  useEffect(() => {
    if (activeKey !== "tasks" || !token) return;
    queueMicrotask(() => {
      if (isAdmin) {
        fetchAllTasks().catch(() => undefined);
        if (adminUsersCache.length === 0) fetchAdminUsers().catch(() => undefined);
      }
    });
  }, [activeKey, adminUsersCache.length, fetchAdminUsers, fetchAllTasks, isAdmin, token]);

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

  async function openTask(task: TaskItem, focusTab: TaskDrawerTab = "summary") {
    setSelectedTask(task);
    setTaskDrawerTab(focusTab);
    setTaskCommentReplyTo(null);
    setTaskCommentEditingId(null);
    setTaskCommentEditingContent("");
    void hydrateTaskAssigneePickList();
    const [activityResp, summaryResp, groupsResp, commentsResp] = await Promise.all([
      apiRequest<{ activities: TaskActivity[] }>(`/tasks/${task.id}/activity`, { token }),
      apiRequest<{ total_seconds: number; logs: TimeLog[] }>(`/tasks/${task.id}/time-summary`, { token }),
      apiRequest<{ groups: GroupItem[] }>(`/boards/${task.board_id}/groups`, { token }),
      apiRequest<{ comments: TaskCommentItem[] }>(`/tasks/${task.id}/comments`, { token }),
    ]);
    setTaskActivity(activityResp.data?.activities ?? []);
    setTaskSummary({
      total_seconds: summaryResp.data?.total_seconds ?? 0,
      logs: summaryResp.data?.logs ?? [],
    });
    const nowTick = new Date().getTime();
    setTaskSummaryFetchedAtMs(nowTick);
    setLiveTickMs(nowTick);
    setTaskComments(commentsResp.data?.comments ?? []);
    if (!activityResp.ok || !summaryResp.ok || !groupsResp.ok || !commentsResp.ok) {
      setGlobalError(
        activityResp.error?.message ??
          summaryResp.error?.message ??
          groupsResp.error?.message ??
          commentsResp.error?.message ??
          "Falha ao carregar detalhes da tarefa.",
      );
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
  async function refreshTaskComments(taskId: string) {
    const response = await apiRequest<{ comments: TaskCommentItem[] }>(`/tasks/${taskId}/comments`, { token });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao carregar comentarios.");
      return false;
    }
    setTaskComments(response.data?.comments ?? []);
    return true;
  }
  async function createTaskComment(taskId: string, rawContent: string) {
    const content = rawContent.trim();
    if (!content) return;
    const payload = taskCommentReplyTo
      ? `[reply_to:${taskCommentReplyTo.id}] ${content}`
      : content;
    const response = await apiRequest<{ comment: TaskCommentItem }>(`/tasks/${taskId}/comments`, {
      method: "POST",
      token,
      body: { content: payload },
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao adicionar comentario.");
      return;
    }
    setTaskCommentDraft("");
    setTaskCommentReplyTo(null);
    await refreshTaskComments(taskId);
    apiMessage.success("Atualizacao registrada.");
  }
  async function updateTaskComment(taskId: string, commentId: string, rawContent: string) {
    const content = rawContent.trim();
    if (!content) return;
    const original = taskComments.find((item) => item.id === commentId);
    const originalMeta = original ? parseCommentReplyMeta(original.content) : { replyToId: null, cleanContent: "" };
    let normalizedReplyTo = originalMeta.replyToId;
    if (normalizedReplyTo && normalizedReplyTo.length < 36) {
      const full = taskComments.find((item) => item.id.startsWith(normalizedReplyTo ?? ""));
      if (full) normalizedReplyTo = full.id;
    }
    const payload = normalizedReplyTo ? `[reply_to:${normalizedReplyTo}] ${content}` : content;
    const response = await apiRequest<{ comment: TaskCommentItem }>(`/tasks/${taskId}/comments/${commentId}`, {
      method: "PATCH",
      token,
      body: { content: payload },
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao editar comentario.");
      return;
    }
    setTaskCommentEditingId(null);
    setTaskCommentEditingContent("");
    await refreshTaskComments(taskId);
    apiMessage.success("Comentario atualizado.");
  }
  async function deleteTaskComment(taskId: string, commentId: string) {
    const response = await apiRequest<{ deleted: boolean }>(`/tasks/${taskId}/comments/${commentId}`, {
      method: "DELETE",
      token,
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao excluir comentario.");
      return;
    }
    await refreshTaskComments(taskId);
    apiMessage.success("Comentario excluido.");
  }
  async function quickChangeTaskStatus(task: TaskItem, nextStatus: string) {
    const response = await apiRequest(`/tasks/${task.id}/status`, {
      method: "PATCH",
      token,
      body: { status: nextStatus },
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao atualizar status da tarefa.");
      return;
    }
    apiMessage.success("Status atualizado.");
    await fetchTasks();
    if (selectedTask?.id === task.id) {
      await openTask({ ...task, status: nextStatus });
    }
  }
  async function createTask(payload: Record<string, unknown>, successMessage = "Tarefa criada.") {
    const response = await apiRequest("/tasks", {
      method: "POST",
      token,
      body: payload,
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao criar tarefa.");
      return false;
    }
    apiMessage.success(successMessage);
    if (selectedBoardId) await fetchKanban(selectedBoardId);
    await fetchTasks();
    await refreshBoardViewsForProject(selectedProjectId);
    return true;
  }
  async function fetchTimeLogs(query = "page=1&page_size=20") {
    const response = await apiRequest<{ time_logs: TimeLog[] }>(`/time-logs?${query}`, { token });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao carregar apontamentos.");
      return;
    }
    setTimeLogs(response.data?.time_logs ?? []);
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
    if (selectedBoardId) await fetchKanban(selectedBoardId);
    await fetchTasks();
    await refreshBoardViewsForProject(selectedProjectId);
    if (selectedTask?.id === taskId) {
      await openTask({ ...selectedTask, group_id: nextGroupId });
    }
  }

  const deleteTaskById = useCallback(
    async (taskId: string) => {
      const response = await apiRequest(`/tasks/${taskId}`, { method: "DELETE", token });
      if (!response.ok) {
        apiMessage.error(response.error?.message ?? "Falha ao excluir tarefa.");
        return false;
      }
      apiMessage.success("Tarefa excluida.");
      setSelectedTask((current) => (current?.id === taskId ? null : current));
      await fetchCrudData();
      await fetchBoards();
      await fetchTasks();
      await refreshBoardViewsForProject(selectedProjectId);
      if (isAdmin) {
        await fetchAllTasks().catch(() => undefined);
      }
      return true;
    },
    [
      apiMessage,
      fetchAllTasks,
      fetchBoards,
      fetchCrudData,
      fetchTasks,
      isAdmin,
      refreshBoardViewsForProject,
      selectedProjectId,
      token,
    ],
  );

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
    setMeWorkspaceAccess(null);
    setSelectedTask(null);
    setTaskDrawerTab("summary");
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

  function parseJsonObjectOrNull(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async function runAdminEntityAction(params: {
    path: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: Record<string, unknown>;
    successMessage: string;
    reloadCrud?: boolean;
    reloadGroups?: boolean;
  }) {
    const response = await apiRequest<Record<string, unknown>>(params.path, {
      method: params.method ?? "GET",
      token,
      body: params.body,
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha na operacao.");
      return false;
    }
    setAdminOpsResult(response.data ?? {});
    apiMessage.success(params.successMessage);
    if (params.reloadCrud) {
      await fetchCrudData();
    }
    if (params.reloadGroups) {
      await fetchBoards();
    }
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

  function handleSidebarTreeSelect(key: string) {
    handleProjectSidebarSelect([key]);
    if (isCompactNav) setMobileNavOpen(false);
  }

  function handleSidebarTreeAction(action: "rename" | "delete", node: ProjectsSidebarNode) {
    const id = node.key.includes(":") ? node.key.split(":")[1] : node.key;
    if (node.type === "workspace") {
      if (action === "rename") {
        editWorkspaceForm.setFieldsValue({ name: node.title });
        setSelectedWorkspaceId(id);
        setEditWorkspaceOpen(true);
        return;
      }
      openDeleteConfirmModal({
        title: `Excluir a area "${node.title}"?`,
        onConfirm: async () => {
          const response = await apiRequest(`/workspaces/${id}`, { method: "DELETE", token });
          if (!response.ok) {
            apiMessage.error(response.error?.message ?? "Falha ao excluir area.");
            throw new Error("workspace_delete_failed");
          }
          apiMessage.success("Area de trabalho excluida.");
          if (selectedWorkspaceId === id) {
            setSelectedWorkspaceId(null);
            setSelectedClientId(null);
            setSelectedProjectId(null);
            setSelectedBoardId(null);
          }
          await fetchCrudData();
          await fetchBoards();
        },
      });
      return;
    }
    if (node.type === "client") {
      if (action === "rename") {
        openTextInputModal({
          title: "Renomear cliente",
          initialValue: node.title,
          placeholder: "Novo nome do cliente",
          onSubmit: async (nextName) => {
            const response = await apiRequest(`/clients/${id}`, {
              method: "PATCH",
              token,
              body: { name: nextName },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao renomear cliente.");
              throw new Error("client_rename_failed");
            }
            apiMessage.success("Cliente atualizado.");
            await fetchCrudData();
          },
        });
        return;
      }
      openDeleteConfirmModal({
        title: `Excluir o cliente "${node.title}"?`,
        onConfirm: async () => {
          const response = await apiRequest(`/clients/${id}`, { method: "DELETE", token });
          if (!response.ok) {
            apiMessage.error(response.error?.message ?? "Falha ao excluir cliente.");
            throw new Error("client_delete_failed");
          }
          apiMessage.success("Cliente excluido.");
          if (selectedClientId === id) {
            setSelectedClientId(null);
            setSelectedProjectId(null);
            setSelectedBoardId(null);
          }
          await fetchCrudData();
          await fetchBoards();
        },
      });
      return;
    }
    if (node.type === "project") {
      if (action === "rename") {
        openTextInputModal({
          title: "Renomear projeto",
          initialValue: node.title,
          placeholder: "Novo nome do projeto",
          onSubmit: async (nextName) => {
            const response = await apiRequest(`/projects/${id}`, {
              method: "PATCH",
              token,
              body: { name: nextName },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao renomear projeto.");
              throw new Error("project_rename_failed");
            }
            apiMessage.success("Projeto atualizado.");
            await fetchCrudData();
          },
        });
        return;
      }
      openDeleteConfirmModal({
        title: `Excluir o projeto "${node.title}"?`,
        onConfirm: async () => {
          const response = await apiRequest(`/projects/${id}`, { method: "DELETE", token });
          if (!response.ok) {
            apiMessage.error(response.error?.message ?? "Falha ao excluir projeto.");
            throw new Error("project_delete_failed");
          }
          apiMessage.success("Projeto excluido.");
          if (selectedProjectId === id) {
            setSelectedProjectId(null);
            setSelectedBoardId(null);
          }
          await fetchCrudData();
          await fetchBoards();
        },
      });
      return;
    }
    if (node.type === "board") {
      if (action === "rename") {
        openTextInputModal({
          title: "Renomear quadro",
          initialValue: node.title,
          placeholder: "Novo nome do quadro",
          onSubmit: async (nextName) => {
            const response = await apiRequest(`/boards/${id}`, {
              method: "PATCH",
              token,
              body: { name: nextName },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao renomear quadro.");
              throw new Error("board_rename_failed");
            }
            apiMessage.success("Quadro atualizado.");
            await fetchBoards();
          },
        });
        return;
      }
      openDeleteConfirmModal({
        title: `Excluir o quadro "${node.title}"?`,
        onConfirm: async () => {
          const response = await apiRequest(`/boards/${id}`, { method: "DELETE", token });
          if (!response.ok) {
            apiMessage.error(response.error?.message ?? "Falha ao excluir quadro.");
            throw new Error("board_delete_failed");
          }
          apiMessage.success("Quadro excluido.");
          if (selectedBoardId === id) setSelectedBoardId(null);
          await fetchBoards();
          await fetchTasks();
          if (isAdmin) await fetchAllTasks().catch(() => undefined);
        },
      });
    }
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

  if (!hydratedSession) {
    return (
      <Row justify="center" align="middle" style={{ minHeight: "100vh" }}>
        <Spin size="large" />
      </Row>
    );
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
        suppressHydrationWarning
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
        {!isCompactNav ? (
          <Sider theme="dark" width={248}>
            <div
              style={{
                color: "#F4F0ED",
                fontWeight: 700,
                padding: "18px 18px 8px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {brandingConfig.logo_url ? (
                <img
                  src={brandingConfig.logo_url}
                  alt="Logo do sistema"
                  style={{ width: 22, height: 22, objectFit: "cover", borderRadius: 6 }}
                />
              ) : null}
              <span>{brandingConfig.app_name}</span>
            </div>
            <nav aria-label="Navegacao principal">
              <Menu
                theme="dark"
                mode="inline"
                selectedKeys={[activeKey]}
                onClick={handleMainMenuClick}
                items={menuItems}
                defaultOpenKeys={isAdmin ? ["admin-root"] : undefined}
              />
              <Divider style={{ borderColor: "rgba(255,255,255,0.14)", margin: "10px 0" }} />
              <div style={{ padding: "0 6px 12px" }}>
                <Typography.Text
                  style={{
                    color: "rgba(244,240,237,0.88)",
                    fontSize: 12,
                    paddingInlineStart: 4,
                    display: "block",
                  }}
                >
                  Estrutura de projetos
                </Typography.Text>
                <div style={{ marginTop: 6 }}>
                  <ProjectsSidebarTree
                    data={projectSidebarTreeData}
                    expanded={projectSidebarExpandedKeysSet}
                    onToggle={toggleProjectSidebarKey}
                    selectedKey={selectedProjectSidebarKey}
                    onSelect={handleSidebarTreeSelect}
                    onAction={handleSidebarTreeAction}
                    showActions={isAdmin}
                  />
                </div>
              </div>
            </nav>
          </Sider>
        ) : null}
        <Layout>
          <Header
            style={{
              background: "#FFFFFF",
              borderBottom: "1px solid #E8E8E8",
              paddingInline: isCompactNav ? 12 : 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "nowrap",
            }}
          >
            <Space align="center" style={{ flex: 1, minWidth: 0 }}>
              {isCompactNav ? (
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  aria-label="Abrir menu de navegacao"
                  onClick={() => setMobileNavOpen(true)}
                />
              ) : null}
              <Typography.Title level={4} style={{ margin: 0, flex: 1, minWidth: 0 }} ellipsis>
                {brandingConfig.app_name}
              </Typography.Title>
            </Space>
            <Space>
              <Button
                type="text"
                aria-label="Abrir notificacoes"
                icon={<BellOutlined />}
                onClick={() => navigateTo("notifications")}
              >
                {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Button>
              <Dropdown menu={{ items: accountMenuItems }} trigger={["click"]} placement="bottomRight">
                <Button type="text" aria-label="Abrir menu da conta" icon={<UserOutlined />}>
                  Conta
                </Button>
              </Dropdown>
            </Space>
          </Header>
          <Content id="conteudo-principal" tabIndex={-1} style={{ padding: isCompactNav ? 12 : 24 }}>
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
                  isAdmin ? (
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
                  ) : (
                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={8}>
                        <Card title="Horas trabalhadas">
                          <Space orientation="vertical" size={4}>
                            <Typography.Text>Hoje: {collaboratorDashboardHours.today.toFixed(1)} h</Typography.Text>
                            <Typography.Text>Semana: {collaboratorDashboardHours.week.toFixed(1)} h</Typography.Text>
                            <Typography.Text>Mes: {collaboratorDashboardHours.month.toFixed(1)} h</Typography.Text>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card title="Tarefas">
                          <Space orientation="vertical" size={4}>
                            <Typography.Text>Concluidas no mes: {collaboratorDashboardMetrics.completedThisMonth}</Typography.Text>
                            <Typography.Text>Em andamento: {collaboratorDashboardMetrics.inProgress}</Typography.Text>
                            <Typography.Text>Bloqueadas: {collaboratorDashboardMetrics.blocked}</Typography.Text>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card title="Prazos">
                          <Space orientation="vertical" size={4}>
                            <Typography.Text>Atrasadas: {collaboratorDashboardMetrics.overdue}</Typography.Text>
                            <Typography.Text>Vencem em 7 dias: {collaboratorDashboardMetrics.dueSoon}</Typography.Text>
                            <Typography.Text>Notificacoes nao lidas: {unreadCount}</Typography.Text>
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} lg={12}>
                        <Card title="Proximas entregas">
                          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                            {collaboratorUpcomingTasks.map((task) => (
                              <Card key={task.id} size="small" onClick={() => openTask(task)} style={{ cursor: "pointer" }}>
                                <Space orientation="vertical" size={0}>
                                  <Typography.Text strong>{task.title}</Typography.Text>
                                  <Typography.Text type="secondary">Prazo: {formatDate(task.end_date)}</Typography.Text>
                                </Space>
                              </Card>
                            ))}
                            {collaboratorUpcomingTasks.length === 0 ? <Empty description="Sem tarefas com prazo." /> : null}
                          </Space>
                        </Card>
                      </Col>
                      <Col xs={24} lg={12}>
                        <Card title="Ultimas concluidas">
                          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                            {collaboratorRecentDoneTasks.map((task) => (
                              <Card key={task.id} size="small" onClick={() => openTask(task)} style={{ cursor: "pointer" }}>
                                <Space orientation="vertical" size={0}>
                                  <Typography.Text strong>{task.title}</Typography.Text>
                                  <Typography.Text type="secondary">Atualizada em: {formatDate(task.updated_at)}</Typography.Text>
                                </Space>
                              </Card>
                            ))}
                            {collaboratorRecentDoneTasks.length === 0 ? <Empty description="Nenhuma tarefa concluida ainda." /> : null}
                          </Space>
                        </Card>
                      </Col>
                    </Row>
                  )
                )}
                {activeKey === "my-work" && (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card title="Meu trabalho">
                        <Space wrap>
                          <Tag>Total: {myWorkMetrics.total}</Tag>
                          <Tag color="default">A fazer: {myWorkMetrics.todo}</Tag>
                          <Tag color="processing">Em progresso: {myWorkMetrics.inProgress}</Tag>
                          <Tag color="warning">Bloqueadas: {myWorkMetrics.blocked}</Tag>
                          <Tag color="success">Concluidas: {myWorkMetrics.done}</Tag>
                          <Tag color="error">Vencimento em 7 dias: {myWorkMetrics.dueSoon}</Tag>
                        </Space>
                        <Alert
                          type="info"
                          showIcon
                          style={{ marginTop: 12 }}
                          title="Orientacao rapida"
                          description="Use as cores padrao: status (cinza/azul/amarelo/verde) e prioridade (azul/dourado/laranja/vermelho). Clique na linha para abrir detalhes."
                        />
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="Minhas tarefas (acoes rapidas)">
                        <Space wrap style={{ marginBottom: 12 }}>
                          <Select
                            value={myWorkPeriodFilter}
                            onChange={setMyWorkPeriodFilter}
                            style={{ minWidth: 200 }}
                            options={[
                              { value: "all", label: `Todos os periodos (${tasks.filter((t) => t.status !== "done").length})` },
                              { value: "today", label: `Hoje (${myWorkGrouped.today.length})` },
                              { value: "week", label: `Esta semana (${myWorkGrouped.week.length})` },
                              { value: "overdue", label: `Atrasado (${myWorkGrouped.overdue.length})` },
                              { value: "no_due", label: `Sem prazo (${myWorkGrouped.noDue.length})` },
                            ]}
                          />
                          <Select
                            value={myWorkPriorityFilter}
                            onChange={setMyWorkPriorityFilter}
                            style={{ minWidth: 170 }}
                            options={[
                              { value: "all", label: "Todas prioridades" },
                              { value: "low", label: "Baixa" },
                              { value: "medium", label: "Media" },
                              { value: "high", label: "Alta" },
                              { value: "critical", label: "Critica" },
                            ]}
                          />
                          <Select
                            value={myWorkDeadlineFilter}
                            onChange={setMyWorkDeadlineFilter}
                            style={{ minWidth: 190 }}
                            options={[
                              { value: "all", label: "Todos os prazos" },
                              { value: "due_7", label: "Vence em 7 dias" },
                              { value: "overdue", label: "Atrasadas" },
                              { value: "no_due", label: "Sem prazo" },
                            ]}
                          />
                        </Space>
                        <Table<TaskItem>
                          rowKey="id"
                          dataSource={myWorkFilteredTasks}
                          pagination={{ pageSize: 8 }}
                          onRow={(record) => ({
                            onClick: () => openTask(record),
                            style: { cursor: "pointer" },
                          })}
                          columns={[
                            { title: "Titulo", dataIndex: "title" },
                            {
                              title: "Projeto",
                              render: (record: TaskItem) => taskContext(record).projectLabel,
                            },
                            {
                              title: "Quadro",
                              render: (record: TaskItem) => taskContext(record).boardLabel,
                            },
                            {
                              title: "Tempo",
                              render: (record: TaskItem) => {
                                const row = taskTimeSummaryByTaskId[record.id];
                                if (!row) return <Spin size="small" />;
                                const now = taskTimeTickMs || Date.now();
                                const display = liveTotalSecondsFromSummary(
                                  row.total_seconds,
                                  row.logs,
                                  row.fetchedAtMs,
                                  now,
                                );
                                const active = row.logs.some((log) => String(log.status).toLowerCase() === "active");
                                return (
                                  <Space orientation="vertical" size={0} onClick={(event) => event.stopPropagation()}>
                                    <Typography.Text>{secondsToText(display)}</Typography.Text>
                                    {active ? <Tag color="processing">Contando</Tag> : null}
                                  </Space>
                                );
                              },
                            },
                            { title: "Prioridade", dataIndex: "priority", render: (v: string) => renderPriorityTag(v) },
                            {
                              title: "Status",
                              dataIndex: "status",
                              render: (_: string, record: TaskItem) => (
                                <Select
                                  size="small"
                                  value={record.status}
                                  style={{ minWidth: 140 }}
                                  options={statusOptions}
                                  onChange={(nextStatus) => {
                                    quickChangeTaskStatus(record, nextStatus).catch(() => undefined);
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                />
                              ),
                            },
                            { title: "Prazo", dataIndex: "end_date", render: (v: string | null) => formatDate(v) },
                            {
                              title: "Acoes",
                              render: (record: TaskItem) => (
                                <Space onClick={(event) => event.stopPropagation()}>
                                  <Button
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={() => openTask(record).catch(() => undefined)}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() =>
                                      openDeleteConfirmModal({
                                        title: "Excluir esta tarefa?",
                                        onConfirm: async () => {
                                          const ok = await deleteTaskById(record.id);
                                          if (!ok) throw new Error("delete_failed");
                                        },
                                      })
                                    }
                                  >
                                    Excluir
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openTask(record, "comments").catch(() => undefined);
                                    }}
                                  >
                                    Comentarios
                                  </Button>
                                </Space>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} lg={10}>
                      <Card title="Tarefas atrasadas">
                        <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                          {myWorkOverdueTasks.map((task) => (
                            <Card key={task.id} size="small" onClick={() => openTask(task)} style={{ cursor: "pointer" }}>
                              <Space orientation="vertical" size={2}>
                                <Typography.Text strong>{task.title}</Typography.Text>
                                <Typography.Text type="danger">
                                  Atrasada desde: {formatDate(task.end_date)} • Prioridade: {task.priority}
                                </Typography.Text>
                              </Space>
                            </Card>
                          ))}
                          {myWorkOverdueTasks.length === 0 ? <Empty description="Sem tarefas atrasadas. Bom trabalho!" /> : null}
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} lg={14}>
                      <Card title="Criar tarefa para mim">
                        {!currentUserId ? (
                          <Alert
                            type="warning"
                            showIcon
                            title="Nao foi possivel identificar seu user_id no token para auto-atribuicao."
                          />
                        ) : null}
                        <Form
                          layout="vertical"
                          form={myWorkQuickCreateForm}
                          onFinish={async (values) => {
                            if (!currentUserId) {
                              apiMessage.error("Nao foi possivel identificar seu user_id no token.");
                              return;
                            }
                            if (!selectedBoard?.project_id) {
                              apiMessage.error("Selecione um board valido para criar a tarefa.");
                              return;
                            }
                            const ok = await createTask(
                              {
                                title: values.title,
                                description: values.description ?? "",
                                group_id: values.group_id,
                                priority: values.priority,
                                status: values.status,
                                effort_points: values.effort_points ?? 1,
                                assignee_id: currentUserId,
                                end_date: values.end_date ? new Date(values.end_date).toISOString() : null,
                                project_id: selectedBoard.project_id,
                              },
                              "Tarefa criada e atribuida a voce.",
                            );
                            if (ok) {
                              myWorkQuickCreateForm.resetFields();
                            }
                          }}
                        >
                          <Row gutter={[12, 0]}>
                            <Col xs={24} md={12}>
                                  <Form.Item label="Grupo" required>
                                <Select
                                  value={selectedBoardId ?? undefined}
                                  onChange={(value) => setSelectedBoardId(value)}
                                  options={boards.map((board) => ({
                                    value: board.id,
                                    label: `${board.name} (${board.id.slice(0, 8)})`,
                                  }))}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="group_id" label="Grupo" rules={[{ required: true, message: "Selecione o grupo." }]}>
                                <Select
                                  options={kanbanGroups.map((item) => ({
                                    value: item.group.id,
                                    label: item.group.name,
                                  }))}
                                />
                              </Form.Item>
                            </Col>
                            <Col span={24}>
                              <Form.Item name="title" label="Titulo" rules={[{ required: true, message: "Informe o titulo." }]}>
                                <Input placeholder="Ex.: Ajustar fluxo de dashboard pessoal" />
                              </Form.Item>
                            </Col>
                            <Col span={24}>
                              <Form.Item name="description" label="Descricao">
                                <Input.TextArea rows={2} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="priority" label="Prioridade" initialValue="medium">
                                <Select
                                  options={[
                                    { value: "low", label: "Baixa" },
                                    { value: "medium", label: "Media" },
                                    { value: "high", label: "Alta" },
                                    { value: "critical", label: "Critica" },
                                  ]}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="status" label="Status inicial" initialValue="todo">
                                <Select options={statusOptions} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="effort_points" label="Esforco (horas previstas)" initialValue={1}>
                                <InputNumber min={0} max={999} step={0.5} style={{ width: "100%" }} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="end_date" label="Prazo final">
                                <Input type="datetime-local" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item label="Responsavel">
                                <Input value={currentUserId ?? ""} disabled />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                            Criar tarefa para mim
                          </Button>
                        </Form>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "tasks" && isAdmin && (
                  <Card
                    title="Tarefas"
                    extra={
                      <Space wrap>
                        <Button
                          onClick={() => {
                            if (isAdmin) fetchAllTasks().catch(() => undefined);
                            else fetchTasks().catch(() => undefined);
                          }}
                          loading={allTasksLoading}
                        >
                          Atualizar
                        </Button>
                        <Button
                          onClick={() => {
                            setTaskStatusFilter("all");
                            setTaskPriorityFilter("all");
                            setTaskProjectFilter("all");
                            setTaskBoardFilter("all");
                            setTaskAssigneeFilter("all");
                            setTaskPeriodFilter("this_week");
                            setTaskSearchFilter("");
                          }}
                        >
                          Limpar filtros
                        </Button>
                      </Space>
                    }
                  >
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Select
                        value={taskPeriodFilter}
                        onChange={(value) => setTaskPeriodFilter(value)}
                        style={{ minWidth: 200 }}
                        options={[
                          { value: "all", label: "Todos os periodos" },
                          { value: "this_week", label: "Em execucao nesta semana" },
                          { value: "today", label: "Vence hoje" },
                          { value: "next_7", label: "Proximos 7 dias" },
                          { value: "overdue", label: "Atrasadas" },
                          { value: "no_due", label: "Sem prazo" },
                          { value: "in_progress", label: "Somente em andamento" },
                          { value: "done", label: "Concluidas" },
                        ]}
                      />
                      <Select
                        value={taskStatusFilter}
                        onChange={(value) => setTaskStatusFilter(value)}
                        style={{ minWidth: 180 }}
                        options={[
                          { value: "all", label: "Todos os status" },
                          ...statusOptions,
                        ]}
                      />
                      <Select
                        value={taskPriorityFilter}
                        onChange={(value) => setTaskPriorityFilter(value)}
                        style={{ minWidth: 160 }}
                        options={[
                          { value: "all", label: "Todas prioridades" },
                          { value: "low", label: "Baixa" },
                          { value: "medium", label: "Media" },
                          { value: "high", label: "Alta" },
                          { value: "critical", label: "Critica" },
                        ]}
                      />
                      <Select
                        value={taskProjectFilter}
                        onChange={(value) => {
                          setTaskProjectFilter(value);
                          if (value !== "all") {
                            const validBoards = boards.filter((b) => String(b.project_id) === value).map((b) => b.id);
                            if (taskBoardFilter !== "all" && !validBoards.includes(taskBoardFilter)) {
                              setTaskBoardFilter("all");
                            }
                          }
                        }}
                        style={{ minWidth: 200 }}
                        showSearch
                        optionFilterProp="label"
                        options={[
                          { value: "all", label: "Todos os projetos" },
                          ...projects.map((p) => ({ value: String(p.id), label: String(p.name ?? p.id) })),
                        ]}
                      />
                      <Select
                        value={taskBoardFilter}
                        onChange={(value) => setTaskBoardFilter(value)}
                        style={{ minWidth: 200 }}
                        showSearch
                        optionFilterProp="label"
                        options={[
                          { value: "all", label: "Todos os grupos" },
                          ...boards
                            .filter((b) => taskProjectFilter === "all" || String(b.project_id) === taskProjectFilter)
                            .map((b) => ({ value: b.id, label: b.name })),
                        ]}
                      />
                      <Select
                        value={taskAssigneeFilter}
                        onChange={(value) => setTaskAssigneeFilter(value)}
                        style={{ minWidth: 200 }}
                        showSearch
                        optionFilterProp="label"
                        options={[
                          { value: "all", label: "Todos os responsaveis" },
                          { value: "unassigned", label: "Sem responsavel" },
                          ...adminUsersCache.map((u) => ({ value: String(u.id), label: u.name || u.email || `Usuario ${u.id}` })),
                        ]}
                      />
                      <Input
                        placeholder="Buscar por titulo"
                        value={taskSearchFilter}
                        onChange={(event) => setTaskSearchFilter(event.target.value)}
                        style={{ width: 260 }}
                      />
                      <Tag color="processing">{tasksTabFiltered.length} tarefas visiveis</Tag>
                    </Space>
                    <Table<TaskItem>
                      rowKey="id"
                      loading={allTasksLoading}
                      dataSource={tasksTabFiltered}
                      pagination={{ pageSize: 8 }}
                      onRow={(record) => ({
                        onClick: () => openTask(record),
                        style: { cursor: "pointer" },
                      })}
                      columns={[
                        { title: "Titulo", dataIndex: "title" },
                        {
                          title: "Projeto",
                          render: (record: TaskItem) => taskContext(record).projectLabel,
                        },
                        {
                          title: "Quadro",
                          render: (record: TaskItem) => taskContext(record).boardLabel,
                        },
                        {
                          title: "Tempo",
                          render: (record: TaskItem) => {
                            const row = taskTimeSummaryByTaskId[record.id];
                            if (!row) return <Spin size="small" />;
                            const now = taskTimeTickMs || Date.now();
                            const display = liveTotalSecondsFromSummary(
                              row.total_seconds,
                              row.logs,
                              row.fetchedAtMs,
                              now,
                            );
                            const active = row.logs.some((log) => String(log.status).toLowerCase() === "active");
                            return (
                              <Space orientation="vertical" size={0} onClick={(event) => event.stopPropagation()}>
                                <Typography.Text>{secondsToText(display)}</Typography.Text>
                                {active ? <Tag color="processing">Contando</Tag> : null}
                              </Space>
                            );
                          },
                        },
                        {
                          title: "Status", dataIndex: "status", render: (v: string) => renderStatusTag(v) },
                        { title: "Prioridade", dataIndex: "priority", render: (v: string) => renderPriorityTag(v) },
                        { title: "Prazo", dataIndex: "end_date", render: (v: string | null) => formatDate(v) },
                        {
                          title: "Acoes",
                          render: (record: TaskItem) => (
                            <Space onClick={(event) => event.stopPropagation()}>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openTask(record).catch(() => undefined)}
                              >
                                Editar
                              </Button>
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                  openDeleteConfirmModal({
                                    title: "Excluir esta tarefa?",
                                    onConfirm: async () => {
                                      const ok = await deleteTaskById(record.id);
                                      if (!ok) throw new Error("delete_failed");
                                    },
                                  })
                                }
                              >
                                Excluir
                              </Button>
                              <Button
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                    openTask(record, "comments").catch(() => undefined);
                                }}
                              >
                                Comentarios
                              </Button>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Card>
                )}
                {activeKey === "users" && isAdmin && (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card title="Usuarios - CRUD administrativo">
                        <Tabs
                          activeKey={usersTabKey}
                          onChange={setUsersTabKey}
                          destroyOnHidden={false}
                          items={[
                            {
                              key: "u-list-page",
                              label: "Lista",
                              children: (
                                <Space orientation="vertical" style={{ width: "100%" }} size={12}>
                                  <Button onClick={() => fetchAdminUsers().catch(() => undefined)} loading={adminUsersLoading}>
                                    Atualizar lista
                                  </Button>
                                  <Table
                                    rowKey="id"
                                    loading={adminUsersLoading}
                                    dataSource={adminUsersCache}
                                    pagination={{ pageSize: 8 }}
                                    locale={{ emptyText: "Nenhum usuario encontrado." }}
                                    columns={[
                                      { title: "Nome", dataIndex: "name", render: (v: string) => v || "-" },
                                      { title: "Email", dataIndex: "email", render: (v: string) => v || "-" },
                                      { title: "Tipo", dataIndex: "type", render: (v: string) => (v === "admin" ? "Admin" : "Colaborador") },
                                      { title: "Aniversario", dataIndex: "birth_date", render: (v: string) => v || "-" },
                                      {
                                        title: "Acoes",
                                        render: (record: { id: number; name: string; email: string; type: "admin" | "collaborador"; birth_date: string }) => (
                                          <Button
                                            size="small"
                                            onClick={() => {
                                              void (async () => {
                                                manageUserProfileForm.setFieldsValue({
                                                  user_id: record.id,
                                                  name: record.name,
                                                  email: record.email,
                                                  is_staff: record.type === "admin",
                                                  birth_date: record.birth_date,
                                                  workspace_ids: [] as string[],
                                                });
                                                const wsResp = await apiRequest<{
                                                  is_staff?: boolean;
                                                  workspace_ids?: string[];
                                                }>(`/users/${record.id}/workspace-access`, { token });
                                                if (wsResp.ok && wsResp.data && !wsResp.data.is_staff) {
                                                  manageUserProfileForm.setFieldValue(
                                                    "workspace_ids",
                                                    (wsResp.data.workspace_ids ?? []).map(String),
                                                  );
                                                }
                                                setUsersTabKey("u-update-page");
                                              })();
                                            }}
                                          >
                                            Editar
                                          </Button>
                                        ),
                                      },
                                    ]}
                                  />
                                </Space>
                              ),
                            },
                            {
                              key: "u-create-page",
                              label: "Criar",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const payload = {
                                      username: String(values.username ?? ""),
                                      email: String(values.email ?? ""),
                                      name: String(values.name ?? ""),
                                      password: String(values.password ?? ""),
                                      is_staff: String(values.type ?? "collaborador") === "admin",
                                    };
                                    const response = await apiRequest("/users", { method: "POST", token, body: payload });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao criar usuario.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    const created = (response.data as { user?: { id?: number; name?: string; email?: string; is_staff?: boolean } })?.user;
                                    if (created?.id) {
                                      setAdminUsersCache((prev) => [
                                        ...prev.filter((row) => row.id !== Number(created.id)),
                                        {
                                          id: Number(created.id),
                                          name: String(created.name ?? payload.name),
                                          email: String(created.email ?? payload.email),
                                          type: payload.is_staff ? "admin" : "collaborador",
                                          birth_date: normalizeBirthDateInput(values.birth_date),
                                        },
                                      ]);
                                      const wsIds = Array.isArray(values.workspace_ids)
                                        ? values.workspace_ids.map(String)
                                        : [];
                                      if (!payload.is_staff) {
                                        const wsResp = await apiRequest(`/users/${created.id}/workspace-access`, {
                                          method: "PUT",
                                          token,
                                          body: { workspace_ids: wsIds },
                                        });
                                        if (!wsResp.ok) {
                                          apiMessage.warning(
                                            wsResp.error?.message ??
                                              "Usuario criado, mas falhou ao salvar areas de trabalho.",
                                          );
                                        }
                                      }
                                    }
                                    apiMessage.success("Usuario criado.");
                                    setUsersTabKey("u-list-page");
                                  }}
                                >
                                  <Form.Item name="username" label="Usuario" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="email" label="Email" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="name" label="Nome">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="type" label="Tipo" initialValue="collaborador" rules={[{ required: true }]}>
                                    <Select options={[{ value: "admin", label: "Admin" }, { value: "collaborador", label: "Colaborador" }]} />
                                  </Form.Item>
                                  <Form.Item shouldUpdate={(prev, curr) => prev.type !== curr.type} noStyle>
                                    {({ getFieldValue }) =>
                                      getFieldValue("type") === "collaborador" ? (
                                        <Form.Item
                                          name="workspace_ids"
                                          label="Areas de trabalho"
                                          extra="O colaborador passa a ver estas areas na estrutura de projetos (alem das areas onde ja tem tarefas)."
                                        >
                                          <Select
                                            mode="multiple"
                                            allowClear
                                            placeholder="Selecione as areas"
                                            options={workspaces.map((row) => ({
                                              value: String(row.id),
                                              label: String(row.name ?? row.id),
                                            }))}
                                          />
                                        </Form.Item>
                                      ) : null}
                                  </Form.Item>
                                  <Form.Item
                                    name="birth_date"
                                    label="Data de aniversario"
                                    getValueFromEvent={(event) => maskBirthDateInput(event?.target?.value)}
                                  >
                                    <Input placeholder="DD/MM/AAAA" maxLength={10} />
                                  </Form.Item>
                                  <Form.Item
                                    name="password"
                                    label="Senha"
                                    extra="Minimo de 12 caracteres com maiuscula, minuscula, numero e caractere especial."
                                    rules={[
                                      { required: true },
                                      { min: 12, message: "A senha precisa ter no minimo 12 caracteres." },
                                      { pattern: /[A-Z]/, message: "Inclua ao menos uma letra maiuscula." },
                                      { pattern: /[a-z]/, message: "Inclua ao menos uma letra minuscula." },
                                      { pattern: /\d/, message: "Inclua ao menos um numero." },
                                      { pattern: /[^\w\s]/, message: "Inclua ao menos um caractere especial." },
                                    ]}
                                  >
                                    <Input.Password />
                                  </Form.Item>
                                  <Button htmlType="submit" type="primary">
                                    Criar usuario
                                  </Button>
                                </Form>
                              ),
                            },
                            {
                              key: "u-update-page",
                              label: "Atualizar / Excluir",
                              children: (
                                <Form
                                  form={manageUserProfileForm}
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest(`/users/${values.user_id}`, {
                                      method: "PATCH",
                                      token,
                                      body: {
                                        name: values.name || undefined,
                                        email: values.email || undefined,
                                        is_staff: values.is_staff,
                                        is_active: values.is_active,
                                      },
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao atualizar usuario.");
                                      return;
                                    }
                                    if (!values.is_staff) {
                                      const wsIds = Array.isArray(values.workspace_ids) ? values.workspace_ids.map(String) : [];
                                      const putResp = await apiRequest(`/users/${values.user_id}/workspace-access`, {
                                        method: "PUT",
                                        token,
                                        body: { workspace_ids: wsIds },
                                      });
                                      if (!putResp.ok) {
                                        apiMessage.error(putResp.error?.message ?? "Falha ao salvar areas de trabalho.");
                                        return;
                                      }
                                    }
                                    const myNumericId =
                                      typeof profileResult?.id === "number"
                                        ? profileResult.id
                                        : typeof profileResult?.id === "string"
                                          ? Number(profileResult.id)
                                          : NaN;
                                    if (!Number.isNaN(myNumericId) && Number(values.user_id) === myNumericId) {
                                      await fetchMeWorkspaceAccess();
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    setAdminUsersCache((prev) =>
                                      prev.map((row) =>
                                        row.id === Number(values.user_id)
                                          ? {
                                              ...row,
                                              name: String(values.name ?? row.name),
                                              email: String(values.email ?? row.email),
                                              type: values.is_staff ? "admin" : "collaborador",
                                              birth_date: normalizeBirthDateInput(values.birth_date ?? row.birth_date),
                                            }
                                          : row,
                                      ),
                                    );
                                    apiMessage.success("Usuario atualizado.");
                                    setUsersTabKey("u-list-page");
                                  }}
                                >
                                  <Form.Item name="user_id" label="ID do usuario" rules={[{ required: true }]}>
                                    <InputNumber min={1} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name="name" label="Nome">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="email" label="Email">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="is_staff" label="Permissao admin">
                                    <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
                                  </Form.Item>
                                  <Form.Item shouldUpdate={(prev, curr) => prev.is_staff !== curr.is_staff} noStyle>
                                    {({ getFieldValue }) =>
                                      getFieldValue("is_staff") === true ? (
                                        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                                          Administradores tem acesso a todas as areas de trabalho.
                                        </Typography.Paragraph>
                                      ) : (
                                        <Form.Item
                                          name="workspace_ids"
                                          label="Areas de trabalho liberadas"
                                          extra="Visiveis para o colaborador na estrutura de projetos; combinadas com areas onde ele tem tarefas."
                                        >
                                          <Select
                                            mode="multiple"
                                            allowClear
                                            placeholder="Selecione as areas"
                                            options={workspaces.map((row) => ({
                                              value: String(row.id),
                                              label: String(row.name ?? row.id),
                                            }))}
                                          />
                                        </Form.Item>
                                      )}
                                  </Form.Item>
                                  <Form.Item name="birth_date" label="Data de aniversario">
                                    <Input
                                      placeholder="DD/MM/AAAA"
                                      maxLength={10}
                                      onChange={(event) =>
                                        manageUserProfileForm.setFieldValue(
                                          "birth_date",
                                          maskBirthDateInput(event.target.value),
                                        )
                                      }
                                    />
                                  </Form.Item>
                                  <Form.Item name="is_active" label="Status">
                                    <Select options={[{ value: true, label: "Ativo" }, { value: false, label: "Inativo" }]} />
                                  </Form.Item>
                                  <Space wrap>
                                    <Button htmlType="submit" type="primary">
                                      Salvar
                                    </Button>
                                    <Button
                                      danger
                                      onClick={() => {
                                        const userId = manageUserProfileForm.getFieldValue("user_id");
                                        if (!userId) {
                                          apiMessage.warning("Informe o ID do usuario.");
                                          return;
                                        }
                                        openDeleteConfirmModal({
                                          title: "Confirmar exclusao logica do perfil?",
                                          onConfirm: async () => {
                                            const disableResp = await apiRequest(`/users/${userId}`, {
                                              method: "PATCH",
                                              token,
                                              body: { is_active: false },
                                            });
                                            if (!disableResp.ok) {
                                              apiMessage.error(disableResp.error?.message ?? "Falha ao excluir perfil.");
                                              throw new Error("disable_profile_failed");
                                            }
                                            setAdminOpsResult(disableResp.data as Record<string, unknown>);
                                            apiMessage.success("Perfil excluido (inativado).");
                                          },
                                        });
                                      }}
                                    >
                                      Excluir perfil
                                    </Button>
                                  </Space>
                                </Form>
                              ),
                            },
                            {
                              key: "u-links-page",
                              label: "Vinculos",
                              children: (
                                <Row gutter={[16, 16]}>
                                  <Col xs={24} lg={12}>
                                    <Form
                                      layout="vertical"
                                      onFinish={async (values) => {
                                        const response = await apiRequest(`/users/${values.user_id}/collaborator-links`, {
                                          method: "POST",
                                          token,
                                          body: { collaborator_id: values.collaborator_id },
                                        });
                                        if (!response.ok) {
                                          apiMessage.error(response.error?.message ?? "Falha ao vincular colaborador.");
                                          return;
                                        }
                                        setAdminOpsResult(response.data as Record<string, unknown>);
                                        apiMessage.success("Vinculo criado.");
                                      }}
                                    >
                                      <Form.Item name="user_id" label="ID do usuario" rules={[{ required: true }]}>
                                        <InputNumber min={1} style={{ width: "100%" }} />
                                      </Form.Item>
                                      <Form.Item name="collaborator_id" label="UUID do colaborador" rules={[{ required: true }]}>
                                        <Input />
                                      </Form.Item>
                                      <Button htmlType="submit">Vincular colaborador</Button>
                                    </Form>
                                  </Col>
                                  <Col xs={24} lg={12}>
                                    <Form
                                      layout="vertical"
                                      onFinish={async (values) => {
                                        openDeleteConfirmModal({
                                          title: "Confirmar desvinculo user-colaborador?",
                                          onConfirm: async () => {
                                            const response = await apiRequest(
                                              `/users/${values.user_id}/collaborator-links/${values.collaborator_id}`,
                                              { method: "DELETE", token },
                                            );
                                            if (!response.ok) {
                                              apiMessage.error(response.error?.message ?? "Falha ao desvincular.");
                                              throw new Error("unlink_collaborator_failed");
                                            }
                                            setAdminOpsResult(response.data as Record<string, unknown>);
                                            apiMessage.success("Vinculo removido.");
                                          },
                                        });
                                      }}
                                    >
                                      <Form.Item name="user_id" label="ID do usuario" rules={[{ required: true }]}>
                                        <InputNumber min={1} style={{ width: "100%" }} />
                                      </Form.Item>
                                      <Form.Item name="collaborator_id" label="UUID do colaborador" rules={[{ required: true }]}>
                                        <Input />
                                      </Form.Item>
                                      <Button danger htmlType="submit">
                                        Desvincular colaborador
                                      </Button>
                                    </Form>
                                  </Col>
                                </Row>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="Resultado usuarios">
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                          {adminOpsResult ? JSON.stringify(adminOpsResult, null, 2) : "Sem operacao executada."}
                        </pre>
                      </Card>
                    </Col>
                  </Row>
                )}
                {activeKey === "admin-settings" && isAdmin && (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card title="Configuracoes admin">
                        <Form
                          layout="vertical"
                          initialValues={brandingConfig}
                          key={`branding-${brandingConfig.app_name}-${brandingConfig.logo_url}`}
                          onFinish={(values) => {
                            const next = {
                              app_name: String(values.app_name ?? "BlackBeans System"),
                              logo_url: brandingConfig.logo_url,
                            };
                            setBrandingConfig(next);
                            if (typeof window !== "undefined") {
                              localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(next));
                            }
                            apiMessage.success("Configuracoes do sistema atualizadas.");
                          }}
                        >
                          <Row gutter={16}>
                            <Col xs={24} lg={12}>
                              <Form.Item name="app_name" label="Nome da empresa" rules={[{ required: true }]}>
                                <Input placeholder="Ex.: BlackBeans" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} lg={12}>
                              <Form.Item label="Logo da empresa">
                                <Upload
                                  accept="image/*"
                                  maxCount={1}
                                  beforeUpload={(file) => {
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      const result = typeof reader.result === "string" ? reader.result : "";
                                      setBrandingConfig((prev) => {
                                        const next = { ...prev, logo_url: result };
                                        if (typeof window !== "undefined") {
                                          localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(next));
                                        }
                                        return next;
                                      });
                                      apiMessage.success("Logo carregada com sucesso.");
                                    };
                                    reader.readAsDataURL(file);
                                    return false;
                                  }}
                                  showUploadList={false}
                                >
                                  <Button>Selecionar logo</Button>
                                </Upload>
                              </Form.Item>
                            </Col>
                          </Row>
                          <Space wrap>
                            <Button type="primary" htmlType="submit">
                              Salvar configuracoes
                            </Button>
                            <Button
                              onClick={() => {
                                const reset = { app_name: "BlackBeans System", logo_url: "" };
                                setBrandingConfig(reset);
                                if (typeof window !== "undefined") {
                                  localStorage.removeItem(BRANDING_STORAGE_KEY);
                                }
                                apiMessage.success("Configuracoes padrao restauradas.");
                              }}
                            >
                              Restaurar padrao
                            </Button>
                          </Space>
                        </Form>
                        <Divider style={{ marginBlock: 16 }} />
                        <Typography.Text type="secondary">
                          Esta configuracao e aplicada no nome exibido no topo e na barra lateral.
                        </Typography.Text>
                      </Card>
                    </Col>
                  </Row>
                )}
                {activeKey === "status-config" && isAdmin && (
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card title="Status globais de tarefas (cor + rotulo)">
                        <Form
                          form={statusPaletteForm}
                          layout="vertical"
                          initialValues={{
                            rows: Object.entries(statusPalette).map(([key, meta]) => ({
                              source_key: key,
                              label: meta.label,
                              color: meta.color,
                            })),
                          }}
                          onFinish={(values) => {
                            const nextPalette: Record<string, { label: string; color: string }> = {};
                            const rows = Array.isArray(values.rows) ? values.rows : [];
                            const usedKeys = new Set<string>();
                            rows.forEach((row: { source_key?: string; label?: string; color?: string }, index: number) => {
                              const label = String(row.label ?? "").trim();
                              if (!label) return;
                              const sourceKey = String(row.source_key ?? "").trim();
                              const normalized = label
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "_")
                                .replace(/^_+|_+$/g, "");
                              let safeKey = sourceKey || normalized || `status_${index + 1}`;
                              if (usedKeys.has(safeKey)) {
                                let suffix = 2;
                                while (usedKeys.has(`${safeKey}_${suffix}`)) suffix += 1;
                                safeKey = `${safeKey}_${suffix}`;
                              }
                              usedKeys.add(safeKey);
                              nextPalette[safeKey] = {
                                label,
                                color: String(row.color ?? "default"),
                              };
                            });
                            if (Object.keys(nextPalette).length === 0) {
                              apiMessage.warning("Adicione pelo menos um status.");
                              return;
                            }
                            setStatusPalette(nextPalette);
                            if (typeof window !== "undefined") {
                              localStorage.setItem(STATUS_PALETTE_STORAGE_KEY, JSON.stringify(nextPalette));
                            }
                            apiMessage.success("Status globais atualizados para todos os grupos/projetos.");
                          }}
                        >
                          <Form.List name="rows">
                            {(fields, { add, remove }) => (
                              <>
                                {fields.map((field) => (
                                  <Row key={field.key} gutter={12}>
                                    <Form.Item name={[field.name, "source_key"]} hidden>
                                      <Input />
                                    </Form.Item>
                                    <Col xs={24} md={7}>
                                      <Form.Item name={[field.name, "label"]} label="Rotulo" rules={[{ required: true }]}>
                                        <Input />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={7}>
                                      <Form.Item name={[field.name, "color"]} label="Cor" rules={[{ required: true }]}>
                                        <Select
                                          options={[
                                            { value: "default", label: "Cinza" },
                                            { value: "processing", label: "Azul" },
                                            { value: "warning", label: "Amarelo/Laranja" },
                                            { value: "success", label: "Verde" },
                                            { value: "blue", label: "Azul forte" },
                                            { value: "gold", label: "Dourado" },
                                            { value: "volcano", label: "Laranja forte" },
                                            { value: "red", label: "Vermelho" },
                                            { value: "purple", label: "Roxo" },
                                          ]}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={7}>
                                      <Form.Item label="Preview" shouldUpdate>
                                        {() => {
                                          const row = statusPaletteForm.getFieldValue(["rows", field.name]) as
                                            | { label?: string; color?: string }
                                            | undefined;
                                          const previewLabel = String(row?.label ?? "Status");
                                          const previewColor = String(row?.color ?? "default");
                                          return <Tag color={previewColor}>{previewLabel}</Tag>;
                                        }}
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={3}>
                                      <Form.Item label="Acoes">
                                        <Button danger onClick={() => remove(field.name)}>
                                          Remover
                                        </Button>
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                ))}
                                <Button type="dashed" onClick={() => add({ source_key: "", label: "", color: "default" })} icon={<PlusOutlined />}>
                                  Adicionar novo status
                                </Button>
                              </>
                            )}
                          </Form.List>
                          <Space wrap>
                            <Button type="primary" htmlType="submit">
                              Salvar status globais
                            </Button>
                            <Button
                              onClick={() => {
                                setStatusPalette(DEFAULT_STATUS_META);
                                statusPaletteForm.setFieldsValue({
                                  rows: Object.entries(DEFAULT_STATUS_META).map(([key, meta]) => ({
                                    source_key: key,
                                    label: meta.label,
                                    color: meta.color,
                                  })),
                                });
                                if (typeof window !== "undefined") {
                                  localStorage.removeItem(STATUS_PALETTE_STORAGE_KEY);
                                }
                                apiMessage.success("Padrao restaurado.");
                              }}
                            >
                              Restaurar padrao
                            </Button>
                          </Space>
                        </Form>
                      </Card>
                    </Col>
                  </Row>
                )}
                {activeKey === "admin-ops" && isAdmin && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Card title="Apontamentos de tempo (listar/editar/remover)">
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            const query = new URLSearchParams({
                              page: "1",
                              page_size: "20",
                              ...(values.workspace_id ? { workspace_id: values.workspace_id } : {}),
                              ...(values.from ? { from: values.from } : {}),
                              ...(values.to ? { to: values.to } : {}),
                            }).toString();
                            await fetchTimeLogs(query);
                          }}
                        >
                          <Form.Item name="workspace_id" label="Workspace ID">
                            <Input />
                          </Form.Item>
                          <Form.Item name="from" label="De (YYYY-MM-DD)">
                            <Input />
                          </Form.Item>
                          <Form.Item name="to" label="Ate (YYYY-MM-DD)">
                            <Input />
                          </Form.Item>
                          <Button htmlType="submit">Consultar</Button>
                        </Form>
                        <Table<TimeLog>
                          style={{ marginTop: 12 }}
                          rowKey="id"
                          dataSource={timeLogs}
                          pagination={{ pageSize: 5 }}
                          columns={[
                            { title: "Task", dataIndex: "task_id" },
                            { title: "User", dataIndex: "user_id" },
                            { title: "Status", dataIndex: "status", render: (v: string) => renderStatusTag(v) },
                            { title: "Total", dataIndex: "total_seconds", render: (v: number) => secondsToText(v ?? 0) },
                            {
                              title: "Acoes",
                              render: (log: TimeLog) => (
                                <Space>
                                  <Button
                                    size="small"
                                    onClick={() => {
                                      openTextInputModal({
                                        title: `Editar ended_at do log ${log.id}`,
                                        placeholder: "ISO datetime (ex.: 2026-04-29T18:00:00Z)",
                                        onSubmit: async (endedAt) => {
                                          const response = await apiRequest(`/time-logs/${log.id}`, {
                                            method: "PATCH",
                                            token,
                                            body: { ended_at: endedAt },
                                          });
                                          if (!response.ok) {
                                            apiMessage.error(response.error?.message ?? "Falha ao editar time-log.");
                                            throw new Error("time_log_patch_failed");
                                          }
                                          apiMessage.success("Time-log atualizado.");
                                          await fetchTimeLogs();
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
                                      const response = await apiRequest(`/time-logs/${log.id}`, {
                                        method: "DELETE",
                                        token,
                                      });
                                      if (!response.ok) {
                                        apiMessage.error(response.error?.message ?? "Falha ao remover time-log.");
                                        return;
                                      }
                                      apiMessage.success("Time-log removido.");
                                      await fetchTimeLogs();
                                    }}
                                  >
                                    Remover
                                  </Button>
                                </Space>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Usuarios admin (criar/atualizar/vincular)">
                        <Tabs
                          destroyOnHidden={false}
                          items={[
                            {
                              key: "u-create",
                              label: "Criar user",
                              children: (
                                <Form
                                  form={adminOpsCreateUserForm}
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest("/users", { method: "POST", token, body: values });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao criar usuario.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    apiMessage.success("Usuario criado.");
                                  }}
                                >
                                  <Form.Item name="username" label="Usuario" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="email" label="Email" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="name" label="Nome">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="password" label="Senha" rules={[{ required: true }]}>
                                    <Input.Password />
                                  </Form.Item>
                                  <Button htmlType="submit" type="primary">
                                    Criar
                                  </Button>
                                </Form>
                              ),
                            },
                            {
                              key: "u-update",
                              label: "Atualizar user",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest(`/users/${values.user_id}`, {
                                      method: "PATCH",
                                      token,
                                      body: {
                                        email: values.email,
                                        name: values.name,
                                        is_active: values.is_active,
                                        is_staff: values.is_staff,
                                      },
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao atualizar usuario.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    apiMessage.success("Usuario atualizado.");
                                  }}
                                >
                                  <Form.Item name="user_id" label="ID do usuario" rules={[{ required: true }]}>
                                    <InputNumber min={1} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name="email" label="Email">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="name" label="Nome">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="is_active" label="is_active">
                                    <Select options={[{ value: true, label: "true" }, { value: false, label: "false" }]} />
                                  </Form.Item>
                                  <Form.Item name="is_staff" label="is_staff">
                                    <Select options={[{ value: true, label: "true" }, { value: false, label: "false" }]} />
                                  </Form.Item>
                                  <Button htmlType="submit">Atualizar</Button>
                                </Form>
                              ),
                            },
                            {
                              key: "u-manage",
                              label: "Gerenciar perfil",
                              children: (
                                <Form
                                  form={adminOpsManageProfileForm}
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest(`/users/${values.user_id}`, {
                                      method: "PATCH",
                                      token,
                                      body: {
                                        name: values.name || undefined,
                                        email: values.email || undefined,
                                        is_staff: values.is_staff,
                                        is_active: values.is_active,
                                      },
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao gerenciar perfil.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    apiMessage.success("Perfil atualizado.");
                                  }}
                                >
                                  <Form.Item name="user_id" label="ID do usuario" rules={[{ required: true }]}>
                                    <InputNumber min={1} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name="name" label="Nome">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="email" label="Email">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="is_staff" label="Permissao admin">
                                    <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
                                  </Form.Item>
                                  <Form.Item name="is_active" label="Status do perfil">
                                    <Select
                                      options={[
                                        { value: true, label: "Ativo" },
                                        { value: false, label: "Excluido (inativo)" },
                                      ]}
                                    />
                                  </Form.Item>
                                  <Space wrap>
                                    <Button htmlType="submit" type="primary">
                                      Salvar perfil
                                    </Button>
                                    <Button
                                      danger
                                      onClick={() => {
                                        const userId = adminOpsManageProfileForm.getFieldValue("user_id");
                                        if (!userId) {
                                          apiMessage.warning("Informe o ID do usuario para excluir.");
                                          return;
                                        }
                                        openDeleteConfirmModal({
                                          title: "Confirmar exclusao logica do perfil?",
                                          onConfirm: async () => {
                                            const disableResp = await apiRequest(`/users/${userId}`, {
                                              method: "PATCH",
                                              token,
                                              body: { is_active: false },
                                            });
                                            if (!disableResp.ok) {
                                              apiMessage.error(disableResp.error?.message ?? "Falha ao excluir perfil.");
                                              throw new Error("disable_profile_failed");
                                            }
                                            setAdminOpsResult(disableResp.data as Record<string, unknown>);
                                            apiMessage.success("Perfil excluido (inativado).");
                                          },
                                        });
                                      }}
                                    >
                                      Excluir perfil
                                    </Button>
                                  </Space>
                                </Form>
                              ),
                            },
                            {
                              key: "u-link",
                              label: "Vincular colaborador",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest(`/users/${values.user_id}/collaborator-links`, {
                                      method: "POST",
                                      token,
                                      body: { collaborator_id: values.collaborator_id },
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao vincular colaborador.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    apiMessage.success("Vinculo criado.");
                                  }}
                                >
                                  <Form.Item name="user_id" label="ID do usuario" rules={[{ required: true }]}>
                                    <InputNumber min={1} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name="collaborator_id" label="UUID do colaborador" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Button htmlType="submit">Vincular</Button>
                                </Form>
                              ),
                            },
                            {
                              key: "u-unlink",
                              label: "Desvincular colaborador",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    openDeleteConfirmModal({
                                      title: "Confirmar desvinculo user-colaborador?",
                                      onConfirm: async () => {
                                        const response = await apiRequest(
                                          `/users/${values.user_id}/collaborator-links/${values.collaborator_id}`,
                                          {
                                            method: "DELETE",
                                            token,
                                          },
                                        );
                                        if (!response.ok) {
                                          apiMessage.error(response.error?.message ?? "Falha ao desvincular colaborador.");
                                          throw new Error("unlink_collaborator_failed");
                                        }
                                        setAdminOpsResult(response.data as Record<string, unknown>);
                                        apiMessage.success("Vinculo removido.");
                                      },
                                    });
                                  }}
                                >
                                  <Form.Item name="user_id" label="ID do usuario" rules={[{ required: true }]}>
                                    <InputNumber min={1} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item name="collaborator_id" label="UUID do colaborador" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Button htmlType="submit" danger>
                                    Desvincular
                                  </Button>
                                </Form>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Colaboradores (criar/atualizar/departamento)">
                        <Tabs
                          items={[
                            {
                              key: "c-create",
                              label: "Criar",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest("/collaborators", {
                                      method: "POST",
                                      token,
                                      body: values,
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao criar colaborador.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    apiMessage.success("Colaborador criado.");
                                  }}
                                >
                                  <Form.Item name="display_name" label="Nome" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="job_title" label="Cargo">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="professional_email" label="Email">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="phone" label="Telefone">
                                    <Input />
                                  </Form.Item>
                                  <Button htmlType="submit">Criar</Button>
                                </Form>
                              ),
                            },
                            {
                              key: "c-update",
                              label: "Atualizar",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest(`/collaborators/${values.collaborator_id}`, {
                                      method: "PATCH",
                                      token,
                                      body: {
                                        display_name: values.display_name,
                                        job_title: values.job_title,
                                        professional_email: values.professional_email,
                                        phone: values.phone,
                                      },
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao atualizar colaborador.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    apiMessage.success("Colaborador atualizado.");
                                  }}
                                >
                                  <Form.Item name="collaborator_id" label="UUID do colaborador" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="display_name" label="Nome">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="job_title" label="Cargo">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="professional_email" label="Email">
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="phone" label="Telefone">
                                    <Input />
                                  </Form.Item>
                                  <Button htmlType="submit">Atualizar</Button>
                                </Form>
                              ),
                            },
                            {
                              key: "c-dept",
                              label: "Departamento",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const response = await apiRequest(
                                      `/collaborators/${values.collaborator_id}/department-links`,
                                      {
                                        method: "POST",
                                        token,
                                        body: { department_id: values.department_id },
                                      },
                                    );
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao vincular departamento.");
                                      return;
                                    }
                                    setAdminOpsResult(response.data as Record<string, unknown>);
                                    apiMessage.success("Departamento vinculado.");
                                  }}
                                >
                                  <Form.Item name="collaborator_id" label="UUID do colaborador" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="department_id" label="UUID do departamento" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Button htmlType="submit">Vincular</Button>
                                </Form>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Projetos e grupos (operacoes)">
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            const [metricsResp, scheduleResp, boardResp] = await Promise.all([
                              apiRequest(`/projects/${values.project_id}/metrics`, { token }),
                              apiRequest(`/projects/${values.project_id}/schedule`, {
                                method: "PATCH",
                                token,
                                body: {
                                  start_date: values.start_date || undefined,
                                  end_date: values.end_date || undefined,
                                  actual_start_date: values.actual_start_date || undefined,
                                  actual_end_date: values.actual_end_date || undefined,
                                },
                              }),
                              apiRequest(`/boards/${values.board_id}/progress`, { token }),
                            ]);
                            if (!metricsResp.ok || !scheduleResp.ok || !boardResp.ok) {
                              apiMessage.error(
                                metricsResp.error?.message ??
                                  scheduleResp.error?.message ??
                                  boardResp.error?.message ??
                                  "Falha na operacao de projeto/grupo.",
                              );
                              return;
                            }
                            setAdminOpsResult({
                              metrics: metricsResp.data,
                              schedule: scheduleResp.data,
                            });
                            setBoardProgress(boardResp.data as Record<string, unknown>);
                            apiMessage.success("Metricas, schedule e progresso carregados.");
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
                          <Form.Item name="board_id" label="Grupo" rules={[{ required: true }]}>
                            <Select
                              showSearch
                              optionFilterProp="label"
                              options={boards.map((board) => ({
                                value: board.id,
                                label: `${board.name} (${board.id.slice(0, 8)})`,
                              }))}
                            />
                          </Form.Item>
                          <Form.Item name="start_date" label="Start date (ISO)">
                            <Input />
                          </Form.Item>
                          <Form.Item name="end_date" label="End date (ISO)">
                            <Input />
                          </Form.Item>
                          <Form.Item name="actual_start_date" label="Actual start (ISO)">
                            <Input />
                          </Form.Item>
                          <Form.Item name="actual_end_date" label="Actual end (ISO)">
                            <Input />
                          </Form.Item>
                          <Button htmlType="submit">Executar</Button>
                        </Form>
                        <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
                          {boardProgress ? JSON.stringify(boardProgress, null, 2) : "Sem progresso de grupo carregado."}
                        </pre>
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="CRUD complementar de entidades">
                        <Tabs
                          items={[
                            {
                              key: "entity-client",
                              label: "Cliente",
                              children: (
                                <Form
                                  layout="vertical"
                                  initialValues={{ payload: "{}", action: "get" }}
                                  onFinish={async (values) => {
                                    const clientId = String(values.client_id ?? "");
                                    if (!clientId) return;
                                    if (values.action === "toggle") {
                                      await runAdminEntityAction({
                                        path: `/clients/${clientId}/status-toggle`,
                                        method: "POST",
                                        body: {},
                                        successMessage: "Status do cliente alternado.",
                                        reloadCrud: true,
                                      });
                                      return;
                                    }
                                    if (values.action === "patch") {
                                      const payload = parseJsonObjectOrNull(String(values.payload ?? "{}"));
                                      if (payload === null) {
                                        apiMessage.error("Payload JSON invalido.");
                                        return;
                                      }
                                      await runAdminEntityAction({
                                        path: `/clients/${clientId}`,
                                        method: "PATCH",
                                        body: payload,
                                        successMessage: "Cliente atualizado.",
                                        reloadCrud: true,
                                      });
                                      return;
                                    }
                                    await runAdminEntityAction({
                                      path: `/clients/${clientId}`,
                                      successMessage: "Detalhes de cliente carregados.",
                                    });
                                  }}
                                >
                                  <Form.Item name="client_id" label="Cliente" rules={[{ required: true }]}>
                                    <Select
                                      showSearch
                                      optionFilterProp="label"
                                      options={clients.map((row) => ({
                                        value: String(row.id),
                                        label: String(row.name ?? row.id),
                                      }))}
                                    />
                                  </Form.Item>
                                  <Form.Item name="action" label="Acao" rules={[{ required: true }]}>
                                    <Select
                                      options={[
                                        { value: "get", label: "Buscar detalhes" },
                                        { value: "patch", label: "Atualizar cliente" },
                                        { value: "toggle", label: "Alternar status" },
                                      ]}
                                    />
                                  </Form.Item>
                                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.action !== curr.action}>
                                    {({ getFieldValue }) =>
                                      getFieldValue("action") === "patch" ? (
                                        <Form.Item name="payload" label="Payload PATCH (JSON)" style={{ marginTop: 12 }}>
                                          <Input.TextArea
                                            rows={4}
                                            placeholder={'Ex.: {"name":"Cliente Renomeado","description":"Descricao atualizada"}'}
                                          />
                                        </Form.Item>
                                      ) : null
                                    }
                                  </Form.Item>
                                  <Button htmlType="submit" type="primary">
                                    Executar
                                  </Button>
                                </Form>
                              ),
                            },
                            {
                              key: "entity-workspace",
                              label: "Workspace",
                              children: (
                                <Form
                                  layout="vertical"
                                  initialValues={{ payload: "{}", action: "get" }}
                                  onFinish={async (values) => {
                                    const id = String(values.id ?? "");
                                    if (!id) return;
                                    if (values.action === "delete") {
                                      openDeleteConfirmModal({
                                        title: "Excluir workspace selecionado?",
                                        onConfirm: async () => {
                                          await runAdminEntityAction({
                                            path: `/workspaces/${id}`,
                                            method: "DELETE",
                                            successMessage: "Workspace removido.",
                                            reloadCrud: true,
                                          });
                                        },
                                      });
                                      return;
                                    }
                                    if (values.action === "patch") {
                                      const payload = parseJsonObjectOrNull(String(values.payload ?? "{}"));
                                      if (payload === null) {
                                        apiMessage.error("Payload JSON invalido.");
                                        return;
                                      }
                                      await runAdminEntityAction({
                                        path: `/workspaces/${id}`,
                                        method: "PATCH",
                                        body: payload,
                                        successMessage: "Workspace atualizado.",
                                        reloadCrud: true,
                                      });
                                      return;
                                    }
                                    await runAdminEntityAction({
                                      path: `/workspaces/${id}`,
                                      successMessage: "Detalhes de workspace carregados.",
                                    });
                                  }}
                                >
                                  <Form.Item name="id" label="Workspace" rules={[{ required: true }]}>
                                    <Select
                                      showSearch
                                      optionFilterProp="label"
                                      options={workspaces.map((row) => ({
                                        value: String(row.id),
                                        label: String(row.name ?? row.id),
                                      }))}
                                    />
                                  </Form.Item>
                                  <Form.Item name="action" label="Acao" rules={[{ required: true }]}>
                                    <Select
                                      options={[
                                        { value: "get", label: "Buscar detalhes" },
                                        { value: "patch", label: "Atualizar workspace" },
                                        { value: "delete", label: "Excluir workspace" },
                                      ]}
                                    />
                                  </Form.Item>
                                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.action !== curr.action}>
                                    {({ getFieldValue }) =>
                                      getFieldValue("action") === "patch" ? (
                                        <Form.Item name="payload" label="Payload PATCH (JSON)" style={{ marginTop: 12 }}>
                                          <Input.TextArea
                                            rows={4}
                                            placeholder={'Ex.: {"name":"Workspace Operacoes","is_active":true}'}
                                          />
                                        </Form.Item>
                                      ) : null
                                    }
                                  </Form.Item>
                                  <Button htmlType="submit" type="primary">
                                    Executar
                                  </Button>
                                </Form>
                              ),
                            },
                            {
                              key: "entity-portfolio",
                              label: "Portfolio",
                              children: (
                                <Form
                                  layout="vertical"
                                  initialValues={{ payload: "{}", action: "get" }}
                                  onFinish={async (values) => {
                                    const id = String(values.id ?? "");
                                    if (!id) return;
                                    if (values.action === "delete") {
                                      openDeleteConfirmModal({
                                        title: "Excluir portfolio selecionado?",
                                        onConfirm: async () => {
                                          await runAdminEntityAction({
                                            path: `/portfolios/${id}`,
                                            method: "DELETE",
                                            successMessage: "Portfolio removido.",
                                            reloadCrud: true,
                                          });
                                        },
                                      });
                                      return;
                                    }
                                    if (values.action === "patch") {
                                      const payload = parseJsonObjectOrNull(String(values.payload ?? "{}"));
                                      if (payload === null) {
                                        apiMessage.error("Payload JSON invalido.");
                                        return;
                                      }
                                      await runAdminEntityAction({
                                        path: `/portfolios/${id}`,
                                        method: "PATCH",
                                        body: payload,
                                        successMessage: "Portfolio atualizado.",
                                        reloadCrud: true,
                                      });
                                      return;
                                    }
                                    await runAdminEntityAction({
                                      path: `/portfolios/${id}`,
                                      successMessage: "Detalhes de portfolio carregados.",
                                    });
                                  }}
                                >
                                  <Form.Item name="id" label="Portfolio" rules={[{ required: true }]}>
                                    <Select
                                      showSearch
                                      optionFilterProp="label"
                                      options={portfolios.map((row) => ({
                                        value: String(row.id),
                                        label: String(row.name ?? row.id),
                                      }))}
                                    />
                                  </Form.Item>
                                  <Form.Item name="action" label="Acao" rules={[{ required: true }]}>
                                    <Select
                                      options={[
                                        { value: "get", label: "Buscar detalhes" },
                                        { value: "patch", label: "Atualizar portfolio" },
                                        { value: "delete", label: "Excluir portfolio" },
                                      ]}
                                    />
                                  </Form.Item>
                                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.action !== curr.action}>
                                    {({ getFieldValue }) =>
                                      getFieldValue("action") === "patch" ? (
                                        <Form.Item name="payload" label="Payload PATCH (JSON)" style={{ marginTop: 12 }}>
                                          <Input.TextArea
                                            rows={4}
                                            placeholder={'Ex.: {"name":"Portfolio Core","description":"Linha principal"}'}
                                          />
                                        </Form.Item>
                                      ) : null
                                    }
                                  </Form.Item>
                                  <Button htmlType="submit" type="primary">
                                    Executar
                                  </Button>
                                </Form>
                              ),
                            },
                            {
                              key: "entity-project",
                              label: "Projeto",
                              children: (
                                <Form
                                  layout="vertical"
                                  initialValues={{ payload: "{}", action: "get" }}
                                  onFinish={async (values) => {
                                    const id = String(values.id ?? "");
                                    if (!id) return;
                                    if (values.action === "delete") {
                                      openDeleteConfirmModal({
                                        title: "Excluir projeto selecionado?",
                                        onConfirm: async () => {
                                          await runAdminEntityAction({
                                            path: `/projects/${id}`,
                                            method: "DELETE",
                                            successMessage: "Projeto removido.",
                                            reloadCrud: true,
                                            reloadGroups: true,
                                          });
                                        },
                                      });
                                      return;
                                    }
                                    if (values.action === "status") {
                                      const status = String(values.project_status ?? "").trim();
                                      if (!status) {
                                        apiMessage.warning("Informe status do projeto.");
                                        return;
                                      }
                                      await runAdminEntityAction({
                                        path: `/projects/${id}/status`,
                                        method: "PATCH",
                                        body: { status },
                                        successMessage: "Status do projeto atualizado.",
                                        reloadCrud: true,
                                      });
                                      return;
                                    }
                                    if (values.action === "patch") {
                                      const payload = parseJsonObjectOrNull(String(values.payload ?? "{}"));
                                      if (payload === null) {
                                        apiMessage.error("Payload JSON invalido.");
                                        return;
                                      }
                                      await runAdminEntityAction({
                                        path: `/projects/${id}`,
                                        method: "PATCH",
                                        body: payload,
                                        successMessage: "Projeto atualizado.",
                                        reloadCrud: true,
                                        reloadGroups: true,
                                      });
                                      return;
                                    }
                                    await runAdminEntityAction({
                                      path: `/projects/${id}`,
                                      successMessage: "Detalhes de projeto carregados.",
                                    });
                                  }}
                                >
                                  <Form.Item name="id" label="Projeto" rules={[{ required: true }]}>
                                    <Select
                                      showSearch
                                      optionFilterProp="label"
                                      options={projects.map((row) => ({
                                        value: String(row.id),
                                        label: String(row.name ?? row.id),
                                      }))}
                                    />
                                  </Form.Item>
                                  <Form.Item name="action" label="Acao" rules={[{ required: true }]}>
                                    <Select
                                      options={[
                                        { value: "get", label: "Buscar detalhes" },
                                        { value: "patch", label: "Atualizar projeto" },
                                        { value: "status", label: "Atualizar status do projeto" },
                                        { value: "delete", label: "Excluir projeto" },
                                      ]}
                                    />
                                  </Form.Item>
                                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.action !== curr.action}>
                                    {({ getFieldValue }) =>
                                      getFieldValue("action") === "status" ? (
                                        <Form.Item name="project_status" label="Status do projeto" style={{ marginTop: 12 }}>
                                          <Input placeholder="Ex.: active, on_hold, done" />
                                        </Form.Item>
                                      ) : null
                                    }
                                  </Form.Item>
                                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.action !== curr.action}>
                                    {({ getFieldValue }) =>
                                      getFieldValue("action") === "patch" ? (
                                        <Form.Item name="payload" label="Payload PATCH (JSON)">
                                          <Input.TextArea
                                            rows={4}
                                            placeholder={'Ex.: {"name":"Projeto XPTO","client_id":"uuid","end_date":"2026-12-31T00:00:00Z"}'}
                                          />
                                        </Form.Item>
                                      ) : null
                                    }
                                  </Form.Item>
                                  <Button htmlType="submit" type="primary">
                                    Executar
                                  </Button>
                                </Form>
                              ),
                            },
                            {
                              key: "entity-task-assignee",
                              label: "Tarefa responsavel",
                              children: (
                                <Form
                                  layout="vertical"
                                  onFinish={async (values) => {
                                    const taskId = String(values.task_id ?? "").trim();
                                    if (!taskId) return;
                                    const hasAssignee =
                                      values.assignee_id !== undefined &&
                                      values.assignee_id !== null &&
                                      String(values.assignee_id).trim() !== "";
                                    await runAdminEntityAction({
                                      path: `/tasks/${taskId}/assignee`,
                                      method: "PATCH",
                                      body: { assignee_id: hasAssignee ? Number(values.assignee_id) : null },
                                      successMessage: "Responsavel da tarefa atualizado.",
                                      reloadGroups: true,
                                    });
                                  }}
                                >
                                  <Form.Item name="task_id" label="Task UUID" rules={[{ required: true }]}>
                                    <Input placeholder="UUID da tarefa" />
                                  </Form.Item>
                                  <Form.Item name="assignee_id" label="Novo user_id (vazio para remover)">
                                    <InputNumber min={1} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Button htmlType="submit" type="primary">
                                    Atualizar responsavel
                                  </Button>
                                </Form>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="Resultado Admin/Ops">
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                          {adminOpsResult ? JSON.stringify(adminOpsResult, null, 2) : "Sem operacao executada."}
                        </pre>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "profile" && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Card title="Perfil do usuario">
                        {profileResult ? (
                          <Space orientation="vertical" style={{ width: "100%" }}>
                            <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                              <Space align="start">
                                <Avatar
                                  size={56}
                                  src={profileAvatarDataUrl || undefined}
                                  icon={!profileAvatarDataUrl ? <UserOutlined /> : undefined}
                                >
                                  {!profileAvatarDataUrl
                                    ? String(profileResult.display_name ?? profileResult.name ?? "U")
                                        .trim()
                                        .charAt(0)
                                        .toUpperCase()
                                    : null}
                                </Avatar>
                                <Space orientation="vertical" size={2}>
                                  <Typography.Text strong>{String(profileResult.display_name ?? "-")}</Typography.Text>
                                  <Typography.Text type="secondary">Cargo: {String(profileResult.job_title ?? "-")}</Typography.Text>
                                  <Typography.Text type="secondary">Email: {String(profileResult.professional_email ?? "-")}</Typography.Text>
                                  <Typography.Text type="secondary">Telefone: {String(profileResult.phone ?? "-")}</Typography.Text>
                                </Space>
                              </Space>
                              <Upload
                                showUploadList={false}
                                beforeUpload={(file) => {
                                  const isImage = file.type.startsWith("image/");
                                  if (!isImage) {
                                    apiMessage.error("Selecione apenas imagem.");
                                    return Upload.LIST_IGNORE;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const result = String(reader.result ?? "");
                                    setProfileAvatarDataUrl(result);
                                    if (typeof window !== "undefined" && currentUserId) {
                                      const raw = localStorage.getItem(`bb_profile_extra_${currentUserId}`);
                                      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
                                      localStorage.setItem(
                                        `bb_profile_extra_${currentUserId}`,
                                        JSON.stringify({ ...parsed, avatar_data_url: result }),
                                      );
                                    }
                                    apiMessage.success("Imagem de perfil atualizada.");
                                  };
                                  reader.readAsDataURL(file);
                                  return false;
                                }}
                              >
                                <Button icon={<EditOutlined />}>Subir imagem</Button>
                              </Upload>
                            </Space>
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
                    <Col span={24}>
                      <Card title="Dados pessoais e custo por hora-homem">
                        <Form
                          form={profileDetailsForm}
                          layout="vertical"
                          onFinish={async (values) => {
                            const payload = {
                              full_name: String(values.full_name ?? ""),
                              personal_email: String(values.personal_email ?? ""),
                              phone: String(values.phone ?? ""),
                              birth_date: String(values.birth_date ?? ""),
                              hourly_cost: Number(values.hourly_cost ?? 0),
                              avatar_data_url: profileAvatarDataUrl,
                            };
                            const updateProfileResp = await apiRequest<{ profile: Record<string, unknown> }>(
                              "/me/collaborator-profile",
                              {
                                method: "PATCH",
                                token,
                                body: {
                                  display_name: payload.full_name,
                                  professional_email: payload.personal_email,
                                  phone: payload.phone,
                                },
                              },
                            );
                            if (!updateProfileResp.ok) {
                              apiMessage.error(updateProfileResp.error?.message ?? "Falha ao atualizar perfil.");
                              return;
                            }
                            setProfileResult((prev) => ({
                              ...(prev ?? {}),
                              ...(updateProfileResp.data?.profile ?? {}),
                            }));
                            if (typeof window !== "undefined" && currentUserId) {
                              localStorage.setItem(`bb_profile_extra_${currentUserId}`, JSON.stringify(payload));
                            }
                            apiMessage.success("Dados do perfil salvos.");
                          }}
                        >
                          <Row gutter={16}>
                            <Col xs={24} md={12}>
                              <Form.Item name="full_name" label="Nome completo" rules={[{ required: true }]}>
                                <Input placeholder="Nome da pessoa" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="personal_email" label="Email pessoal/profissional" rules={[{ required: true }]}>
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="phone" label="Telefone">
                                <Input placeholder="Ex.: +55 11 99999-0000" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="birth_date" label="Data de aniversario">
                                <Input type="date" />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="hourly_cost" label="Custo por hora-homem">
                                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Button htmlType="submit" type="primary">
                            Salvar dados do perfil
                          </Button>
                        </Form>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "notifications" && (
                  <Card title="Central de notificacoes">
                    <Space style={{ marginBottom: 12 }}>
                      <Tag color={unreadCount > 0 ? "processing" : "default"}>{unreadCount} nao lidas</Tag>
                      <Button size="small" onClick={() => fetchNotifications().catch(() => undefined)}>
                        Atualizar
                      </Button>
                      <Button
                        size="small"
                        onClick={async () => {
                          const response = await apiRequest("/notifications/deadline-scan", {
                            method: "POST",
                            token,
                            body: {},
                          });
                          if (!response.ok) {
                            apiMessage.error(response.error?.message ?? "Falha ao disparar varredura de prazos.");
                            return;
                          }
                          apiMessage.success("Varredura de prazos enfileirada.");
                        }}
                      >
                        Disparar deadline-scan
                      </Button>
                    </Space>
                    <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                      {notifications.length === 0 ? (
                        <Empty description="Nenhuma notificacao no momento." />
                      ) : null}
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

                {activeKey === "governance" && isAdmin && (
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
                      <Card title="Permissao pontual (assignment)">
                        <Form
                          layout="vertical"
                          initialValues={{ effect: "allow", scope_type: "workspace" }}
                          onFinish={async (values) => {
                            const response = await apiRequest<Record<string, unknown>>("/permissions/assignments", {
                              method: "POST",
                              token,
                              body: {
                                workspace_id: values.workspace_id,
                                subject_type: "user",
                                subject_id: values.subject_id,
                                scope_type: values.scope_type,
                                scope_id: values.scope_id,
                                permission_key: values.permission_key,
                                effect: values.effect,
                              },
                            });
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Falha ao criar/atualizar permissao.");
                              return;
                            }
                            setGovernanceResult(response.data ?? null);
                            apiMessage.success("Permissao aplicada.");
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
                            <InputNumber min={1} style={{ width: "100%" }} />
                          </Form.Item>
                          <Form.Item name="scope_type" label="Tipo de escopo" rules={[{ required: true }]}>
                            <Select options={SCOPE_TYPE_OPTIONS} />
                          </Form.Item>
                          <Form.Item name="scope_id" label="ID do escopo (UUID)" rules={[{ required: true }]}>
                            <Input />
                          </Form.Item>
                          <Form.Item name="permission_key" label="Permissao" rules={[{ required: true }]}>
                            <Select options={PERMISSION_KEY_OPTIONS} />
                          </Form.Item>
                          <Form.Item name="effect" label="Efeito" rules={[{ required: true }]}>
                            <Select
                              options={[
                                { value: "allow", label: "allow" },
                                { value: "deny", label: "deny" },
                              ]}
                            />
                          </Form.Item>
                          <Button htmlType="submit" type="primary">
                            Aplicar permissao
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
                    <Col xs={24} lg={12}>
                      <Card title="Permissoes em lote (preview/apply)">
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            const items = safeJsonArrayParse(bulkPermissionItemsText);
                            if (!items) {
                              apiMessage.error("JSON de itens invalido. Envie uma lista de objetos.");
                              return;
                            }
                            const response = await apiRequest<Record<string, unknown>>("/permissions/bulk/preview", {
                              method: "POST",
                              token,
                              body: {
                                workspace_id: values.workspace_id,
                                items,
                              },
                            });
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Falha ao gerar preview em lote.");
                              return;
                            }
                            const previewId = String((response.data?.preview_id as string | undefined) ?? "");
                            setBulkPreviewId(previewId || null);
                            setGovernanceResult(response.data ?? null);
                            apiMessage.success("Preview de lote gerado.");
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
                          <Form.Item label="Itens (JSON array)">
                            <Input.TextArea
                              rows={9}
                              value={bulkPermissionItemsText}
                              onChange={(event) => setBulkPermissionItemsText(event.target.value)}
                            />
                          </Form.Item>
                          <Space wrap>
                            <Button type="primary" htmlType="submit">
                              Gerar preview
                            </Button>
                            <Button
                              onClick={async () => {
                                if (!bulkPreviewId) {
                                  apiMessage.warning("Gere um preview antes de aplicar.");
                                  return;
                                }
                                const response = await apiRequest<Record<string, unknown>>("/permissions/bulk/apply", {
                                  method: "POST",
                                  token,
                                  body: { preview_id: bulkPreviewId, mode: "partial" },
                                });
                                if (!response.ok) {
                                  apiMessage.error(response.error?.message ?? "Falha ao aplicar lote.");
                                  return;
                                }
                                setGovernanceResult(response.data ?? null);
                                apiMessage.success("Lote aplicado.");
                              }}
                            >
                              Aplicar preview
                            </Button>
                          </Space>
                          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                            O apply aceita apenas o preview gerado pelo proprio usuario logado.
                          </Typography.Paragraph>
                        </Form>
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
                            <Input placeholder="UUID do portfolio, projeto, grupo ou workspace" />
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

                {activeKey === "audit" && isAdmin && (
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

                {activeKey === "stats" && isAdmin && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={8}>
                      <Card title="Estatisticas do workspace">
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
                      <Card title="Estatisticas do projeto">
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
                  <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                    <Space wrap align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                      <Space wrap size={4} align="center">
                        <Button
                          type="link"
                          onClick={() => {
                            setSelectedWorkspaceId(null);
                            setSelectedClientId(null);
                            setSelectedProjectId(null);
                            setSelectedBoardId(null);
                          }}
                          style={{ paddingInline: 0 }}
                        >
                          Areas de trabalho
                        </Button>
                        {selectedWorkspace ? (
                          <>
                            <Typography.Text type="secondary">/</Typography.Text>
                            <Button
                              type="link"
                              onClick={() => {
                                setSelectedClientId(null);
                                setSelectedProjectId(null);
                                setSelectedBoardId(null);
                              }}
                              style={{ paddingInline: 0 }}
                            >
                              {`Area de trabalho: ${String(selectedWorkspace.name ?? "Area de trabalho")}`}
                            </Button>
                          </>
                        ) : null}
                        {selectedClient ? (
                          <>
                            <Typography.Text type="secondary">/</Typography.Text>
                            <Button
                              type="link"
                              onClick={() => {
                                setSelectedProjectId(null);
                                setSelectedBoardId(null);
                              }}
                              style={{ paddingInline: 0 }}
                            >
                              {`Cliente: ${String(selectedClient.name ?? "Cliente")}`}
                            </Button>
                          </>
                        ) : null}
                        {selectedProject ? (
                          <>
                            <Typography.Text type="secondary">/</Typography.Text>
                            <Typography.Text strong>{`Projeto: ${String(selectedProject.name ?? "Projeto")}`}</Typography.Text>
                            <Typography.Text type="secondary">/</Typography.Text>
                            <Typography.Text strong>Tarefas</Typography.Text>
                          </>
                        ) : null}
                      </Space>
                      <Space wrap>
                        {!selectedWorkspaceId && isAdmin ? (
                          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateWorkspaceOpen(true)}>
                            Nova area de trabalho
                          </Button>
                        ) : null}
                        {selectedWorkspaceId && !selectedClientId && isAdmin ? (
                          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateClientOpen(true)}>
                            Novo cliente
                          </Button>
                        ) : null}
                        {selectedClientId && !selectedProjectId && isAdmin ? (
                          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateProjectOpen(true)}>
                            Novo projeto
                          </Button>
                        ) : null}
                        {selectedProjectId && isAdmin ? (
                          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateBoardOpen(true)}>
                            Novo grupo
                          </Button>
                        ) : null}
                      </Space>
                    </Space>

                    {selectedProjectId && isAdmin ? (() => {
                      const projectBoards = boardsForProject(selectedProjectId);
                      const projectBoardIds = new Set(projectBoards.map((b) => b.id));
                      const projectSelectedEntries = Object.entries(selectedTaskIdsByBoardId).filter(
                        ([bid, ids]) => projectBoardIds.has(bid) && ids.length > 0,
                      );
                      const totalSelected = projectSelectedEntries.reduce(
                        (acc, [, ids]) => acc + ids.length,
                        0,
                      );
                      if (totalSelected === 0) return null;
                      const sourceBoardIds = new Set(projectSelectedEntries.map(([bid]) => bid));
                      const globalOptions = projectBoards
                        .filter((b) => !sourceBoardIds.has(b.id))
                        .map((b) => ({ value: b.id, label: String(b.name ?? "Quadro") }));
                      const globalTargetBoardId = bulkMoveGlobalTargetByProjectId[selectedProjectId];
                      const canMove = totalSelected > 0 && Boolean(globalTargetBoardId);
                      return (
                        <Affix offsetTop={64}>
                          <Card
                            size="small"
                            style={{
                              background: "#F0F7FF",
                              borderColor: "#1677ff",
                              boxShadow: "0 4px 12px rgba(22,119,255,0.12)",
                            }}
                            styles={{ body: { padding: "8px 12px" } }}
                          >
                            <Space wrap align="center" style={{ width: "100%", justifyContent: "space-between" }}>
                              <Space wrap align="center">
                                <Tag color="processing" style={{ fontSize: 13, padding: "2px 10px" }}>
                                  {totalSelected} tarefa{totalSelected === 1 ? "" : "s"} selecionada{totalSelected === 1 ? "" : "s"}
                                  {sourceBoardIds.size > 1 ? ` em ${sourceBoardIds.size} boards` : null}
                                </Tag>
                              </Space>
                              <Space wrap align="center">
                                <Select
                                  size="small"
                                  style={{ minWidth: 240 }}
                                  placeholder="Mover para o board..."
                                  allowClear
                                  value={globalTargetBoardId}
                                  options={globalOptions}
                                  disabled={globalOptions.length === 0}
                                  onChange={(value) =>
                                    setBulkMoveGlobalTargetByProjectId((prev) => {
                                      const next = { ...prev };
                                      if (!value) delete next[selectedProjectId];
                                      else next[selectedProjectId] = value;
                                      return next;
                                    })
                                  }
                                />
                                <Button
                                  type="primary"
                                  size="small"
                                  disabled={!canMove}
                                  onClick={async () => {
                                    if (!globalTargetBoardId) return;
                                    const groupsResp = await apiRequest<{ groups: GroupItem[] }>(
                                      `/boards/${globalTargetBoardId}/groups`,
                                      { token },
                                    );
                                    let targetGroupId: string | undefined;
                                    if (groupsResp.ok) {
                                      const orderedGroups = [...(groupsResp.data?.groups ?? [])].sort(
                                        (a, b) => a.position - b.position,
                                      );
                                      targetGroupId = orderedGroups[0]?.id ? String(orderedGroups[0].id) : undefined;
                                    }
                                    if (!targetGroupId) {
                                      const createDefaultGroup = await apiRequest<{ group?: { id?: string } }>(
                                        `/boards/${globalTargetBoardId}/groups`,
                                        {
                                          method: "POST",
                                          token,
                                          body: { name: "Lista principal", wip_limit: 50 },
                                        },
                                      );
                                      if (!createDefaultGroup.ok) {
                                        apiMessage.error(
                                          createDefaultGroup.error?.message ??
                                            "Falha ao preparar lista do board de destino.",
                                        );
                                        return;
                                      }
                                      targetGroupId = String(createDefaultGroup.data?.group?.id ?? "");
                                      if (!targetGroupId) {
                                        apiMessage.error("Nao foi possivel identificar a lista de destino.");
                                        return;
                                      }
                                    }
                                    const allTaskIds = projectSelectedEntries.flatMap(([, ids]) => ids);
                                    console.warn("[bulk-move-global]", {
                                      projectId: selectedProjectId,
                                      taskIds: allTaskIds,
                                      targetBoardId: globalTargetBoardId,
                                      targetGroupId,
                                    });
                                    const results = await Promise.all(
                                      allTaskIds.map((taskId) =>
                                        apiRequest<{ task: TaskItem }>(`/tasks/${taskId}`, {
                                          method: "PATCH",
                                          token,
                                          body: { group_id: targetGroupId },
                                        }),
                                      ),
                                    );
                                    const failed = results.filter((response) => !response.ok).length;
                                    if (failed > 0) {
                                      const firstError = results.find((response) => !response.ok);
                                      apiMessage.error(
                                        firstError?.error?.message ??
                                          `Falha ao mover ${failed} tarefa(s).`,
                                      );
                                    } else {
                                      apiMessage.success(`${allTaskIds.length} tarefa(s) movida(s).`);
                                      setSelectedTaskIdsByBoardId((prev) => {
                                        const next = { ...prev };
                                        for (const id of sourceBoardIds) delete next[id];
                                        return next;
                                      });
                                      setBulkMoveGlobalTargetByProjectId((prev) => {
                                        const next = { ...prev };
                                        delete next[selectedProjectId];
                                        return next;
                                      });
                                    }
                                    await fetchTasks();
                                    await refreshBoardViewsForProject(selectedProjectId);
                                  }}
                                >
                                  Mover
                                </Button>
                                <Button
                                  size="small"
                                  onClick={() => {
                                    setSelectedTaskIdsByBoardId((prev) => {
                                      const next = { ...prev };
                                      for (const id of sourceBoardIds) delete next[id];
                                      return next;
                                    });
                                  }}
                                >
                                  Limpar
                                </Button>
                              </Space>
                            </Space>
                          </Card>
                        </Affix>
                      );
                    })() : null}

                    {!selectedWorkspaceId && (
                      <Card title="Areas de trabalho">
                        {visibleWorkspaces.length === 0 ? (
                          <Empty description={isAdmin ? "Nenhuma area de trabalho. Crie a primeira para comecar." : "Voce ainda nao foi adicionado a nenhuma area de trabalho."} />
                        ) : (
                          <Row gutter={[16, 16]}>
                            {visibleWorkspaces.map((ws) => {
                              const wsId = String(ws.id);
                              const wsClients = clientsForWorkspace(wsId).length;
                              const wsProjects = (projectsByWorkspace[wsId] ?? []).length;
                              return (
                                <Col xs={24} sm={12} lg={8} xl={6} key={wsId}>
                                  <Card
                                    hoverable
                                    onClick={() => {
                                      setSelectedWorkspaceId(wsId);
                                      setSelectedClientId(null);
                                      setSelectedProjectId(null);
                                      setSelectedBoardId(null);
                                    }}
                                    title={String(ws.name ?? "Area de trabalho")}
                                    extra={
                                      isAdmin ? (
                                        <Space
                                          size={0}
                                          onClick={(event) => event.stopPropagation()}
                                          onMouseDown={(event) => event.stopPropagation()}
                                        >
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<EditOutlined />}
                                            aria-label="Renomear area"
                                            onClick={() => {
                                              editWorkspaceForm.setFieldsValue({
                                                name: String(ws.name ?? ""),
                                              });
                                              setSelectedWorkspaceId(wsId);
                                              setEditWorkspaceOpen(true);
                                            }}
                                          />
                                          <Button
                                            type="text"
                                            size="small"
                                            danger
                                            icon={<DeleteOutlined />}
                                            aria-label="Excluir area"
                                            onClick={() =>
                                              openDeleteConfirmModal({
                                                title: `Excluir a area "${String(ws.name ?? "Area")}"?`,
                                                onConfirm: async () => {
                                                  const response = await apiRequest(`/workspaces/${wsId}`, {
                                                    method: "DELETE",
                                                    token,
                                                  });
                                                  if (!response.ok) {
                                                    apiMessage.error(response.error?.message ?? "Falha ao excluir area.");
                                                    throw new Error("workspace_delete_failed");
                                                  }
                                                  apiMessage.success("Area de trabalho excluida.");
                                                  if (selectedWorkspaceId === wsId) {
                                                    setSelectedWorkspaceId(null);
                                                    setSelectedClientId(null);
                                                    setSelectedProjectId(null);
                                                    setSelectedBoardId(null);
                                                  }
                                                  await fetchCrudData();
                                                  await fetchBoards();
                                                },
                                              })
                                            }
                                          />
                                        </Space>
                                      ) : null
                                    }
                                  >
                                    <Space orientation="vertical" size={4}>
                                      <Tag color="processing">{wsClients} clientes</Tag>
                                      <Tag color="purple">{wsProjects} projetos</Tag>
                                    </Space>
                                  </Card>
                                </Col>
                              );
                            })}
                          </Row>
                        )}
                      </Card>
                    )}

                    {selectedWorkspaceId && !selectedClientId && (
                      <Card title={`Clientes em ${String(selectedWorkspace?.name ?? "")}`}>
                        {clientsForWorkspace(selectedWorkspaceId).length === 0 ? (
                          <Empty description={isAdmin ? "Sem clientes nesta area de trabalho. Cadastre o primeiro." : "Sem clientes vinculados aqui."} />
                        ) : (
                          <Row gutter={[16, 16]}>
                            {clientsForWorkspace(selectedWorkspaceId).map((client) => {
                              const clientId = String(client.id);
                              const projectsCount = projectsForClient(selectedWorkspaceId, clientId).length;
                              return (
                                <Col xs={24} sm={12} lg={8} xl={6} key={clientId}>
                                  <Card
                                    hoverable
                                    onClick={() => {
                                      setSelectedClientId(clientId);
                                      setSelectedProjectId(null);
                                      setSelectedBoardId(null);
                                    }}
                                    title={String(client.name ?? "Cliente")}
                                    extra={
                                      isAdmin ? (
                                        <Space
                                          size={0}
                                          onClick={(event) => event.stopPropagation()}
                                          onMouseDown={(event) => event.stopPropagation()}
                                        >
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<EditOutlined />}
                                            aria-label="Renomear cliente"
                                            onClick={() =>
                                              openTextInputModal({
                                                title: "Renomear cliente",
                                                initialValue: String(client.name ?? ""),
                                                placeholder: "Novo nome do cliente",
                                                onSubmit: async (nextName) => {
                                                  const response = await apiRequest(`/clients/${clientId}`, {
                                                    method: "PATCH",
                                                    token,
                                                    body: { name: nextName },
                                                  });
                                                  if (!response.ok) {
                                                    apiMessage.error(response.error?.message ?? "Falha ao renomear cliente.");
                                                    throw new Error("client_rename_failed");
                                                  }
                                                  apiMessage.success("Cliente atualizado.");
                                                  await fetchCrudData();
                                                },
                                              })
                                            }
                                          />
                                        </Space>
                                      ) : null
                                    }
                                  >
                                    <Space orientation="vertical" size={4}>
                                      <Tag color="purple">{projectsCount} projetos</Tag>
                                      <Typography.Text type="secondary">Status: {String(client.status ?? "-")}</Typography.Text>
                                    </Space>
                                  </Card>
                                </Col>
                              );
                            })}
                          </Row>
                        )}
                      </Card>
                    )}

                    {selectedWorkspaceId && selectedClientId && !selectedProjectId && (
                      <Card title={`Projetos de ${String(selectedClient?.name ?? "")}`}>
                        {projectsForClient(selectedWorkspaceId, selectedClientId).length === 0 ? (
                          <Empty description={isAdmin ? "Sem projetos para este cliente. Crie o primeiro." : "Sem projetos vinculados."} />
                        ) : (
                          <Row gutter={[16, 16]}>
                            {projectsForClient(selectedWorkspaceId, selectedClientId).map((project) => {
                              const projectId = String(project.id);
                              const projectBoards = boardsForProject(projectId).length;
                              return (
                                <Col xs={24} sm={12} lg={8} xl={6} key={projectId}>
                                  <Card
                                    hoverable
                                    onClick={() => {
                                      setSelectedProjectId(projectId);
                                      const firstBoard = boardsForProject(projectId)[0]?.id ?? null;
                                      setSelectedBoardId(firstBoard);
                                    }}
                                    title={String(project.name ?? "Projeto")}
                                    extra={
                                      isAdmin ? (
                                        <Space
                                          size={0}
                                          onClick={(event) => event.stopPropagation()}
                                          onMouseDown={(event) => event.stopPropagation()}
                                        >
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<EditOutlined />}
                                            aria-label="Renomear projeto"
                                            onClick={() =>
                                              openTextInputModal({
                                                title: "Renomear projeto",
                                                initialValue: String(project.name ?? ""),
                                                placeholder: "Novo nome do projeto",
                                                onSubmit: async (nextName) => {
                                                  const response = await apiRequest(`/projects/${projectId}`, {
                                                    method: "PATCH",
                                                    token,
                                                    body: { name: nextName },
                                                  });
                                                  if (!response.ok) {
                                                    apiMessage.error(response.error?.message ?? "Falha ao renomear projeto.");
                                                    throw new Error("project_rename_failed");
                                                  }
                                                  apiMessage.success("Projeto atualizado.");
                                                  await fetchCrudData();
                                                },
                                              })
                                            }
                                          />
                                          <Button
                                            type="text"
                                            size="small"
                                            danger
                                            icon={<DeleteOutlined />}
                                            aria-label="Excluir projeto"
                                            onClick={() =>
                                              openDeleteConfirmModal({
                                                title: `Excluir o projeto "${String(project.name ?? "Projeto")}"?`,
                                                onConfirm: async () => {
                                                  const response = await apiRequest(`/projects/${projectId}`, {
                                                    method: "DELETE",
                                                    token,
                                                  });
                                                  if (!response.ok) {
                                                    apiMessage.error(response.error?.message ?? "Falha ao excluir projeto.");
                                                    throw new Error("project_delete_failed");
                                                  }
                                                  apiMessage.success("Projeto excluido.");
                                                  if (selectedProjectId === projectId) {
                                                    setSelectedProjectId(null);
                                                    setSelectedBoardId(null);
                                                  }
                                                  await fetchCrudData();
                                                  await fetchBoards();
                                                },
                                              })
                                            }
                                          />
                                        </Space>
                                      ) : null
                                    }
                                  >
                                    <Space orientation="vertical" size={4}>
                                      <Tag color="processing">{projectBoards} grupos</Tag>
                                      <Typography.Text type="secondary">Status: {String(project.status ?? "-")}</Typography.Text>
                                    </Space>
                                  </Card>
                                </Col>
                              );
                            })}
                          </Row>
                        )}
                      </Card>
                    )}

                    {selectedProjectId && (
                      boardsForProject(selectedProjectId).length === 0 ? (
                        <Card title={`Grupos do projeto ${String(selectedProject?.name ?? "")}`}>
                          <Empty description={isAdmin ? "Sem grupos neste projeto. Crie o primeiro." : "Sem grupos disponiveis."} />
                        </Card>
                      ) : (
                        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                          {boardsForProject(selectedProjectId).map((board) => {
                            const boardId = board.id;
                            const boardViewModeForBoard = boardViewModeByBoardId[boardId] ?? "list";
                            const boardKanban = boardKanbanByBoardId[boardId] ?? [];
                            const projectBoards = selectedProjectId ? boardsForProject(selectedProjectId) : [];
                            const projectBoardIds = new Set(projectBoards.map((item) => item.id));
                            const projectBoardOptions = projectBoards.map((projectBoard) => ({
                              value: projectBoard.id,
                              label: String(projectBoard.name ?? "Quadro"),
                            }));
                            const firstGroupIdByBoardId = Object.values(boardGroupsIndex)
                              .filter((group) => projectBoardIds.has(group.board_id))
                              .sort((a, b) => a.position - b.position)
                              .reduce<Record<string, string>>((acc, group) => {
                                if (!acc[group.board_id]) acc[group.board_id] = group.id;
                                return acc;
                              }, {});
                            const projectGroupOptions = Object.values(boardGroupsIndex)
                              .filter((group) => projectBoardIds.has(group.board_id))
                              .map((group) => {
                                const groupBoard = projectBoards.find((item) => item.id === group.board_id);
                                return {
                                  value: group.id,
                                  label: `${String(groupBoard?.name ?? "Quadro")} / ${formatColumnLabel(group.name)}`,
                                };
                              })
                              .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
                            const selectedTaskCount = selectedTaskIdsByBoardId[boardId]?.length ?? 0;
                            const projectBoardOptionsExcludingCurrent = projectBoardOptions.filter(
                              (option) => option.value !== boardId,
                            );
                            const targetBoardIdForBoard = bulkMoveTargetGroupByBoardId[boardId];
                            const boardListTasks = boardListTasksByBoardId[boardId] ?? [];
                            const boardLoading = Boolean(boardKanbanLoading[boardId]);
                            const isDragActive = Boolean(draggingTaskId);
                            const isBoardDropHighlight = isDragActive && dragOverBoardId === boardId;
                            const handleCrossBoardMove = async (taskId: string, targetGroupId: string) => {
                              const sourceBoardId = findBoardOfTask(taskId);
                              await moveTaskToGroup(taskId, targetGroupId);
                              const destView = boardViewModeByBoardId[boardId] ?? "list";
                              await fetchKanbanForBoard(boardId, destView).catch(() => undefined);
                              if (sourceBoardId && sourceBoardId !== boardId) {
                                const srcView = boardViewModeByBoardId[sourceBoardId] ?? "list";
                                await fetchKanbanForBoard(sourceBoardId, srcView).catch(() => undefined);
                              }
                            };
                            return (
                              <Card
                                key={boardId}
                                title={board.name}
                                style={{
                                  borderColor: isBoardDropHighlight ? "#1677ff" : undefined,
                                  boxShadow: isBoardDropHighlight ? "0 0 0 2px rgba(22,119,255,0.2)" : undefined,
                                  transition: "border-color 120ms, box-shadow 120ms",
                                }}
                                onDragOver={(event) => {
                                  if (!isAdmin) return;
                                  if (!draggingTaskId) return;
                                  event.preventDefault();
                                  if (dragOverBoardId !== boardId) setDragOverBoardId(boardId);
                                }}
                                onDragLeave={(event) => {
                                  const next = (event.relatedTarget as Node | null) ?? null;
                                  if (next && (event.currentTarget as Node).contains(next)) return;
                                  if (dragOverBoardId === boardId) setDragOverBoardId(null);
                                }}
                                onDrop={async (event) => {
                                  if (!isAdmin) return;
                                  event.preventDefault();
                                  setDragOverBoardId(null);
                                  if (!draggingTaskId) return;
                                  let firstGroupId = boardKanban[0]?.group.id;
                                  if (!firstGroupId) {
                                    const createDefaultGroup = await apiRequest<{ group?: { id?: string } }>(
                                      `/boards/${boardId}/groups`,
                                      {
                                        method: "POST",
                                        token,
                                        body: { name: "Lista principal", wip_limit: 50 },
                                      },
                                    );
                                    if (!createDefaultGroup.ok) {
                                      apiMessage.error(
                                        createDefaultGroup.error?.message ??
                                          "Falha ao preparar lista do board de destino.",
                                      );
                                      return;
                                    }
                                    firstGroupId = String(createDefaultGroup.data?.group?.id ?? "");
                                    if (!firstGroupId) {
                                      apiMessage.error("Nao foi possivel identificar a lista de destino.");
                                      return;
                                    }
                                  }
                                  await handleCrossBoardMove(draggingTaskId, firstGroupId);
                                  setDraggingTaskId(null);
                                }}
                                extra={
                                  <Space wrap>
                                    <Select
                                      value={boardViewModeForBoard}
                                      style={{ minWidth: 180 }}
                                      options={[
                                        { value: "list", label: "Lista" },
                                        { value: "kanban", label: "Colunas" },
                                        ...(isSuperuser ? [{ value: "timeline" as const, label: "Linha do tempo" }] : []),
                                      ]}
                                      onChange={(value) => {
                                        setBoardViewModeByBoardId((prev) => ({ ...prev, [boardId]: value as BoardViewMode }));
                                        fetchKanbanForBoard(boardId, value as BoardViewMode).catch(() => undefined);
                                      }}
                                    />
                                    {isAdmin ? (
                                      <>
                                        {boardViewModeForBoard === "list" ? (
                                          <>
                                            <Select
                                              size="small"
                                              style={{ minWidth: 210 }}
                                              placeholder="Selecione o board destino"
                                              allowClear
                                              value={targetBoardIdForBoard}
                                              options={projectBoardOptionsExcludingCurrent}
                                              disabled={projectBoardOptionsExcludingCurrent.length === 0}
                                              onChange={(value) =>
                                                setBulkMoveTargetGroupByBoardId((prev) => {
                                                  const next = { ...prev };
                                                  if (!value) delete next[boardId];
                                                  else next[boardId] = value;
                                                  return next;
                                                })
                                              }
                                            />
                                            <Button
                                              size="small"
                                              disabled={selectedTaskCount === 0 || !targetBoardIdForBoard}
                                              onClick={async () => {
                                                const taskIds = selectedTaskIdsByBoardId[boardId] ?? [];
                                                const targetBoardId = targetBoardIdForBoard;
                                                if (!targetBoardId || taskIds.length === 0) return;
                                                let targetGroupId = firstGroupIdByBoardId[targetBoardId];
                                                const groupsResp = await apiRequest<{ groups: GroupItem[] }>(
                                                  `/boards/${targetBoardId}/groups`,
                                                  { token },
                                                );
                                                if (groupsResp.ok) {
                                                  const orderedGroups = [...(groupsResp.data?.groups ?? [])].sort(
                                                    (a, b) => a.position - b.position,
                                                  );
                                                  targetGroupId = orderedGroups[0]?.id ? String(orderedGroups[0].id) : targetGroupId;
                                                }
                                                if (!targetGroupId) {
                                                  const createDefaultGroup = await apiRequest<{ group?: { id?: string } }>(
                                                    `/boards/${targetBoardId}/groups`,
                                                    {
                                                      method: "POST",
                                                      token,
                                                      body: { name: "Lista principal", wip_limit: 50 },
                                                    },
                                                  );
                                                  if (!createDefaultGroup.ok) {
                                                    apiMessage.error(
                                                      createDefaultGroup.error?.message ??
                                                        "Falha ao preparar lista do board de destino.",
                                                    );
                                                    return;
                                                  }
                                                  targetGroupId = String(createDefaultGroup.data?.group?.id ?? "");
                                                  if (!targetGroupId) {
                                                    apiMessage.error("Nao foi possivel identificar a lista de destino.");
                                                    return;
                                                  }
                                                }
                                                console.warn("[bulk-move]", { taskIds, targetBoardId, targetGroupId });
                                                const results = await Promise.all(
                                                  taskIds.map((taskId) =>
                                                    apiRequest<{ task: TaskItem }>(`/tasks/${taskId}`, {
                                                      method: "PATCH",
                                                      token,
                                                      body: { group_id: targetGroupId },
                                                    }),
                                                  ),
                                                );
                                                const failed = results.filter((response) => !response.ok).length;
                                                if (failed > 0) {
                                                  const firstError = results.find((response) => !response.ok);
                                                  apiMessage.error(
                                                    firstError?.error?.message ??
                                                      `Falha ao mover ${failed} tarefa(s).`,
                                                  );
                                                } else {
                                                  apiMessage.success(`${taskIds.length} tarefa(s) movida(s).`);
                                                  setSelectedTaskIdsByBoardId((prev) => ({ ...prev, [boardId]: [] }));
                                                }
                                                await fetchTasks();
                                                await refreshBoardViewsForProject(board.project_id);
                                              }}
                                            >
                                              {selectedTaskCount > 0 ? `Mover selecionadas (${selectedTaskCount})` : "Mover selecionadas"}
                                            </Button>
                                          </>
                                        ) : null}
                                        <Button
                                          size="small"
                                          icon={<PlusOutlined />}
                                          onClick={() => {
                                            setSelectedBoardId(boardId);
                                            setCreateGroupOpen(true);
                                          }}
                                        >
                                          Nova lista
                                        </Button>
                                        <Button
                                          type="primary"
                                          size="small"
                                          icon={<PlusOutlined />}
                                          onClick={() => {
                                            setSelectedBoardId(boardId);
                                            setComposeBoardId(boardId);
                                            setKanbanGroups(boardKanban);
                                            setCreateTaskOpen(true);
                                          }}
                                        >
                                          Nova tarefa
                                        </Button>
                                        <Button
                                          danger
                                          size="small"
                                          icon={<DeleteOutlined />}
                                          onClick={() =>
                                            openDeleteConfirmModal({
                                              title: "Excluir este grupo?",
                                              onConfirm: async () => {
                                                const response = await apiRequest(`/boards/${boardId}`, {
                                                  method: "DELETE",
                                                  token,
                                                });
                                                if (!response.ok) {
                                                  apiMessage.error(response.error?.message ?? "Falha ao excluir grupo.");
                                                  throw new Error("board_delete_failed");
                                                }
                                                apiMessage.success("Quadro excluido.");
                                                if (selectedBoardId === boardId) setSelectedBoardId(null);
                                                await fetchBoards();
                                                await fetchTasks();
                                                if (isAdmin) await fetchAllTasks().catch(() => undefined);
                                              },
                                            })
                                          }
                                        >
                                          Excluir grupo
                                        </Button>
                                      </>
                                    ) : null}
                                  </Space>
                                }
                              >
                                <Spin spinning={boardLoading}>
                                  {boardViewModeForBoard === "kanban" ? (
                                    boardKanban.length === 0 ? (
                                      <Empty description={isAdmin ? "Sem listas. Crie a primeira." : "Sem listas disponiveis."} />
                                    ) : (
                                      <Row gutter={[12, 12]} wrap={false} style={{ overflowX: "auto" }}>
                                        {boardKanban.map((column) => {
                                          const isColumnDropHighlight =
                                            isDragActive && dragOverGroupId === column.group.id;
                                          return (
                                          <Col key={column.group.id} flex="0 0 280px">
                                            <Card
                                              size="small"
                                              title={`${formatColumnLabel(column.group.name)} (${column.tasks.length})`}
                                              extra={
                                                isAdmin ? (
                                                  <Space size={4} wrap>
                                                    <Button
                                                      size="small"
                                                      type="text"
                                                      onClick={() => {
                                                        openTextInputModal({
                                                          title: "Renomear lista",
                                                          initialValue: column.group.name,
                                                          placeholder: "Novo nome da lista",
                                                          onSubmit: async (nextName) => {
                                                            const ok = await patchEntity(
                                                              `/groups/${column.group.id}`,
                                                              { name: nextName, wip_limit: column.group.wip_limit },
                                                              "Coluna atualizada.",
                                                            );
                                                            if (ok) {
                                                              await fetchKanbanForBoard(boardId, boardViewModeForBoard);
                                                            }
                                                          },
                                                        });
                                                      }}
                                                    >
                                                      Editar
                                                    </Button>
                                                    <Button
                                                      size="small"
                                                      type="text"
                                                      danger
                                                      icon={<DeleteOutlined />}
                                                      onClick={() =>
                                                        openDeleteConfirmModal({
                                                          title: "Excluir esta lista?",
                                                          onConfirm: async () => {
                                                            const response = await apiRequest(`/groups/${column.group.id}`, {
                                                              method: "DELETE",
                                                              token,
                                                            });
                                                            if (!response.ok) {
                                                              apiMessage.error(response.error?.message ?? "Falha ao excluir lista.");
                                                              throw new Error("group_delete_failed");
                                                            }
                                                            apiMessage.success("Coluna excluida.");
                                                            await fetchKanbanForBoard(boardId, boardViewModeForBoard);
                                                            await fetchTasks();
                                                            if (isAdmin) await fetchAllTasks().catch(() => undefined);
                                                          },
                                                        })
                                                      }
                                                    >
                                                      Excluir
                                                    </Button>
                                                  </Space>
                                                ) : null
                                              }
                                              onDragOver={(event) => {
                                                if (!draggingTaskId) return;
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (dragOverGroupId !== column.group.id) {
                                                  setDragOverGroupId(column.group.id);
                                                }
                                                if (dragOverBoardId !== boardId) {
                                                  setDragOverBoardId(boardId);
                                                }
                                              }}
                                              onDragLeave={(event) => {
                                                const next = (event.relatedTarget as Node | null) ?? null;
                                                if (next && (event.currentTarget as Node).contains(next)) return;
                                                if (dragOverGroupId === column.group.id) setDragOverGroupId(null);
                                              }}
                                              onDrop={async (event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setDragOverGroupId(null);
                                                setDragOverBoardId(null);
                                                if (!draggingTaskId) return;
                                                await handleCrossBoardMove(draggingTaskId, column.group.id);
                                                setDraggingTaskId(null);
                                              }}
                                              style={{
                                                minHeight: 140,
                                                borderColor: isColumnDropHighlight ? "#1677ff" : undefined,
                                                background: isColumnDropHighlight ? "rgba(22,119,255,0.06)" : undefined,
                                                transition: "border-color 120ms, background 120ms",
                                              }}
                                            >
                                              <Space orientation="vertical" style={{ width: "100%" }}>
                                                {column.tasks.map((task) => (
                                                  <Card
                                                    key={task.id}
                                                    type="inner"
                                                    size="small"
                                                    draggable={isAdmin}
                                                    onClick={() => openTask(task)}
                                                    onDragStart={(event) => {
                                                      if (!isAdmin) return;
                                                      event.dataTransfer.setData("text/plain", task.id);
                                                      event.dataTransfer.effectAllowed = "move";
                                                      setDraggingTaskId(task.id);
                                                    }}
                                                    onDragEnd={() => {
                                                      setDraggingTaskId(null);
                                                      setDragOverGroupId(null);
                                                      setDragOverBoardId(null);
                                                    }}
                                                    style={{ cursor: "pointer" }}
                                                    extra={
                                                      isAdmin ? (
                                                        <Space
                                                          size={0}
                                                          onClick={(event) => event.stopPropagation()}
                                                          onMouseDown={(event) => event.stopPropagation()}
                                                        >
                                                          <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<EditOutlined />}
                                                            aria-label="Editar tarefa"
                                                            onClick={() => openTask(task).catch(() => undefined)}
                                                          />
                                                          <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            icon={<DeleteOutlined />}
                                                            aria-label="Excluir tarefa"
                                                            onClick={() =>
                                                              openDeleteConfirmModal({
                                                                title: "Excluir esta tarefa?",
                                                                onConfirm: async () => {
                                                                  const ok = await deleteTaskById(task.id);
                                                                  if (!ok) throw new Error("task_delete_failed");
                                                                },
                                                              })
                                                            }
                                                          />
                                                        </Space>
                                                      ) : null
                                                    }
                                                  >
                                                    <Typography.Text strong>{task.title}</Typography.Text>
                                                    {task.description ? (
                                                      <Typography.Paragraph
                                                        ellipsis={{ rows: 2 }}
                                                        type="secondary"
                                                        style={{ marginBottom: 8, marginTop: 6 }}
                                                      >
                                                        {task.description}
                                                      </Typography.Paragraph>
                                                    ) : null}
                                                    <div>
                                                      {renderStatusTag(task.status)}
                                                      {renderPriorityTag(task.priority)}
                                                      <Tag color="purple">Horas {formatEffortHoursDisplay(task.effort_points)}</Tag>
                                                      {task.assignee_id ? (
                                                        <Tag color="blue">
                                                          Resp.:{" "}
                                                          {(() => {
                                                            const sid = task.assignee_id;
                                                            const row = taskAssigneePickList.find((u) => u.id === sid);
                                                            return row ? row.name : `Usuario ${sid}`;
                                                          })()}
                                                        </Tag>
                                                      ) : null}
                                                      {task.end_date ? <Tag color="orange">Prazo {formatDate(task.end_date)}</Tag> : null}
                                                    </div>
                                                    <div onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                                                      <Select
                                                        size="small"
                                                        style={{ width: "100%", marginTop: 8 }}
                                                        value={task.group_id}
                                                        options={projectGroupOptions}
                                                        onChange={async (nextGroupId) => {
                                                          await moveTaskToGroup(task.id, nextGroupId);
                                                          await fetchKanbanForBoard(boardId, boardViewModeForBoard);
                                                        }}
                                                      />
                                                    </div>
                                                  </Card>
                                                ))}
                                              </Space>
                                            </Card>
                                          </Col>
                                          );
                                        })}
                                      </Row>
                                    )
                                  ) : (
                                    <Table<TaskItem>
                                      rowKey="id"
                                      dataSource={boardListTasks}
                                      pagination={{ pageSize: 8 }}
                                      rowSelection={{
                                        selectedRowKeys: selectedTaskIdsByBoardId[boardId] ?? [],
                                        onChange: (selectedRowKeys) =>
                                          setSelectedTaskIdsByBoardId((prev) => ({
                                            ...prev,
                                            [boardId]: selectedRowKeys.map((key) => String(key)),
                                          })),
                                      }}
                                      onRow={(record) => ({
                                        onClick: () => openTask(record),
                                        style: { cursor: "pointer" },
                                      })}
                                      columns={[
                                        { title: "Titulo", dataIndex: "title" },
                                        { title: "Status", dataIndex: "status", render: (value: string) => renderStatusTag(value) },
                                        { title: "Prioridade", dataIndex: "priority", render: (value: string) => renderPriorityTag(value) },
                                        { title: "Prazo", dataIndex: "end_date", render: (value: string | null) => formatDate(value) },
                                        {
                                          title: "Acoes",
                                          render: (record: TaskItem) => (
                                            <Space
                                              size="small"
                                              onClick={(event) => event.stopPropagation()}
                                            >
                                              <Button
                                                size="small"
                                                icon={<EditOutlined />}
                                                onClick={() => openTask(record).catch(() => undefined)}
                                              >
                                                Editar
                                              </Button>
                                              <Button
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() =>
                                                  openDeleteConfirmModal({
                                                    title: "Excluir esta tarefa?",
                                                    onConfirm: async () => {
                                                      const ok = await deleteTaskById(record.id);
                                                      if (!ok) throw new Error("task_delete_failed");
                                                    },
                                                  })
                                                }
                                              >
                                                Excluir
                                              </Button>
                                            </Space>
                                          ),
                                        },
                                      ]}
                                    />
                                  )}
                                </Spin>
                              </Card>
                            );
                          })}
                        </Space>
                      )
                    )}
                  </Space>
                )}
              </>
            </Spin>
          </Content>
        </Layout>
      </Layout>

      <Drawer
        title={null}
        placement="left"
        closable
        onClose={() => setMobileNavOpen(false)}
        open={isCompactNav && mobileNavOpen}
        size={280}
        styles={{
          body: { padding: 0, background: "#001529" },
          header: { display: "none" },
        }}
        aria-label="Menu de navegacao"
      >
        <div
          style={{
            color: "#F4F0ED",
            fontWeight: 700,
            padding: "18px 18px 8px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {brandingConfig.logo_url ? (
            <img
              src={brandingConfig.logo_url}
              alt="Logo do sistema"
              style={{ width: 22, height: 22, objectFit: "cover", borderRadius: 6 }}
            />
          ) : null}
          <span>{brandingConfig.app_name}</span>
        </div>
        <nav aria-label="Navegacao principal (menu movel)">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[activeKey]}
            onClick={handleMainMenuClick}
            items={menuItems}
            style={{ borderInlineEnd: "none" }}
            defaultOpenKeys={isAdmin ? ["admin-root"] : undefined}
          />
          <Divider style={{ borderColor: "rgba(255,255,255,0.14)", margin: "10px 0" }} />
          <div style={{ padding: "0 6px 16px" }}>
            <Typography.Text
              style={{
                color: "rgba(244,240,237,0.88)",
                fontSize: 12,
                paddingInlineStart: 4,
                display: "block",
              }}
            >
              Estrutura de projetos
            </Typography.Text>
            <div style={{ marginTop: 6 }}>
              <ProjectsSidebarTree
                data={projectSidebarTreeData}
                expanded={projectSidebarExpandedKeysSet}
                onToggle={toggleProjectSidebarKey}
                selectedKey={selectedProjectSidebarKey}
                onSelect={handleSidebarTreeSelect}
                onAction={handleSidebarTreeAction}
                showActions={isAdmin}
              />
            </div>
          </div>
        </nav>
      </Drawer>

      <Modal
        title="Nova area de trabalho"
        open={createWorkspaceOpen}
        onCancel={() => setCreateWorkspaceOpen(false)}
        onOk={() => createWorkspaceForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
      >
        <Form
          layout="vertical"
          form={createWorkspaceForm}
          onFinish={async (values) => {
            const response = await apiRequest<{ workspace: Record<string, unknown> }>("/workspaces", {
              method: "POST",
              token,
              body: { name: values.name },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao criar area de trabalho.");
              return;
            }
            const created = response.data?.workspace as { id?: string } | undefined;
            apiMessage.success("Area de trabalho criada.");
            await fetchCrudData();
            if (created?.id) {
              await ensureDefaultPortfolio(String(created.id));
              setSelectedWorkspaceId(String(created.id));
            }
            createWorkspaceForm.resetFields();
            setCreateWorkspaceOpen(false);
          }}
        >
          <Form.Item name="name" label="Nome" rules={[{ required: true, message: "Informe o nome." }, { min: 3 }]}>
            <Input placeholder="Ex.: Operacoes" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Renomear area de trabalho"
        open={editWorkspaceOpen}
        onCancel={() => setEditWorkspaceOpen(false)}
        onOk={() => editWorkspaceForm.submit()}
        okText="Salvar"
        cancelText="Cancelar"
      >
        <Form
          layout="vertical"
          form={editWorkspaceForm}
          onFinish={async (values) => {
            if (!selectedWorkspaceId) {
              apiMessage.error("Nenhuma area selecionada.");
              return;
            }
            const response = await apiRequest(`/workspaces/${selectedWorkspaceId}`, {
              method: "PATCH",
              token,
              body: { name: values.name },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao atualizar area.");
              return;
            }
            apiMessage.success("Area atualizada.");
            await fetchCrudData();
            editWorkspaceForm.resetFields();
            setEditWorkspaceOpen(false);
          }}
        >
          <Form.Item name="name" label="Nome" rules={[{ required: true, message: "Informe o nome." }, { min: 3 }]}>
            <Input placeholder="Nome da area" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Novo cliente"
        open={createClientOpen}
        onCancel={() => setCreateClientOpen(false)}
        onOk={() => createClientForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
      >
        <Form
          layout="vertical"
          form={createClientForm}
          onFinish={async (values) => {
            const response = await apiRequest<{ client: Record<string, unknown> }>("/clients", {
              method: "POST",
              token,
              body: { name: values.name, description: values.description ?? "" },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao criar cliente.");
              return;
            }
            const created = response.data?.client as { id?: string } | undefined;
            apiMessage.success("Cliente criado.");
            await fetchCrudData();
            if (created?.id) {
              setSelectedClientId(String(created.id));
            }
            createClientForm.resetFields();
            setCreateClientOpen(false);
          }}
        >
          <Form.Item
            name="name"
            label="Nome"
            rules={[{ required: true, message: "Informe o nome." }, { min: 3 }, { max: 255 }]}
          >
            <Input placeholder="Ex.: Cliente Alfa" />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            title={`Sera vinculado automaticamente a area de trabalho atual: ${String(selectedWorkspace?.name ?? "")}`}
            description="O cliente aparecera dentro desta area assim que voce criar o primeiro projeto vinculado."
          />
        </Form>
      </Modal>

      <Modal
        title="Novo projeto"
        open={createProjectOpen}
        onCancel={() => setCreateProjectOpen(false)}
        onOk={() => createProjectForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
      >
        <Form
          layout="vertical"
          form={createProjectForm}
          onFinish={async (values) => {
            if (!selectedWorkspaceId) {
              apiMessage.error("Selecione uma area de trabalho.");
              return;
            }
            if (!selectedClientId) {
              apiMessage.error("Selecione um cliente.");
              return;
            }
            const portfolioId = await ensureDefaultPortfolio(selectedWorkspaceId);
            if (!portfolioId) return;
            const response = await apiRequest<{ project: Record<string, unknown> }>("/projects", {
              method: "POST",
              token,
              body: {
                name: values.name,
                portfolio_id: portfolioId,
                client_id: selectedClientId,
              },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao criar projeto.");
              return;
            }
            const created = response.data?.project as { id?: string } | undefined;
            apiMessage.success("Projeto criado.");
            await fetchCrudData();
            if (created?.id) {
              setSelectedProjectId(String(created.id));
            }
            createProjectForm.resetFields();
            setCreateProjectOpen(false);
          }}
        >
          <Form.Item
            name="name"
            label="Nome do projeto"
            rules={[{ required: true, message: "Informe o nome." }, { min: 3 }, { max: 255 }]}
          >
            <Input placeholder="Ex.: Onboarding 2026" />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            title={`Cliente: ${String(selectedClient?.name ?? "-")} | Area: ${String(selectedWorkspace?.name ?? "-")}`}
          />
        </Form>
      </Modal>

      <Modal
        title="Novo grupo"
        open={createBoardOpen}
        onCancel={() => setCreateBoardOpen(false)}
        onOk={() => createBoardForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
      >
        <Form
          layout="vertical"
          form={createBoardForm}
          onFinish={async (values) => {
            if (!selectedProjectId) {
              apiMessage.error("Selecione um projeto.");
              return;
            }
            const response = await apiRequest<{ board: BoardItem }>("/boards", {
              method: "POST",
              token,
              body: { name: values.name, project_id: selectedProjectId },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao criar grupo.");
              return;
            }
            apiMessage.success("Grupo criado.");
            await fetchBoards();
            const createdId = response.data?.board?.id ? String(response.data.board.id) : null;
            if (createdId) setSelectedBoardId(createdId);
            createBoardForm.resetFields();
            setCreateBoardOpen(false);
          }}
        >
          <Form.Item
            name="name"
            label="Nome do grupo"
            rules={[{ required: true, message: "Informe o nome." }, { min: 3 }]}
          >
            <Input placeholder="Ex.: Grupo principal" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Nova lista"
        open={createGroupOpen}
        onCancel={() => setCreateGroupOpen(false)}
        onOk={() => createGroupForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
      >
        <Form
          layout="vertical"
          form={createGroupForm}
          initialValues={{ wip_limit: 10 }}
          onFinish={async (values) => {
            if (!selectedBoardId) {
              apiMessage.error("Selecione um grupo.");
              return;
            }
            const response = await apiRequest(`/boards/${selectedBoardId}/groups`, {
              method: "POST",
              token,
              body: { name: values.name, wip_limit: values.wip_limit ?? 10 },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao criar lista.");
              return;
            }
            apiMessage.success("Coluna criada.");
            const groupView = boardViewModeByBoardId[selectedBoardId] ?? "list";
            await fetchKanbanForBoard(selectedBoardId, groupView);
            createGroupForm.resetFields();
            setCreateGroupOpen(false);
          }}
        >
          <Form.Item name="name" label="Nome" rules={[{ required: true, message: "Informe o nome da lista." }]}>
            <Input placeholder="Ex.: Em andamento" />
          </Form.Item>
          <Form.Item name="wip_limit" label="Limite WIP" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Nova tarefa"
        open={createTaskOpen}
        onCancel={() => {
          setCreateTaskOpen(false);
          setComposeBoardId(null);
        }}
        onOk={() => createTaskForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
        width={640}
      >
        <Form
          layout="vertical"
          form={createTaskForm}
          initialValues={{ priority: "medium", status: "todo", effort_points: 1 }}
          onFinish={async (values) => {
            const targetBoardId = composeBoardId ?? selectedBoardId;
            const targetBoard = boards.find((board) => board.id === targetBoardId) ?? null;
            if (!targetBoardId || !targetBoard?.project_id) {
              apiMessage.error("Selecione um grupo valido.");
              return;
            }
            const ok = await createTask({
              ...values,
              effort_points: values.effort_points ?? 1,
              end_date: values.end_date ? new Date(values.end_date).toISOString() : null,
              project_id: targetBoard.project_id,
            });
            if (ok) {
              const createdView = boardViewModeByBoardId[targetBoardId] ?? "list";
              await fetchKanbanForBoard(targetBoardId, createdView);
              createTaskForm.resetFields();
              setCreateTaskOpen(false);
              setComposeBoardId(null);
            }
          }}
        >
          <Row gutter={[12, 0]}>
            <Col xs={24}>
              <Form.Item
                name="title"
                label="Titulo"
                rules={[{ required: true, message: "Informe o titulo." }, { min: 4 }]}
              >
                <Input placeholder="Ex.: Ajustar fluxo de apontamento" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="description" label="Descricao">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="group_id" label="Lista" rules={[{ required: true, message: "Selecione a lista." }]}>
                <Select
                  options={(boardKanbanByBoardId[composeBoardId ?? selectedBoardId ?? ""] ?? kanbanGroups).map((item) => ({
                    value: item.group.id,
                    label: formatColumnLabel(item.group.name),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="priority" label="Prioridade">
                <Select
                  options={[
                    { value: "low", label: "Baixa" },
                    { value: "medium", label: "Media" },
                    { value: "high", label: "Alta" },
                    { value: "critical", label: "Critica" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="Status inicial">
                <Select options={statusOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="effort_points" label="Esforco (horas previstas)">
                <InputNumber min={0} max={999} step={0.5} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="assignee_id" label="Responsavel">
                <Select
                  allowClear
                  placeholder="Escolha o responsavel"
                  showSearch
                  filterOption={(input, option) => {
                    const id = Number(option?.value ?? NaN);
                    const row = taskAssigneePickList.find((u) => u.id === id);
                    const haystack = `${row?.name ?? ""} ${row?.email ?? ""}`.toLowerCase();
                    return haystack.includes(input.trim().toLowerCase());
                  }}
                  options={taskAssigneePickList.map((u) => {
                    const initial = u.name.trim().slice(0, 1).toUpperCase() || "?";
                    return {
                      value: u.id,
                      label: (
                        <Space size={8}>
                          <Avatar size="small">{initial}</Avatar>
                          <span>{u.name}</span>
                        </Space>
                      ),
                    };
                  })}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="end_date" label="Prazo final">
                <Input type="datetime-local" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={selectedTask ? `Tarefa: ${selectedTask.title}` : "Tarefa"}
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        size="large"
      >
        {selectedTask && (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Card size="small" title="Resumo">
              <Space wrap align="center">
                <Typography.Text type="secondary">Status atual:</Typography.Text>
                {renderStatusTag(selectedTask.status)}
                {renderPriorityTag(selectedTask.priority)}
                <Tag color="purple">Esforco: {formatEffortHoursDisplay(selectedTask.effort_points)}</Tag>
                <Tag color="blue">
                  Responsavel:{" "}
                  {(() => {
                    const sid = selectedTask.assignee_id;
                    if (sid == null) return "—";
                    const opt = taskAssigneePickList.find((u) => u.id === sid);
                    return opt ? opt.name : `Usuario ${sid}`;
                  })()}
                </Tag>
                <Tag>Inicio: {formatDate(selectedTask.start_date)}</Tag>
                <Tag>Prazo: {formatDate(selectedTask.end_date)}</Tag>
              </Space>
            </Card>

            <Card
              size="small"
              title={
                <Space>
                  <ClockCircleOutlined />
                  Controle de tempo
                </Space>
              }
            >
              <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 10 }}>
                {secondsToText(liveTaskTotalSeconds)}
              </Typography.Title>
              <Space wrap>
                <Button icon={<PlayCircleOutlined />} type={activeTimeLog ? "default" : "primary"} onClick={() => taskAction(`/tasks/${selectedTask.id}/time/start`, "POST", {})}>
                  Iniciar
                </Button>
                <Button icon={<PauseCircleOutlined />} onClick={() => taskAction(`/tasks/${selectedTask.id}/time/pause`, "POST", {})}>
                  Pausar
                </Button>
                <Button icon={<PlayCircleOutlined />} onClick={() => taskAction(`/tasks/${selectedTask.id}/time/resume`, "POST", {})}>
                  Retomar
                </Button>
                <Button icon={<CheckCircleOutlined />} type="primary" onClick={() => taskAction(`/tasks/${selectedTask.id}/complete`, "POST", {})}>
                  Concluir
                </Button>
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0 }}>
                Sessao ativa: {activeTimeLog ? "sim" : "nao"} | Sessao pausada: {pausedTimeLog ? "sim" : "nao"}
              </Typography.Paragraph>
            </Card>

            <Card size="small" title="Descricao">
              {selectedTask.description ? (
                <Typography.Paragraph style={{ marginBottom: 0 }}>{selectedTask.description}</Typography.Paragraph>
              ) : (
                <Typography.Text type="secondary">Sem descricao cadastrada.</Typography.Text>
              )}
            </Card>

            {(isAdmin || (currentUserId !== null && selectedTask.assignee_id === currentUserId)) ? (
              <Card size="small" title="Alterar status">
                <Form
                  key={`task-status-form-${selectedTask.id}`}
                  layout="vertical"
                  initialValues={{ status: selectedTask.status }}
                  onFinish={(values) => taskAction(`/tasks/${selectedTask.id}/status`, "PATCH", { status: values.status })}
                >
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    O valor abaixo comeca no status atual; escolha outro e salve para atualizar.
                  </Typography.Paragraph>
                  <Form.Item label="Status" name="status" rules={[{ required: true }]}>
                    <Select options={statusOptions} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">
                    Salvar status
                  </Button>
                </Form>
              </Card>
            ) : null}

            {isAdmin ? (
              <Card size="small" title="Edicao rapida">
            <Form
              key={`quick-edit-${selectedTask.id}`}
              layout="vertical"
              onFinish={(values) =>
                taskAction(`/tasks/${selectedTask.id}`, "PATCH", {
                  title: values.title,
                  description: values.description,
                  priority: values.priority,
                  effort_points: values.effort_points,
                  assignee_id: values.assignee_id ?? null,
                  end_date: values.end_date ? new Date(values.end_date).toISOString() : null,
                })
              }
              initialValues={{
                title: selectedTask.title,
                description: selectedTask.description,
                priority: selectedTask.priority,
                effort_points: selectedTask.effort_points,
                assignee_id: selectedTask.assignee_id ?? undefined,
                end_date: selectedTask.end_date ? selectedTask.end_date.slice(0, 16) : null,
              }}
            >
              <Form.Item label="Titulo" name="title" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Descricao" name="description">
                <Input.TextArea rows={3} />
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
              <Form.Item label="Esforco (horas previstas)" name="effort_points">
                <InputNumber min={0} max={999} step={0.5} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="Responsavel" name="assignee_id">
                <Select
                  allowClear
                  placeholder="Escolha o responsavel"
                  showSearch
                  filterOption={(input, option) => {
                    const id = Number(option?.value ?? NaN);
                    const row = taskAssigneePickList.find((u) => u.id === id);
                    const haystack = `${row?.name ?? ""} ${row?.email ?? ""}`.toLowerCase();
                    return haystack.includes(input.trim().toLowerCase());
                  }}
                  options={taskAssigneePickList.map((u) => {
                    const initial = u.name.trim().slice(0, 1).toUpperCase() || "?";
                    return {
                      value: u.id,
                      label: (
                        <Space size={8}>
                          <Avatar size="small">{initial}</Avatar>
                          <span>{u.name}</span>
                        </Space>
                      ),
                    };
                  })}
                />
              </Form.Item>
              <Form.Item label="Prazo final" name="end_date">
                <Input type="datetime-local" />
              </Form.Item>
              <Button type="primary" htmlType="submit">
                Salvar edicao rapida
              </Button>
            </Form>
              </Card>
            ) : null}

            <Tabs
              activeKey={taskDrawerTab}
              onChange={(key) => setTaskDrawerTab(key as TaskDrawerTab)}
              items={[
                {
                  key: "summary",
                  label: "Registros de tempo",
                  children: (
                    <div>
                      <Typography.Paragraph>Total acumulado: {secondsToText(liveTaskTotalSeconds)}</Typography.Paragraph>
                      <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                        {taskSummary.logs.map((log) => (
                          <Card key={log.id} size="small">
                            <Space orientation="vertical" size={0}>
                              <Typography.Text>
                                {formatTimeLogStatus(log.status)} - {secondsToText(log.total_seconds)}
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
                {
                  key: "comments",
                  label: "Comentarios",
                  children: (
                    <Space orientation="vertical" style={{ width: "100%" }} size={12}>
                      <Card size="small" title="Atualizacoes">
                        <Space orientation="vertical" style={{ width: "100%" }} size={10}>
                          {taskCommentReplyTo ? (
                            <Alert
                              type="info"
                              showIcon
                              title="Respondendo a atualizacao"
                              description={parseCommentReplyMeta(taskCommentReplyTo.content).cleanContent.slice(0, 120)}
                              action={
                                <Button size="small" type="text" onClick={() => setTaskCommentReplyTo(null)}>
                                  Cancelar resposta
                                </Button>
                              }
                            />
                          ) : null}
                          <Input.TextArea
                            rows={4}
                            value={taskCommentDraft}
                            onChange={(event) => setTaskCommentDraft(event.target.value)}
                            placeholder="Escreva uma atualizacao da tarefa..."
                          />
                          <Space>
                            <Button
                              type="primary"
                              onClick={() => createTaskComment(selectedTask.id, taskCommentDraft)}
                              disabled={!taskCommentDraft.trim()}
                            >
                              Publicar atualizacao
                            </Button>
                            <Button
                              onClick={() => {
                                setTaskCommentDraft("");
                                setTaskCommentReplyTo(null);
                              }}
                            >
                              Limpar
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                      {(() => {
                        const authoredBy = (authorId: number) =>
                          taskAssigneePickList.find((u) => u.id === authorId)?.name ??
                          adminUsersCache.find((u) => u.id === authorId)?.name ??
                          (authorId === currentUserId ? currentUserIdentity.displayName : `Usuario ${authorId}`);
                        const parsed = taskComments.map((comment) => {
                          const meta = parseCommentReplyMeta(comment.content);
                          return { comment, replyToId: meta.replyToId, cleanContent: meta.cleanContent };
                        });
                        const byId = new Map(parsed.map((row) => [row.comment.id, row]));
                        const roots: typeof parsed = [];
                        const repliesByParent = new Map<string, typeof parsed>();
                        for (const row of parsed) {
                          const token = row.replyToId;
                          if (!token) {
                            roots.push(row);
                            continue;
                          }
                          let parentId: string | null = null;
                          if (byId.has(token)) parentId = token;
                          else {
                            const guessed = parsed.find((x) => x.comment.id.startsWith(token));
                            if (guessed) parentId = guessed.comment.id;
                          }
                          if (!parentId) {
                            roots.push(row);
                            continue;
                          }
                          const prev = repliesByParent.get(parentId) ?? [];
                          prev.push(row);
                          repliesByParent.set(parentId, prev);
                        }
                        if (roots.length === 0) return <Empty description="Ainda nao ha atualizacoes nesta tarefa." />;
                        return roots.map((root) => {
                          const rootComment = root.comment;
                          const rootAuthor = authoredBy(rootComment.author_id);
                          const rootIsEditing = taskCommentEditingId === rootComment.id;
                          const replies = repliesByParent.get(rootComment.id) ?? [];
                          return (
                            <Card key={rootComment.id} size="small">
                              <Space orientation="vertical" style={{ width: "100%" }} size={10}>
                                <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                                  <Space size={8}>
                                    <Avatar size="small">{String(rootAuthor).trim().charAt(0).toUpperCase()}</Avatar>
                                    <Typography.Text strong>{rootAuthor}</Typography.Text>
                                    <Typography.Text type="secondary">{formatDate(rootComment.created_at)}</Typography.Text>
                                    <Tag>Atualizacao</Tag>
                                  </Space>
                                  <Space>
                                    <Button
                                      size="small"
                                      onClick={() => {
                                        setTaskCommentReplyTo(rootComment);
                                        setTaskCommentDraft("");
                                      }}
                                    >
                                      Responder
                                    </Button>
                                    {(isAdmin || rootComment.author_id === currentUserId) ? (
                                      <>
                                        <Button
                                          size="small"
                                          onClick={() => {
                                            setTaskCommentEditingId(rootComment.id);
                                            setTaskCommentEditingContent(root.cleanContent);
                                          }}
                                        >
                                          Editar
                                        </Button>
                                        <Button
                                          size="small"
                                          danger
                                          onClick={() =>
                                            openDeleteConfirmModal({
                                              title: "Excluir este comentario?",
                                              onConfirm: async () => {
                                                await deleteTaskComment(selectedTask.id, rootComment.id);
                                              },
                                            })
                                          }
                                        >
                                          Excluir
                                        </Button>
                                      </>
                                    ) : null}
                                  </Space>
                                </Space>
                                {rootIsEditing ? (
                                  <Space orientation="vertical" style={{ width: "100%" }}>
                                    <Input.TextArea
                                      rows={3}
                                      value={taskCommentEditingContent}
                                      onChange={(event) => setTaskCommentEditingContent(event.target.value)}
                                    />
                                    <Space>
                                      <Button
                                        type="primary"
                                        size="small"
                                        onClick={() =>
                                          updateTaskComment(selectedTask.id, rootComment.id, taskCommentEditingContent)
                                        }
                                        disabled={!taskCommentEditingContent.trim()}
                                      >
                                        Salvar
                                      </Button>
                                      <Button
                                        size="small"
                                        onClick={() => {
                                          setTaskCommentEditingId(null);
                                          setTaskCommentEditingContent("");
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                    </Space>
                                  </Space>
                                ) : (
                                  <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                                    {root.cleanContent}
                                  </Typography.Paragraph>
                                )}
                                {replies.map((reply) => {
                                  const replyAuthor = authoredBy(reply.comment.author_id);
                                  const replyIsEditing = taskCommentEditingId === reply.comment.id;
                                  return (
                                    <div
                                      key={reply.comment.id}
                                      style={{
                                        marginLeft: 28,
                                        borderLeft: "2px solid #E6F4FF",
                                        paddingLeft: 10,
                                      }}
                                    >
                                      <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                                        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                                          <Space size={8}>
                                            <Avatar size="small">{String(replyAuthor).trim().charAt(0).toUpperCase()}</Avatar>
                                            <Typography.Text strong>{replyAuthor}</Typography.Text>
                                            <Typography.Text type="secondary">{formatDate(reply.comment.created_at)}</Typography.Text>
                                            <Tag color="processing">Resposta</Tag>
                                          </Space>
                                          <Space>
                                            <Button
                                              size="small"
                                              onClick={() => {
                                                setTaskCommentReplyTo(rootComment);
                                                setTaskCommentDraft("");
                                              }}
                                            >
                                              Responder
                                            </Button>
                                            {(isAdmin || reply.comment.author_id === currentUserId) ? (
                                              <>
                                                <Button
                                                  size="small"
                                                  onClick={() => {
                                                    setTaskCommentEditingId(reply.comment.id);
                                                    setTaskCommentEditingContent(reply.cleanContent);
                                                  }}
                                                >
                                                  Editar
                                                </Button>
                                                <Button
                                                  size="small"
                                                  danger
                                                  onClick={() =>
                                                    openDeleteConfirmModal({
                                                      title: "Excluir esta resposta?",
                                                      onConfirm: async () => {
                                                        await deleteTaskComment(selectedTask.id, reply.comment.id);
                                                      },
                                                    })
                                                  }
                                                >
                                                  Excluir
                                                </Button>
                                              </>
                                            ) : null}
                                          </Space>
                                        </Space>
                                        {replyIsEditing ? (
                                          <Space orientation="vertical" style={{ width: "100%" }}>
                                            <Input.TextArea
                                              rows={3}
                                              value={taskCommentEditingContent}
                                              onChange={(event) => setTaskCommentEditingContent(event.target.value)}
                                            />
                                            <Space>
                                              <Button
                                                type="primary"
                                                size="small"
                                                onClick={() =>
                                                  updateTaskComment(selectedTask.id, reply.comment.id, taskCommentEditingContent)
                                                }
                                                disabled={!taskCommentEditingContent.trim()}
                                              >
                                                Salvar
                                              </Button>
                                              <Button
                                                size="small"
                                                onClick={() => {
                                                  setTaskCommentEditingId(null);
                                                  setTaskCommentEditingContent("");
                                                }}
                                              >
                                                Cancelar
                                              </Button>
                                            </Space>
                                          </Space>
                                        ) : (
                                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                                            {reply.cleanContent}
                                          </Typography.Paragraph>
                                        )}
                                      </Space>
                                    </div>
                                  );
                                })}
                              </Space>
                            </Card>
                          );
                        });
                      })()}
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
