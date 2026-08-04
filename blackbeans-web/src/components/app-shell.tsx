"use client";

import {
  AppstoreOutlined,
  BellOutlined,
  BugOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuOutlined,
  CommentOutlined,
  LinkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  PaperClipOutlined,
  RightOutlined,
  RobotOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
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
  Checkbox,
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
  Statistic,
  Switch,
  Table,
  Steps,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
  theme,
  Tooltip,
  Image as AntImage,
} from "antd";
import type { SelectProps } from "antd/es/select";
import type { MenuProps } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { ReactElement, ReactNode } from "react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest, resolveMediaUrl, toStoredMediaPath } from "@/lib/api";
import { toBrowserMediaSrc } from "@/lib/media";
import { isEmptyRichHtml, toEditorHtml } from "@/lib/rich-content";
import { installReportProblemCollectors } from "@/lib/report-problem";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import { BB_THEME_EVENT, setBbTheme } from "@/components/providers";
import MondayComposer, {
  clearComposerDraft,
  type MondayMentionOption,
} from "@/components/rich-editor/MondayComposer";
import { RichHtmlView } from "@/components/rich-editor/RichHtmlView";
import { ProblemReportsPanel } from "@/components/report-problem/ProblemReportsPanel";
import { ReportProblemWidget } from "@/components/report-problem/ReportProblemWidget";
import { WhatsNewModal } from "@/components/whats-new/WhatsNewModal";
import {
  APP_WHATS_NEW_VERSION,
  hasSeenWhatsNew,
  markWhatsNewSeen,
} from "@/lib/whats-new";

const { Header, Sider, Content } = Layout;
const AUTH_STORAGE_KEY = "bb_access_token";
const REFRESH_STORAGE_KEY = "bb_refresh_token";
const BOARD_STORAGE_KEY = "bb_selected_board_id";
const TASK_STATUS_FILTER_KEY = "bb_task_status_filter";
const TASK_SEARCH_FILTER_KEY = "bb_task_search_filter";
const STATUS_PALETTE_STORAGE_KEY = "bb_status_palette";
const BRANDING_STORAGE_KEY = "bb_branding_config";
const THEME_STORAGE_KEY = "bb_theme";
const ADMIN_USERS_STORAGE_KEY = "bb_admin_users_cache";
const ADMIN_USER_META_STORAGE_KEY = "bb_admin_users_meta";
const SELECTED_WORKSPACE_STORAGE_KEY = "bb_selected_workspace_id";
const SELECTED_PORTFOLIO_STORAGE_KEY = "bb_selected_portfolio_id";
const SELECTED_CLIENT_STORAGE_KEY = "bb_selected_client_id";
const SELECTED_PROJECT_STORAGE_KEY = "bb_selected_project_id";
const PROJECT_SIDEBAR_EXPANDED_KEY = "bb_projects_sidebar_expanded_keys";
const DEFAULT_PORTFOLIO_STORAGE_KEY = "bb_default_portfolio_by_workspace";
const DEFAULT_PORTFOLIO_NAME = "Default";

const HELP_TIPS = {
  menuMyWork: "Tarefas atribuidas a voce, com filtros por prazo e prioridade.",
  menuTasks: "Lista geral de tarefas do sistema com filtros avancados (admin).",
  menuProjects: "Lista de projetos acessiveis em todas as areas de trabalho.",
  menuWorkspaces: "Estrutura Area > Portfolio > Projeto > Quadro > Lista > Tarefa.",
  menuClientRequests: "Pedidos publicos de clientes aguardando conversao.",
  menuClients: "Cadastro global de clientes (CNPJ, contato, e-mails financeiros).",
  menuServices: "Catalogo de servicos usado em vendas e contratos.",
  menuSales: "Wizard de venda/contrato; ao confirmar pode gerar estrutura de projeto.",
  menuUsers: "Gestao de usuarios, permissoes e vinculos.",
  menuStatus: "Paleta e rotulos dos status de tarefas em todo o sistema.",
  menuStats: "Indicadores e visao consolidada da operacao.",
  menuProblems: "Triagem de problemas reportados pelos usuarios (screenshot, gravacao, contexto).",
  menuAgents: "Agentes autonomos administrativos: catalogo, agenda e relatorios automaticos.",
  novaArea: "Area interna da agencia (ex.: Producao, Financeiro, Administrativo).",
  novoPortfolio: "Agrupa projetos dentro da area (ex.: contas, frentes ou setores).",
  novoProjeto: "Entrega vinculada a um cliente existente dentro do portfolio.",
  novoGrupo: "Grupo de tarefas do projeto (ex.: Backlog, Liberado, Em andamento).",
  novaLista: "So no modo Colunas: cria uma coluna dentro do grupo (organizacao interna).",
  novaTarefa: "Cria a tarefa neste grupo. Ela aparece automaticamente nesta secao.",
  excluirGrupo: "Remove o grupo inteiro e suas tarefas.",
  moverSelecionadas: "Move tarefas marcadas para outro grupo do projeto.",
  novoCliente: "Cadastra cliente no catalogo global; vincule ao criar um projeto.",
  novoServico: "Item do catalogo de servicos para precificar vendas.",
  novaVenda: "Inicia contrato comercial com cliente, servicos e financeiro.",
  limiteWip: "Maximo de tarefas simultaneas nesta coluna (controle Kanban).",
  editar: "Abre os detalhes para editar informacoes.",
  excluir: "Remove o item permanentemente (quando permitido).",
  comentarios: "Abre comentarios e permite mencionar outros usuarios com @.",
  atualizar: "Recarrega os dados mais recentes do servidor.",
  salvar: "Grava as alteracoes feitas neste formulario.",
  filterPeriodo:
    "Esta semana = segunda a sexta da semana atual (calendario). Use De/Ate para intervalo livre.",
  filterPrioridade: "Filtra tarefas pelo nivel de prioridade.",
  filterPrazo: "Filtra tarefas pela data de vencimento.",
  statusRapido: "Altera o status da tarefa sem abrir o painel completo.",
  criarTarefaParaMim: "Cria tarefa ja atribuida a voce no quadro escolhido.",
  notificacoes: "Central de avisos do sistema (tarefas, mencoes, prazos).",
  conta: "Perfil, dados pessoais, 2FA e preferencias de e-mail.",
  sidebarRename: "Renomeia este item na estrutura de projetos.",
  sidebarDelete: "Exclui este item e, em cascata, o que estiver abaixo dele.",
  sidebarExpand: "Expande ou recolhe os itens filhos nesta arvore.",
  kanbanRenomearLista: "Renomeia esta coluna do quadro.",
  kanbanExcluirLista: "Remove esta coluna; tarefas precisam estar vazias ou movidas antes.",
  visualizarVenda: "Abre resumo do contrato e linhas de servico.",
  confirmarVenda: "Confirma a venda e pode gerar workspace, portfolio e projetos.",
  limparFiltros: "Volta todos os filtros ao estado inicial.",
  filterStatus: "Filtra tarefas pelo status (a fazer, em progresso, concluida...).",
  filterProjeto: "Limita a lista a um projeto especifico.",
  filterQuadro: "Limita a lista a um quadro especifico.",
  filterResponsavel: "Filtra por quem esta atribuido a tarefa.",
  buscarTitulo: "Busca tarefas pelo titulo (texto livre).",
  iniciar2fa: "Gera QR code para vincular app autenticador (Google Authenticator etc.).",
  desativar2fa: "Remove a exigencia de codigo no login (precisa do codigo atual).",
  subirImagemPerfil: "Altera a foto exibida no perfil (salva localmente no navegador).",
  salvarPreferenciasEmail: "Grava como voce quer receber cada tipo de notificacao.",
  seguirTarefa: "Recebe avisos quando a tarefa for atualizada, comentada ou mudar de status.",
  timerIniciar: "Inicia contagem de tempo nesta tarefa. Voce pode ter timers ativos em varias tarefas ao mesmo tempo.",
  timerPausar: "Pausa a contagem sem perder o tempo ja registrado.",
  timerRetomar: "Continua a contagem de onde parou.",
  timerConcluir: "Marca a tarefa como concluida e encerra timers abertos.",
  salvarStatus: "Atualiza o status da tarefa no servidor.",
  salvarDescricao: "Salva a descricao da tarefa sem recarregar a pagina.",
  salvarDetalhes: "Salva responsavel, prazo, prioridade e esforco.",
  marcarTodasLidas: "Remove o destaque de notificacoes nao lidas.",
  verTodasNotificacoes: "Abre a central completa de notificacoes.",
  buscarCliente: "Filtra clientes por nome, CNPJ ou contato.",
} as const;

function HelpTip({ title, children }: { title: string; children: ReactElement }) {
  return (
    <Tooltip title={title} mouseEnterDelay={0.35}>
      {children}
    </Tooltip>
  );
}

function TipButton({
  tip,
  ...props
}: { tip: string } & React.ComponentProps<typeof Button>) {
  return (
    <HelpTip title={tip}>
      <Button {...props} />
    </HelpTip>
  );
}

function TipSelect<ValueType = string>({
  tip,
  ...props
}: { tip: string } & SelectProps<ValueType>) {
  return (
    <Tooltip title={tip} mouseEnterDelay={0.35}>
      <span style={{ display: "inline-block" }}>
        <Select<ValueType> {...props} />
      </span>
    </Tooltip>
  );
}

function menuLabel(text: string, tip: string) {
  return (
    <Tooltip title={tip} mouseEnterDelay={0.35}>
      <span>{text}</span>
    </Tooltip>
  );
}

const ASSIGNEE_AVATAR_COLORS = ["#1677ff", "#52c41a", "#fa8c16", "#eb2f96", "#722ed1", "#13c2c2", "#f5222d", "#2f54eb"];

function assigneeAvatarColor(userId: number) {
  return ASSIGNEE_AVATAR_COLORS[Math.abs(userId) % ASSIGNEE_AVATAR_COLORS.length];
}

function readStoredAvatarDataUrl(userId: number): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`bb_profile_extra_${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { avatar_data_url?: string };
    const value = String(parsed.avatar_data_url ?? "").trim();
    return value || null;
  } catch {
    return null;
  }
}

function TaskAssigneeAvatar({
  assigneeId,
  users,
  currentUserId,
  currentUserName,
  currentUserAvatarUrl,
  fallbackName,
  fallbackAvatarUrl,
  size = "small",
}: {
  assigneeId: number | null | undefined;
  users: Array<{ id: number; name: string; email?: string; avatar_url?: string | null }>;
  currentUserId: number | null;
  currentUserName: string;
  currentUserAvatarUrl: string | null;
  fallbackName?: string | null;
  fallbackAvatarUrl?: string | null;
  size?: "small" | "default" | number;
}) {
  if (assigneeId == null) {
    return (
      <Tooltip title="Sem responsavel" mouseEnterDelay={0.2}>
        <Avatar
          size={size}
          icon={<UserOutlined />}
          style={{ backgroundColor: "#bfbfbf", color: "#fff" }}
        />
      </Tooltip>
    );
  }

  const row = users.find((user) => user.id === assigneeId);
  const isMe = currentUserId !== null && assigneeId === currentUserId;
  const name = (
    (isMe ? currentUserName : "") ||
    row?.name?.trim() ||
    fallbackName?.trim() ||
    row?.email?.trim() ||
    `Usuario ${assigneeId}`
  ).trim();
  const avatarUrl =
    resolveMediaUrl(
      (isMe ? currentUserAvatarUrl : null) ||
        row?.avatar_url ||
        fallbackAvatarUrl ||
        readStoredAvatarDataUrl(assigneeId) ||
        null,
    ) || null;
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  return (
    <Tooltip title={name} mouseEnterDelay={0.2}>
      <Avatar
        size={size}
        src={avatarUrl || undefined}
        style={{
          backgroundColor: avatarUrl ? undefined : assigneeAvatarColor(assigneeId),
          color: "#fff",
          cursor: "default",
          flexShrink: 0,
        }}
      >
        {!avatarUrl ? initial : null}
      </Avatar>
    </Tooltip>
  );
}

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
  task_id?: string | null;
  metadata?: Record<string, unknown>;
  channel?: string;
  is_read: boolean;
  created_at: string;
};

type NotificationPreferenceItem = {
  event_type: string;
  in_app_enabled: boolean;
  email_mode: "off" | "instant" | "daily" | "weekly";
};

const NOTIFICATION_EVENT_LABELS: Record<string, string> = {
  task_assigned: "Tarefa designada",
  task_completed: "Tarefa concluida",
  task_overdue: "Tarefa atrasada",
  task_due_soon: "Prazo proximo",
  task_commented: "Novo comentario",
  task_mentioned: "Mencao",
  task_status_changed: "Status alterado",
  task_priority_changed: "Prioridade alterada",
  task_updated: "Tarefa atualizada",
};

const NOTIFICATION_EMAIL_MODE_OPTIONS = [
  { value: "off", label: "Desligado" },
  { value: "instant", label: "Instantaneo" },
  { value: "daily", label: "Resumo diario" },
  { value: "weekly", label: "Resumo semanal" },
];

type TaskItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  effort_points: number;
  assignee_id: number | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  assignee_avatar_url?: string | null;
  start_date: string | null;
  end_date: string | null;
  board_id: string;
  group_id: string;
  parent_id?: string | null;
  subtasks_count?: number;
  client_name?: string | null;
  is_recurring?: boolean;
  recurrence_frequency?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type TaskActivity = {
  event_type: string;
  summary: string;
  created_at: string;
};

type TaskCommentAttachment = {
  id: string;
  task_id: string;
  comment_id?: string | null;
  author_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  url?: string | null;
  created_at: string;
};

type TaskCommentItem = {
  id: string;
  task_id: string;
  author_id: number;
  content: string;
  created_at: string;
  updated_at?: string;
  attachments?: TaskCommentAttachment[];
};

type TimeLog = {
  id: string;
  status: string;
  total_seconds: number;
  started_at: string | null;
  current_started_at?: string | null;
  ended_at: string | null;
  user_id?: number;
  user_name?: string;
  is_manual?: boolean;
  source?: string;
  task_id?: string;
};

type ServiceCatalogItem = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  display_order: number;
};

type ContractServiceLineItem = {
  id?: string;
  service_id?: string;
  service?: string;
  service_name?: string;
  service_type: "one_off" | "recurring";
  recurrence?: string;
  recurrence_other?: string;
  amount: string;
  starts_on?: string | null;
  ends_on?: string | null;
  notes?: string;
};

type ContractItem = {
  id: string;
  client_id: string;
  client_name?: string;
  status: string;
  payment_method: string;
  payment_other?: string;
  emits_invoice: boolean;
  has_iss_retention: boolean;
  has_inss_retention: boolean;
  notes?: string;
  service_lines: ContractServiceLineItem[];
  created_at?: string;
  updated_at?: string;
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
  | "clients"
  | "services"
  | "sales"
  | "admin-ops"
  | "status-config"
  | "admin-settings"
  | "profile"
  | "notifications"
  | "stats"
  | "problems"
  | "agents"
  | "projects"
  | "workspaces"
  | "client-requests";

const MENU_KEYS: MenuKey[] = [
  "dashboard",
  "my-work",
  "tasks",
  "users",
  "clients",
  "services",
  "sales",
  "admin-ops",
  "status-config",
  "admin-settings",
  "profile",
  "notifications",
  "stats",
  "problems",
  "agents",
  "projects",
  "workspaces",
  "client-requests",
];
const RESTRICTED_ADMIN_KEYS: MenuKey[] = [
  "tasks",
  "users",
  "clients",
  "services",
  "sales",
  "admin-ops",
  "status-config",
  "admin-settings",
  "stats",
  "problems",
  "agents",
  "workspaces",
  "client-requests",
];

const DEFAULT_STATUS_META: Record<string, { label: string; color: string }> = {
  todo: { label: "A fazer", color: "geekblue" },
  in_progress: { label: "Em progresso", color: "blue" },
  blocked: { label: "Bloqueada", color: "volcano" },
  done: { label: "Concluida", color: "green" },
};
const STATUS_COMPAT_ALIASES: Record<string, string[]> = {
  todo: ["a_fazer", "to_do"],
  in_progress: ["em_progresso", "doing"],
  blocked: ["bloqueada", "bloqueado"],
  done: ["concluida", "concluido", "completed"],
};

/** Mapeia cores pastel/antigas para presets vivos (mesmo estilo das prioridades). */
const STATUS_COLOR_VIVID_MAP: Record<string, string> = {
  default: "geekblue",
  processing: "blue",
  warning: "volcano",
  error: "red",
  success: "green",
  "#94a3b8": "geekblue",
  "#64748b": "geekblue",
  "#cbd5e1": "geekblue",
  "#3b82f6": "blue",
  "#2563eb": "blue",
  "#60a5fa": "blue",
  "#ef4444": "volcano",
  "#f97316": "volcano",
  "#f59e0b": "gold",
  "#22c55e": "green",
  "#16a34a": "green",
  "#4ade80": "green",
};

function normalizeStatusTagColor(color: string): string {
  const raw = String(color ?? "").trim();
  if (!raw) return "geekblue";
  const mapped = STATUS_COLOR_VIVID_MAP[raw.toLowerCase()] ?? STATUS_COLOR_VIVID_MAP[raw];
  return mapped || raw;
}

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low: { label: "Baixa", color: "blue" },
  medium: { label: "Média", color: "gold" },
  high: { label: "Alta", color: "volcano" },
  critical: { label: "Crítica", color: "red" },
};

const CLIENT_REQUEST_STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "Novo", color: "geekblue" },
  in_review: { label: "Em analise", color: "gold" },
  converted: { label: "Convertido", color: "green" },
  rejected: { label: "Rejeitado", color: "volcano" },
  pending: { label: "Pendente", color: "default" },
};

function renderClientRequestStatusTag(value: string) {
  const key = String(value ?? "").trim().toLowerCase();
  const meta = CLIENT_REQUEST_STATUS_META[key] ?? { label: value || "—", color: "default" };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function getMenuKeyFromHash(hash: string, fallback: MenuKey = "dashboard"): MenuKey {
  const normalized = hash.replace(/^#/, "");
  if (normalized.startsWith("task/")) return fallback;
  if (MENU_KEYS.includes(normalized as MenuKey)) {
    return normalized as MenuKey;
  }
  return fallback;
}

function getTaskIdFromHash(hash: string): string | null {
  const normalized = hash.replace(/^#/, "");
  const match = normalized.match(/^task\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

function linkifyText(text: string): ReactNode {
  const raw = String(text ?? "");
  if (!raw) return null;
  const urlRe = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = urlRe.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(raw.slice(lastIndex, match.index));
    }
    const url = match[0];
    const href = url.startsWith("http") ? url : `https://${url}`;
    nodes.push(
      <a key={`lnk-${key++}`} href={href} target="_blank" rel="noreferrer noopener">
        {url}
      </a>,
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < raw.length) nodes.push(raw.slice(lastIndex));
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

/** Preview de imagem estilo Monday (clique para ampliar).
 * So <img> nativo + Modal — Ant Image duplicava a thumbnail.
 */
function RichMediaImage({ src, alt }: { src: string; alt?: string }) {
  const [clientSrc, setClientSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const absolute = toBrowserMediaSrc(src);
    setClientSrc(absolute || null);
    setFailed(false);
  }, [src]);

  if (!clientSrc) {
    return <span className="bb-rich-image-wrap bb-rich-image-wrap--loading" aria-hidden />;
  }

  if (failed) {
    return (
      <span className="bb-rich-image-wrap">
        <a className="bb-rich-link" href={clientSrc} target="_blank" rel="noreferrer noopener">
          Abrir imagem{alt ? ` (${alt})` : ""}
        </a>
      </span>
    );
  }

  return (
    <span className="bb-rich-image-wrap" style={{ display: "block" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={clientSrc}
        alt={alt || "imagem"}
        className="bb-rich-image"
        style={{ maxWidth: "100%", width: "auto", borderRadius: 8, cursor: "zoom-in", display: "block" }}
        onError={() => setFailed(true)}
        onClick={() => setPreview(true)}
      />
      <Modal
        open={preview}
        onCancel={() => setPreview(false)}
        footer={null}
        centered
        width="min(960px, 96vw)"
        styles={{ body: { padding: 0, textAlign: "center", background: "#000" } }}
        destroyOnHidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={clientSrc}
          alt={alt || "imagem"}
          style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" }}
        />
      </Modal>
    </span>
  );
}
function renderInlineRichText(text: string, keyPrefix: string): ReactNode {
  const tokenRe = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|@[a-zA-Z0-9_.@-]+)/g;
  const parts = text.split(tokenRe);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("@")) {
      return (
        <span key={`${keyPrefix}-m-${index}`} className="bb-mention">
          {part}
        </span>
      );
    }
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const resolved = resolveMediaUrl(part) ?? (part.startsWith("http") ? part : `https://${part}`);
      const href = resolved.startsWith("/")
        ? resolved
        : resolved.startsWith("http")
          ? resolved
          : `https://${resolved}`;
      const isMediaPath = href.includes("/media/") || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(href);
      // Links de media de imagem soltos (sem markdown) tambem viram preview
      if (isMediaPath && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(href)) {
        return <RichMediaImage key={`${keyPrefix}-imgurl-${index}`} src={href} alt="imagem" />;
      }
      return (
        <a key={`${keyPrefix}-u-${index}`} href={href} target="_blank" rel="noreferrer noopener" className="bb-rich-link">
          {part}
        </a>
      );
    }
    return <span key={`${keyPrefix}-t-${index}`}>{part}</span>;
  });
}

function renderRichText(text: string): ReactNode {
  const raw = String(text ?? "");
  if (!raw) return null;
  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  const blocks: Array<{ type: "img" | "text"; alt?: string; url?: string; text?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = imageRe.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", text: raw.slice(lastIndex, match.index) });
    }
    blocks.push({ type: "img", alt: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) {
    blocks.push({ type: "text", text: raw.slice(lastIndex) });
  }
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: raw });
  }
  return (
    <span className="bb-rich-text">
      {blocks.map((block, index) => {
        if (block.type === "img") {
          const src = block.url ?? "";
          if (!src) return null;
          return <RichMediaImage key={`img-${index}`} src={src} alt={block.alt || "imagem"} />;
        }
        return <span key={`txt-${index}`}>{renderInlineRichText(block.text ?? "", `b${index}`)}</span>;
      })}
    </span>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

/** Mais atrasado primeiro; sem prazo vai pro final. */
function compareTaskEndDateAsc(
  a: { end_date?: string | null },
  b: { end_date?: string | null },
): number {
  const aMs = a.end_date ? new Date(a.end_date).getTime() : Number.POSITIVE_INFINITY;
  const bMs = b.end_date ? new Date(b.end_date).getTime() : Number.POSITIVE_INFINITY;
  const aValid = Number.isFinite(aMs) ? aMs : Number.POSITIVE_INFINITY;
  const bValid = Number.isFinite(bMs) ? bMs : Number.POSITIVE_INFINITY;
  return aValid - bValid;
}

type TaskFilterMatchMode = "include" | "exclude";

/** selected vazio = sem filtro (passa). Array ou string unica. */
function matchTaskFilterValue(
  selected: string | string[] | null | undefined,
  actual: string,
  mode: TaskFilterMatchMode,
): boolean {
  const values = Array.isArray(selected)
    ? selected.filter((v) => v && v !== "all")
    : selected && selected !== "all"
      ? [selected]
      : [];
  if (values.length === 0) return true;
  const hit = values.includes(actual);
  return mode === "include" ? hit : !hit;
}

const TASK_TABLE_PAGE_SIZE = 8;

const MONTH_SHORT_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Pill de intervalo estilo Monday (sem hora). */
function formatMondayDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return "Sem datas";
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  const fmt = (d: Date) => `${MONTH_SHORT_PT[d.getMonth()]} ${d.getDate()}`;
  if (s && e) {
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${MONTH_SHORT_PT[s.getMonth()]} ${s.getDate()} - ${e.getDate()}`;
    }
    return `${fmt(s)} - ${fmt(e)}`;
  }
  if (e) return fmt(e);
  return s ? fmt(s) : "Sem datas";
}

/** ISO → YYYY-MM-DD (local), so data. */
function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** YYYY-MM-DD (local) → ISO UTC (meio-dia local para evitar shift de fuso). */
function fromDateInputValue(local: string | Date | null | undefined): string | null {
  if (local == null || local === "") return null;
  if (local instanceof Date) {
    return Number.isNaN(local.getTime()) ? null : local.toISOString();
  }
  const raw = String(local).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Converte ISO UTC da API para valor de `<input type="datetime-local">` no fuso local. */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converte valor de datetime-local (horario local) para ISO UTC da API. */
function fromDatetimeLocalValue(local: string | Date | null | undefined): string | null {
  if (local == null || local === "") return null;
  if (local instanceof Date) {
    return Number.isNaN(local.getTime()) ? null : local.toISOString();
  }
  const raw = String(local).trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type MentionOption = { value: string; label: ReactNode };

/** Descricao: leitura HTML + composer TipTap (rascunho ate Salvar do drawer). */
function RichDescriptionField({
  value,
  onChange,
  mentionOptions,
  draftKey,
  onUploadImage,
  onAttachFiles,
  canEdit = true,
  placeholder,
}: {
  value?: string;
  onChange?: (value: string) => void;
  mentionOptions: MondayMentionOption[];
  draftKey?: string;
  onUploadImage: (file: File) => Promise<string | null>;
  onAttachFiles?: (files: File[]) => void | Promise<void>;
  canEdit?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const text = value ?? "";
  const hasContent = !isEmptyRichHtml(toEditorHtml(text)) || Boolean(String(text).trim());

  if (!canEdit) {
    return (
      <div className="bb-rich-description bb-rich-description--readonly">
        {hasContent ? (
          <RichHtmlView html={text} />
        ) : (
          <Typography.Text type="secondary">Sem descricao.</Typography.Text>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="bb-rich-description">
        <div className="bb-rich-description__bar">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(true)}
            aria-label="Editar descricao"
          >
            Editar
          </Button>
        </div>
        <div
          className="bb-rich-description__body"
          onDoubleClick={() => setEditing(true)}
          title="Duplo clique para editar"
        >
          {hasContent ? (
            <RichHtmlView html={text} />
          ) : (
            <Typography.Text type="secondary">
              Sem descricao. Clique no lapis para adicionar.
            </Typography.Text>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bb-rich-description bb-rich-description--editing">
      <MondayComposer
        mode="description"
        value={text}
        onChange={onChange}
        mentionOptions={mentionOptions}
        onUploadImage={onUploadImage}
        onAttachFiles={onAttachFiles}
        draftKey={draftKey}
        placeholder={placeholder}
        submitLabel="Concluir"
        onDone={() => setEditing(false)}
      />
      <Typography.Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
        Alteracoes ficam no rascunho ate voce salvar a tarefa. Colar imagem (Ctrl+V) nao fecha a edicao.
      </Typography.Text>
    </div>
  );
}

const TASK_ACTIVITY_TITLE_PT: Record<string, string> = {
  "task.created": "Tarefa criada",
  "task.updated": "Tarefa atualizada",
  "task.attachment_added": "Anexo adicionado",
  "task.comment_added": "Comentario adicionado",
  "task.comment_edited": "Comentario editado",
  "task.comment_deleted": "Comentario excluido",
  "task.assignee_changed": "Responsavel alterado",
  "task.status_changed": "Status alterado",
  "task.completed": "Tarefa concluida",
  "task.dependency_added": "Dependencia adicionada",
  "task.time.started": "Cronometro iniciado",
  "task.time.paused": "Cronometro pausado",
  "task.time.resumed": "Cronometro retomado",
  "task.time.manual": "Tempo manual registrado",
  "task.time.edited": "Registro de tempo atualizado",
  "task.time.deleted": "Registro de tempo removido",
  // Legado (underscore)
  "task.time_started": "Cronometro iniciado",
  "task.time_paused": "Cronometro pausado",
  "task.time_resumed": "Cronometro retomado",
  "task.time_manual": "Tempo manual registrado",
};

const TASK_STATUS_LABEL_PT: Record<string, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluida",
};

const TASK_FIELD_LABEL_PT: Record<string, string> = {
  title: "Titulo",
  titulo: "Titulo",
  description: "Descricao",
  descricao: "Descricao",
  status: "Status",
  priority: "Prioridade",
  prioridade: "Prioridade",
  effort_points: "Horas previstas",
  esforco: "Horas previstas",
  assignee_id: "Responsavel",
  responsavel: "Responsavel",
  start_date: "Prazo de inicio",
  "prazo de inicio": "Prazo de inicio",
  end_date: "Prazo final",
  "prazo final": "Prazo final",
  is_recurring: "Recorrencia",
  recorrencia: "Recorrencia",
  recurrence_frequency: "Frequencia de recorrencia",
  board_id: "Quadro",
  quadro: "Quadro",
  group_id: "Grupo",
  grupo: "Grupo",
  parent_id: "Tarefa pai",
};

function humanizeTaskActivitySummary(summary: string | null | undefined): string {
  const raw = String(summary ?? "").trim();
  if (!raw) return "";
  let text = raw;

  const camposAlteradosMatch = text.match(/Campos alterados:\s*(.+?)\.?$/i);
  if (camposAlteradosMatch) {
    const labels = camposAlteradosMatch[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((field) => {
        const key = field.toLowerCase().replace(/\s+/g, " ");
        return (
          TASK_FIELD_LABEL_PT[field] ??
          TASK_FIELD_LABEL_PT[key] ??
          TASK_FIELD_LABEL_PT[field.replace(/\s+/g, "_")] ??
          field
        );
      });
    return labels.length ? `Campos alterados: ${labels.join(", ")}.` : "Tarefa atualizada.";
  }

  const camposMatch = text.match(/campos?=([a-z0-9_,\s]+)/i);
  if (camposMatch) {
    const labels = camposMatch[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((field) => TASK_FIELD_LABEL_PT[field] ?? field.replace(/_/g, " "));
    text = text.replace(camposMatch[0], "");
    text = text.replace(/\s*\.\s*$/, "").trim();
    if (!text || /^Tarefa atualizada$/i.test(text)) {
      return labels.length ? `Campos alterados: ${labels.join(", ")}.` : "Tarefa atualizada.";
    }
    return `${text.replace(/\s+$/, "")}. Campos alterados: ${labels.join(", ")}.`;
  }

  text = text.replace(/\bstatus=([a-z_]+)/gi, (_, status: string) => {
    return `status ${TASK_STATUS_LABEL_PT[status] ?? status}`;
  });
  text = text.replace(
    /\bStatus alterado de\s+([a-z_]+)\s+para\s+([a-z_]+)/gi,
    (_, from: string, to: string) =>
      `Status alterado de ${TASK_STATUS_LABEL_PT[from] ?? from} para ${TASK_STATUS_LABEL_PT[to] ?? to}`,
  );
  text = text.replace(/\buser_id=(\d+)/gi, "usuario #$1");
  text = text.replace(/\s*\(log=[^)]+\)/gi, "");
  text = text.replace(/\blog=[^\s.]+/gi, "");
  text = text.replace(/\bAnexo\s+(\S+)\s+adicionado/i, 'Anexo "$1" adicionado');
  return text.replace(/\s{2,}/g, " ").trim();
}

function formatTaskActivityTitle(eventType: string): string {
  if (TASK_ACTIVITY_TITLE_PT[eventType]) return TASK_ACTIVITY_TITLE_PT[eventType];
  const dotted = eventType.replace(/^task\./, "");
  return dotted.replace(/[._]/g, " ");
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

function isTokenExpired(token: string | null, nowMs: number = Date.now()): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp * 1000 <= nowMs;
}

function secondsToText(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

/** Converte horas decimais (ex.: 10.75) para texto de relogio (10h 45m). */
function decimalHoursToHmText(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0h 0m";
  const totalMinutes = Math.round(n * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
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

function maskCnpjInput(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function normalizeFinancialEmailsInput(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/,/g, ";")
    .split(";")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .join(";");
}

function extractApiErrorMessage(
  error: { message?: string; details?: unknown } | undefined,
  fallback: string,
): string {
  if (!error) return fallback;
  const baseMessage = String(error.message ?? "").trim();
  if (typeof error.details === "string" && error.details.trim()) {
    return `${baseMessage || fallback} (${error.details.trim()})`;
  }
  const pickFirstMessage = (value: unknown, prefix = ""): string | null => {
    if (typeof value === "string" && value.trim()) {
      return prefix ? `${prefix}: ${value.trim()}` : value.trim();
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = pickFirstMessage(item, prefix);
        if (nested) return nested;
      }
      return null;
    }
    if (value && typeof value === "object") {
      for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        const nested = pickFirstMessage(nestedValue, nextPrefix);
        if (nested) return nested;
      }
    }
    return null;
  };
  if (error.details && typeof error.details === "object") {
    const detailMessage = pickFirstMessage(error.details);
    if (detailMessage) {
      return `${baseMessage || fallback} (${detailMessage})`;
    }
  }
  return baseMessage || fallback;
}

function normalizeCurrencyValue(value: unknown): string {
  const raw = String(value ?? "0").trim();
  if (!raw) return "0";
  const normalized = raw.replace(/\s/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    const withoutThousands = normalized.split(thousandSeparator).join("");
    return decimalSeparator === "," ? withoutThousands.replace(",", ".") : withoutThousands;
  }
  if (hasComma) {
    const parts = normalized.split(",");
    if (parts.length === 2) {
      return `${parts[0].replace(/\./g, "")}.${parts[1]}`;
    }
    return normalized.replace(/,/g, "");
  }
  return normalized.replace(/,/g, "");
}

function isUseExistingClient(value: unknown): boolean {
  return value === true || value === "true";
}

function paymentMethodLabel(value: string): string {
  const labels: Record<string, string> = {
    boleto: "Boleto",
    transfer: "Transferencia",
    pix: "PIX",
    other: "Outro",
  };
  return labels[value] ?? value;
}

function contractToEditFormValues(contract: ContractItem) {
  return {
    emits_invoice: contract.emits_invoice,
    has_iss_retention: contract.has_iss_retention,
    has_inss_retention: contract.has_inss_retention,
    payment_method: contract.payment_method,
    payment_other: contract.payment_other ?? "",
    notes: contract.notes ?? "",
    service_lines: (contract.service_lines ?? []).map((line) => ({
      service: line.service_id ?? line.service ?? "",
      service_type: line.service_type,
      amount: line.amount,
      starts_on: line.starts_on ?? undefined,
      ends_on: line.ends_on ?? undefined,
      recurrence: line.recurrence ?? undefined,
      recurrence_other: line.recurrence_other ?? undefined,
      notes: line.notes ?? "",
    })),
  };
}

function contractServiceLineRowKey(line: ContractServiceLineItem): string {
  if (line.id) return line.id;
  const serviceRef = line.service_id ?? line.service ?? "svc";
  return `${serviceRef}-${line.service_type}-${line.amount}-${line.starts_on ?? ""}-${line.ends_on ?? ""}`;
}

function buildContractPatchBody(values: Record<string, unknown>) {
  const paymentMethod = String(values.payment_method ?? "").trim();
  const rawLines = Array.isArray(values.service_lines) ? values.service_lines : [];
  const serviceLines = rawLines.map((line) => {
    const record = (line ?? {}) as Record<string, unknown>;
    const serviceType = String(record.service_type ?? "one_off");
    const normalizedAmount = normalizeCurrencyValue(String(record.amount ?? "0"));
    const payload: Record<string, unknown> = {
      service: String(record.service ?? "").trim(),
      service_type: serviceType,
      amount: normalizedAmount,
      notes: String(record.notes ?? "").trim(),
    };
    if (serviceType === "recurring") {
      payload.recurrence = String(record.recurrence ?? "").trim();
      payload.recurrence_other = String(record.recurrence_other ?? "").trim();
      payload.starts_on = String(record.starts_on ?? "").trim() || null;
      payload.ends_on = String(record.ends_on ?? "").trim() || null;
    }
    return payload;
  });
  return {
    emits_invoice: Boolean(values.emits_invoice),
    has_iss_retention: Boolean(values.has_iss_retention),
    has_inss_retention: Boolean(values.has_inss_retention),
    payment_method: paymentMethod,
    payment_other: paymentMethod === "other" ? String(values.payment_other ?? "").trim() : "",
    notes: String(values.notes ?? "").trim(),
    service_lines: serviceLines,
  };
}

type NewSaleWizardValidation = {
  ok: boolean;
  errors: string[];
  useExistingClient: boolean;
  clientId: string;
  clientLabel: string;
  paymentMethod: string;
  paymentLabel: string;
  serviceSummaries: Array<{ name: string; type: string; amount: string }>;
  lines: Array<Record<string, unknown>>;
};

function buildNewSaleWizardValidation(
  values: Record<string, unknown>,
  clients: Record<string, unknown>[],
  serviceCatalog: ServiceCatalogItem[],
): NewSaleWizardValidation {
  const errors: string[] = [];
  const useExistingClient = isUseExistingClient(values.use_existing_client);
  let clientId = "";
  let clientLabel = "-";

  if (useExistingClient) {
    clientId = String(values.existing_client_id ?? "").trim();
    if (!clientId) {
      errors.push("Selecione um cliente existente.");
    }
    const client = clients.find((row) => String(row.id) === clientId);
    clientLabel = client ? String(client.name ?? clientId) : clientId || "-";
  } else {
    const name = String(values.name ?? "").trim();
    const cnpjDigits = String(values.cnpj ?? "").replace(/\D/g, "");
    const contactName = String(values.contact_name ?? "").trim();
    const financialEmails = String(values.financial_emails ?? "").trim();
    if (!name) errors.push("Nome fantasia do cliente e obrigatorio.");
    if (cnpjDigits.length !== 14) errors.push("CNPJ do cliente deve ter 14 digitos.");
    if (!contactName) errors.push("Nome para contato e obrigatorio.");
    if (!financialEmails) errors.push("E-mail financeiro e obrigatorio.");
    clientLabel = name || "-";
  }

  const serviceById = serviceCatalog.reduce<Record<string, string>>((acc, item) => {
    acc[item.id] = item.name;
    return acc;
  }, {});
  const linesRaw = Array.isArray(values.service_lines) ? values.service_lines : [];
  const serviceSummaries: NewSaleWizardValidation["serviceSummaries"] = [];
  const lines = linesRaw
    .map((row) => {
      const record = row as Record<string, unknown>;
      const service = String(record?.service ?? "").trim();
      const serviceType = String(record?.service_type ?? "one_off");
      const amount = normalizeCurrencyValue(record?.amount);
      const payload: Record<string, unknown> = {
        service,
        service_type: serviceType,
        amount,
      };
      const notes = String(record?.notes ?? "").trim();
      if (notes) payload.notes = notes;
      if (serviceType === "recurring") {
        payload.recurrence = String(record?.recurrence ?? "").trim();
        const recurrenceOther = String(record?.recurrence_other ?? "").trim();
        if (recurrenceOther) payload.recurrence_other = recurrenceOther;
        const startsOn = String(record?.starts_on ?? "").trim();
        if (startsOn) payload.starts_on = startsOn;
        const endsOn = String(record?.ends_on ?? "").trim();
        if (endsOn) payload.ends_on = endsOn;
      }
      if (service) {
        serviceSummaries.push({
          name: serviceById[service] ?? service,
          type: serviceType === "recurring" ? "Recorrente" : "Avulso",
          amount,
        });
      }
      return payload;
    })
    .filter((row) => String(row.service ?? "").trim().length > 0);

  if (lines.length === 0) {
    errors.push("Selecione ao menos um servico.");
  }
  lines.forEach((line, index) => {
    if (!String(line.service_type ?? "").trim() || !String(line.amount ?? "").trim()) {
      errors.push(`Servico ${index + 1}: preencha tipo e valor.`);
    }
    if (String(line.service_type ?? "") === "recurring") {
      if (!String(line.recurrence ?? "").trim()) {
        errors.push(`Servico ${index + 1}: informe a periodicidade.`);
      }
      if (!String(line.starts_on ?? "").trim()) {
        errors.push(`Servico ${index + 1}: informe o inicio da vigencia.`);
      }
    }
  });

  const paymentMethod = String(values.payment_method ?? "").trim();
  if (!["boleto", "transfer", "pix", "other"].includes(paymentMethod)) {
    errors.push("Forma de pagamento e obrigatoria.");
  }
  if (paymentMethod === "other" && !String(values.payment_other ?? "").trim()) {
    errors.push("Descreva a forma de pagamento quando selecionar 'Outro'.");
  }

  return {
    ok: errors.length === 0,
    errors,
    useExistingClient,
    clientId,
    clientLabel,
    paymentMethod,
    paymentLabel: paymentMethodLabel(paymentMethod),
    serviceSummaries,
    lines,
  };
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

function renderCommentAttachments(attachments: TaskCommentAttachment[] | undefined) {
  if (!attachments || attachments.length === 0) return null;
  const imageFiles = attachments.filter((file) => {
    const href = resolveMediaUrl(file.url);
    return (file.content_type || "").toLowerCase().startsWith("image/") && href;
  });
  const otherFiles = attachments.filter((file) => !imageFiles.includes(file));
  return (
    <Space wrap size={8} style={{ marginTop: 8 }}>
      {imageFiles.length > 0 ? (
        <AntImage.PreviewGroup>
          {imageFiles.map((file) => {
            const href = resolveMediaUrl(file.url);
            if (!href) return null;
            return (
              <AntImage
                key={file.id}
                src={toBrowserMediaSrc(file.url)}
                alt={file.filename}
                width={160}
                style={{
                  maxHeight: 220,
                  objectFit: "contain",
                  borderRadius: 8,
                  border: "1px solid #f0f0f0",
                  cursor: "pointer",
                }}
              />
            );
          })}
        </AntImage.PreviewGroup>
      ) : null}
      {otherFiles.map((file) => {
        const href = resolveMediaUrl(file.url);
        return (
          <Button key={file.id} size="small" icon={<PaperClipOutlined />} href={href} target={href ? "_blank" : undefined}>
            {file.filename}
          </Button>
        );
      })}
    </Space>
  );
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

function resolveBoardSelection(
  rows: BoardItem[],
  currentBoardId: string | null,
  projectId: string | null,
): string | null {
  if (!rows.length) return null;
  if (currentBoardId) {
    const current = rows.find((board) => board.id === currentBoardId);
    if (current && (!projectId || current.project_id === projectId)) {
      return currentBoardId;
    }
  }
  if (projectId) {
    const projectBoard = rows.find((board) => board.project_id === projectId);
    if (projectBoard) return projectBoard.id;
  }
  return rows[0]?.id ?? null;
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
  currentUserId?: number | null,
): number {
  const active = resolveControllableTimeLog(logs, "active", currentUserId ?? null, true);
  if (!active) return totalSeconds;
  const deltaSeconds = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
  return totalSeconds + deltaSeconds;
}

function resolveControllableTimeLog(
  logs: TimeLog[],
  status: "active" | "paused",
  currentUserId: number | null,
  allowForeignFallback: boolean,
): TimeLog | null {
  const normalized = String(status).toLowerCase();
  const byStatus = logs.filter((log) => String(log.status).toLowerCase() === normalized);
  if (byStatus.length === 0) return null;
  if (currentUserId != null) {
    const own = byStatus.find((log) => Number(log.user_id) === Number(currentUserId));
    if (own) return own;
  }
  if (allowForeignFallback) return byStatus[0] ?? null;
  return null;
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
              <Form.Item
                label="Usuario ou e-mail"
                name="username"
                rules={[{ required: true, message: "Informe usuario ou e-mail." }]}
              >
                <Input autoComplete="username" placeholder="usuario ou email@empresa.com" data-testid="login-username" />
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

type ProjectsSidebarNodeType = "workspace" | "portfolio" | "project" | "board";
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
            : node.type === "portfolio"
              ? FolderOutlined
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
                  <HelpTip title={HELP_TIPS.sidebarRename}>
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
                  </HelpTip>
                  <HelpTip title={HELP_TIPS.sidebarDelete}>
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
                  </HelpTip>
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
  const [activeKey, setActiveKey] = useState<MenuKey>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [health, setHealth] = useState<ApiHealthData>({ ok: false, message: "Carregando..." });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferenceItem[]>([]);
  const [watchedTaskIds, setWatchedTaskIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [allTasks, setAllTasks] = useState<TaskItem[]>([]);
  const [allTasksLoading, setAllTasksLoading] = useState<boolean>(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState<string[]>([]);
  const [taskSearchFilter, setTaskSearchFilter] = useState<string>("");
  const [taskPeriodFilter, setTaskPeriodFilter] = useState<string>("all");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string[]>([]);
  const [taskProjectFilter, setTaskProjectFilter] = useState<string[]>([]);
  const [taskClientFilter, setTaskClientFilter] = useState<string[]>([]);
  const [taskBoardFilter, setTaskBoardFilter] = useState<string[]>([]);
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string[]>([]);
  /** Incluir/exceto independente por dimensao do filtro de tarefas (Dashboard). */
  const [taskStatusFilterMode, setTaskStatusFilterMode] = useState<TaskFilterMatchMode>("include");
  const [taskPriorityFilterMode, setTaskPriorityFilterMode] = useState<TaskFilterMatchMode>("include");
  const [taskProjectFilterMode, setTaskProjectFilterMode] = useState<TaskFilterMatchMode>("include");
  const [taskClientFilterMode, setTaskClientFilterMode] = useState<TaskFilterMatchMode>("include");
  const [taskBoardFilterMode, setTaskBoardFilterMode] = useState<TaskFilterMatchMode>("include");
  const [taskAssigneeFilterMode, setTaskAssigneeFilterMode] = useState<TaskFilterMatchMode>("include");
  const [myWorkTablePage, setMyWorkTablePage] = useState(1);
  const [adminTasksTablePage, setAdminTasksTablePage] = useState(1);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [taskDrawerTab, setTaskDrawerTab] = useState<TaskDrawerTab>("summary");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [taskAssigneePickList, setTaskAssigneePickList] = useState<
    Array<{ id: number; name: string; email: string; username: string; avatar_url?: string | null }>
  >([]);
  const [taskComments, setTaskComments] = useState<TaskCommentItem[]>([]);
  const [taskSubtasks, setTaskSubtasks] = useState<TaskItem[]>([]);
  const [subtasksByParentId, setSubtasksByParentId] = useState<Record<string, TaskItem[]>>({});
  const [expandedTaskKeysByBoardId, setExpandedTaskKeysByBoardId] = useState<Record<string, string[]>>({});
  const [boardListTablePageByBoardId, setBoardListTablePageByBoardId] = useState<Record<string, number>>({});
  const [expandedMyWorkTaskKeys, setExpandedMyWorkTaskKeys] = useState<string[]>([]);
  const [expandedAdminTasksKeys, setExpandedAdminTasksKeys] = useState<string[]>([]);
  const assigneeFilterInitializedRef = useRef(false);
  const commentMutationInFlightRef = useRef(false);
  const [loadingSubtasksParentId, setLoadingSubtasksParentId] = useState<string | null>(null);
  const [createSubtaskOpen, setCreateSubtaskOpen] = useState(false);
  const [createSubtaskParent, setCreateSubtaskParent] = useState<TaskItem | null>(null);
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [createSubtaskForm] = Form.useForm();
  const [taskDetailsForm] = Form.useForm();
  const [taskCommentDraft, setTaskCommentDraft] = useState("");
  const [taskCommentFiles, setTaskCommentFiles] = useState<UploadFile[]>([]);
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
  const [clientDetailData, setClientDetailData] = useState<Record<string, unknown> | null>(null);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Record<string, unknown>[]>([]);
  const [portfolios, setPortfolios] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [boardGroupsIndex, setBoardGroupsIndex] = useState<Record<string, GroupItem>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedBoardIdRef = useRef<string | null>(null);
  const selectedProjectIdRef = useRef<string | null>(null);
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
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false);
  const [newSaleWizardOpen, setNewSaleWizardOpen] = useState(false);
  const [newSaleWizardStep, setNewSaleWizardStep] = useState(0);
  const newSaleWizardValuesRef = useRef<Record<string, unknown>>({});
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createWorkspaceForm] = Form.useForm();
  const [editWorkspaceForm] = Form.useForm();
  const [createClientForm] = Form.useForm();
  const [createPortfolioForm] = Form.useForm();
  const [manageClientForm] = Form.useForm();
  const [manageServiceForm] = Form.useForm();
  const [manageClientModal, setManageClientModal] = useState<{ mode: "create" | "edit"; clientId?: string } | null>(
    null,
  );
  const [manageServiceModal, setManageServiceModal] = useState<{ mode: "create" | "edit"; serviceId?: string } | null>(
    null,
  );
  const [clientListSearch, setClientListSearch] = useState("");
  const [newSaleWizardForm] = Form.useForm();
  const [editContractForm] = Form.useForm();
  const [viewContractData, setViewContractData] = useState<ContractItem | null>(null);
  const [editContractId, setEditContractId] = useState<string | null>(null);
  const [createProjectForm] = Form.useForm();
  const [createBoardForm] = Form.useForm();
  const [createGroupForm] = Form.useForm();
  const [createTaskForm] = Form.useForm();
  const [kanbanGroups, setKanbanGroups] = useState<KanbanGroup[]>([]);
  const [boardGroupSelectOptions, setBoardGroupSelectOptions] = useState<{ value: string; label: string }[]>([]);
  const [boardViewMode] = useState<BoardViewMode>("list");
  const [usersTabKey, setUsersTabKey] = useState<string>("u-list-page");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [selectedTaskIdsByBoardId, setSelectedTaskIdsByBoardId] = useState<Record<string, string[]>>({});
  const [bulkMoveTargetGroupByBoardId, setBulkMoveTargetGroupByBoardId] = useState<Record<string, string>>({});
  const [bulkMoveGlobalTargetByProjectId, setBulkMoveGlobalTargetByProjectId] = useState<Record<string, string>>({});
  const [projectSidebarExpandedKeys, setProjectSidebarExpandedKeys] = useState<string[]>([]);
  const [myWorkPriorityFilter, setMyWorkPriorityFilter] = useState<string[]>([]);
  const [myWorkDeadlineFilter, setMyWorkDeadlineFilter] = useState<string[]>([]);
  const [myWorkPeriodFilter, setMyWorkPeriodFilter] = useState<string>("all");
  const [myWorkStatusFilter, setMyWorkStatusFilter] = useState<string[]>([]);
  const [myWorkStatusFilterMode, setMyWorkStatusFilterMode] = useState<TaskFilterMatchMode>("include");
  const [myWorkPriorityFilterMode, setMyWorkPriorityFilterMode] = useState<TaskFilterMatchMode>("include");
  const [myWorkDeadlineFilterMode, setMyWorkDeadlineFilterMode] = useState<TaskFilterMatchMode>("include");
  const [myWorkClientFilter, setMyWorkClientFilter] = useState<string[]>([]);
  const [myWorkClientFilterMode, setMyWorkClientFilterMode] = useState<TaskFilterMatchMode>("include");
  const [myWorkProjectFilter, setMyWorkProjectFilter] = useState<string[]>([]);
  const [myWorkProjectFilterMode, setMyWorkProjectFilterMode] = useState<TaskFilterMatchMode>("include");
  const [myWorkDateFrom, setMyWorkDateFrom] = useState<string>("");
  const [myWorkDateTo, setMyWorkDateTo] = useState<string>("");
  const [manualTimeModalOpen, setManualTimeModalOpen] = useState(false);
  const [manualTimeForm] = Form.useForm();
  const [passwordChangeForm] = Form.useForm();
  const [bbThemeMode, setBbThemeMode] = useState<"light" | "dark">("dark");
  const { token: antToken } = theme.useToken();
  const [clientRequests, setClientRequests] = useState<Record<string, unknown>[]>([]);
  const [clientRequestsLoading, setClientRequestsLoading] = useState(false);
  const [viewRequestModal, setViewRequestModal] = useState<Record<string, unknown> | null>(null);
  const [convertRequestModal, setConvertRequestModal] = useState<Record<string, unknown> | null>(null);
  const [convertRequestForm] = Form.useForm();
  const [convertBoardOptions, setConvertBoardOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [convertGroupOptions, setConvertGroupOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [hoursDashboard, setHoursDashboard] = useState<Record<string, unknown> | null>(null);
  const [hoursDashboardLoading, setHoursDashboardLoading] = useState(false);
  const [hoursClientFilter, setHoursClientFilter] = useState<string>("");
  const [hoursProjectFilter, setHoursProjectFilter] = useState<string>("");
  const [hoursUserFilter, setHoursUserFilter] = useState<string>("");
  const [hoursUserRoleFilter, setHoursUserRoleFilter] = useState<string>("all");
  const [hoursPeriodFilter, setHoursPeriodFilter] = useState<string>("this_week");
  const [hoursDateFrom, setHoursDateFrom] = useState<string>("");
  const [hoursDateTo, setHoursDateTo] = useState<string>("");
  const [hoursDetailCollaborator, setHoursDetailCollaborator] = useState<Record<string, unknown> | null>(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const whatsNewCheckedRef = useRef(false);
  const [projectsListSearch, setProjectsListSearch] = useState("");
  const [projectsListClientFilter, setProjectsListClientFilter] = useState<string>("all");
  const [projectsListWorkspaceFilter, setProjectsListWorkspaceFilter] = useState<string>("all");
  const [workspacesListSearch, setWorkspacesListSearch] = useState("");
  const deepLinkTaskHandledRef = useRef<string | null>(null);
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
          { key: "dashboard", icon: <AppstoreOutlined />, label: menuLabel("Dashboard", "Resumo rapido da sua operacao.") },
          { key: "my-work", icon: <UnorderedListOutlined />, label: menuLabel("Meu trabalho", HELP_TIPS.menuMyWork) },
          { key: "projects", icon: <FolderOpenOutlined />, label: menuLabel("Projetos", HELP_TIPS.menuProjects) },
        ];
      }
      const base: NonNullable<MenuProps["items"]> = [
        { key: "dashboard", icon: <AppstoreOutlined />, label: menuLabel("Dashboard", "Visao geral: horas, tarefas e filtros operacionais.") },
        { key: "my-work", icon: <UnorderedListOutlined />, label: menuLabel("Meu trabalho", HELP_TIPS.menuMyWork) },
        { key: "projects", icon: <FolderOpenOutlined />, label: menuLabel("Projetos", HELP_TIPS.menuProjects) },
        { key: "workspaces", icon: <FolderOutlined />, label: menuLabel("Areas de trabalho", HELP_TIPS.menuWorkspaces) },
      ];
      return [
        ...base,
        { type: "divider" },
        {
          key: "admin-root",
          icon: <SettingOutlined />,
          label: menuLabel("Administracao", "Cadastros e configuracoes do sistema."),
          children: [
            { key: "clients", icon: <ShopOutlined />, label: menuLabel("Clientes", HELP_TIPS.menuClients) },
            { key: "client-requests", icon: <CommentOutlined />, label: menuLabel("Pedidos de clientes", HELP_TIPS.menuClientRequests) },
            { key: "services", icon: <TagsOutlined />, label: menuLabel("Servicos", HELP_TIPS.menuServices) },
            { key: "sales", icon: <ShoppingCartOutlined />, label: menuLabel("Venda", HELP_TIPS.menuSales) },
            { key: "users", icon: <TeamOutlined />, label: menuLabel("Usuarios", HELP_TIPS.menuUsers) },
            { key: "status-config", icon: <CheckCircleOutlined />, label: menuLabel("Status globais", HELP_TIPS.menuStatus) },
            { key: "stats", icon: <StockOutlined />, label: menuLabel("Estatisticas", HELP_TIPS.menuStats) },
            { key: "problems", icon: <BugOutlined />, label: menuLabel("Problemas", HELP_TIPS.menuProblems) },
            { key: "agents", icon: <RobotOutlined />, label: menuLabel("Agentes", HELP_TIPS.menuAgents) },
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
  const filteredClientsManage = useMemo(() => {
    const query = clientListSearch.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((row) => {
      const name = String(row.name ?? "").toLowerCase();
      const cnpj = String(row.cnpj ?? "").replace(/\D/g, "");
      const contact = String(row.contact_name ?? "").toLowerCase();
      return name.includes(query) || cnpj.includes(query.replace(/\D/g, "")) || contact.includes(query);
    });
  }, [clientListSearch, clients]);

  const contractLineById = useMemo(() => {
    const index: Record<string, ContractServiceLineItem> = {};
    contracts.forEach((contract) => {
      (contract.service_lines ?? []).forEach((line) => {
        if (line.id) index[String(line.id)] = line;
      });
    });
    return index;
  }, [contracts]);
  const currentUserId = useMemo(() => getUserIdFromToken(token), [token]);
  const activeTimeLog = useMemo(
    () => resolveControllableTimeLog(taskSummary.logs, "active", currentUserId, isAdmin),
    [currentUserId, isAdmin, taskSummary.logs],
  );
  const pausedTimeLog = useMemo(
    () => resolveControllableTimeLog(taskSummary.logs, "paused", currentUserId, isAdmin),
    [currentUserId, isAdmin, taskSummary.logs],
  );
  const liveTaskTotalSeconds = useMemo(() => {
    if (!activeTimeLog) {
      return taskSummary.total_seconds;
    }
    const deltaSeconds = Math.max(0, Math.floor((liveTickMs - taskSummaryFetchedAtMs) / 1000));
    return taskSummary.total_seconds + deltaSeconds;
  }, [activeTimeLog, liveTickMs, taskSummary.total_seconds, taskSummaryFetchedAtMs]);

  useEffect(() => {
    if (currentUserId == null || assigneeFilterInitializedRef.current) return;
    // Dashboard admin comeca com todos os colaboradores.
    setTaskAssigneeFilter([]);
    assigneeFilterInitializedRef.current = true;
  }, [currentUserId]);

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
    const fromProfile = typeof avatarRaw === "string" && avatarRaw.trim().length > 0 ? avatarRaw.trim() : null;
    const fromLocal = profileAvatarDataUrl.trim() || null;
    const avatarUrl = resolveMediaUrl(fromLocal || fromProfile) || fromLocal || fromProfile;
    const initial = displayName && displayName !== "-" ? displayName.charAt(0).toUpperCase() : "U";
    return { displayName, avatarUrl, initial };
  }, [currentUserId, profileAvatarDataUrl, profileResult]);

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
      return <Tag color={normalizeStatusTagColor(meta.color)}>{meta.label}</Tag>;
    },
    [resolveStatusMeta],
  );
  const renderEditableStatusTag = useCallback(
    (record: TaskItem) => {
      const meta = resolveStatusMeta(record.status);
      return (
        <Dropdown
          trigger={["click"]}
          menu={{
            items: statusOptions.map((opt) => ({
              key: String(opt.value),
              label: (
                <Tag color={normalizeStatusTagColor(resolveStatusMeta(String(opt.value)).color)} style={{ marginInlineEnd: 0 }}>
                  {opt.label}
                </Tag>
              ),
              onClick: () => {
                void quickChangeTaskStatus(record, String(opt.value));
              },
            })),
          }}
        >
          <span
            onClick={(event) => event.stopPropagation()}
            style={{ cursor: "pointer", display: "inline-flex" }}
          >
            <HelpTip title={HELP_TIPS.statusRapido}>
              <Tag color={normalizeStatusTagColor(meta.color)} style={{ marginInlineEnd: 0 }}>
                {meta.label}
              </Tag>
            </HelpTip>
          </span>
        </Dropdown>
      );
    },
    // quickChangeTaskStatus e estavel o bastante no ciclo do componente
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolveStatusMeta, statusOptions],
  );

  const renderTaskTitleCell = useCallback((value: string, record: TaskItem & { children?: TaskItem[] }) => {
    const isSub = Boolean(record.parent_id);
    const childrenCount = Array.isArray(record.children) ? record.children.length : 0;
    return (
      <div className="bb-task-title-cell" style={{ paddingLeft: isSub ? 8 : 0 }}>
        {isSub ? <Tag>sub</Tag> : null}
        <span className="bb-task-title-text" title={value}>
          {value}
        </span>
        {!isSub && (record.subtasks_count ?? 0) > 0 ? (
          <Tag color="default">{record.subtasks_count} subtarefas</Tag>
        ) : null}
        {!isSub && childrenCount > 0 ? <Tag color="processing">{childrenCount} suas</Tag> : null}
      </div>
    );
  }, []);

  const filterModeOptions = useMemo(
    () => [
      { value: "include" as const, label: "Incluir" },
      { value: "exclude" as const, label: "Exceto" },
    ],
    [],
  );

  const navigateTo = useCallback((nextKey: MenuKey) => {
    const defaultKey: MenuKey = "dashboard";
    if (!isAdmin && RESTRICTED_ADMIN_KEYS.includes(nextKey)) {
      setActiveKey(defaultKey);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${defaultKey}`);
      }
      return;
    }
    if (nextKey === "projects" || nextKey === "workspaces") {
      setSelectedWorkspaceId(null);
      setSelectedPortfolioId(null);
      setSelectedClientId(null);
      setSelectedProjectId(null);
      setSelectedBoardId(null);
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
    {
      key: "theme-toggle",
      icon: <SettingOutlined />,
      label: bbThemeMode === "dark" ? "Tema claro" : "Tema escuro",
      onClick: () => {
        const next = bbThemeMode === "dark" ? "light" : "dark";
        setBbThemeMode(next);
        setBbTheme(next);
      },
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
                key: "clients",
                icon: <ShopOutlined />,
                label: "Clientes",
                onClick: () => navigateTo("clients"),
              },
              {
                key: "client-requests",
                icon: <CommentOutlined />,
                label: "Pedidos de clientes",
                onClick: () => navigateTo("client-requests"),
              },
              {
                key: "services",
                icon: <TagsOutlined />,
                label: "Servicos",
                onClick: () => navigateTo("services"),
              },
              {
                key: "sales",
                icon: <ShoppingCartOutlined />,
                label: "Venda",
                onClick: () => navigateTo("sales"),
              },
              {
                key: "admin-ops",
                icon: <SettingOutlined />,
                label: "Operacoes admin",
                onClick: () => navigateTo("admin-ops"),
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
      const matchesStatus = matchTaskFilterValue(taskStatusFilter, String(task.status ?? ""), "include");
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
    return tasksTabSource
      .filter((task) => {
      if (task.parent_id) return false;
      if (!matchTaskFilterValue(taskStatusFilter, String(task.status ?? ""), taskStatusFilterMode)) return false;
      if (!matchTaskFilterValue(taskPriorityFilter, String(task.priority ?? ""), taskPriorityFilterMode)) return false;
      if (normalizedSearch.length > 0 && !task.title.toLowerCase().includes(normalizedSearch)) return false;
      if (!matchTaskFilterValue(taskBoardFilter, String(task.board_id ?? ""), taskBoardFilterMode)) return false;
      {
        const board = task.board_id ? boardById[task.board_id] : null;
        const projectId = board ? String(board.project_id ?? "") : "";
        if (!matchTaskFilterValue(taskProjectFilter, projectId, taskProjectFilterMode)) return false;
      }
      {
        const board = task.board_id ? boardById[task.board_id] : null;
        const projectId = board?.project_id ? String(board.project_id) : "";
        const project = projectId ? projects.find((row) => String(row.id) === projectId) : null;
        const clientId = project?.client_id ? String(project.client_id) : "";
        const clientName = String(task.client_name ?? "").trim();
        const clientActual = clientId || clientName;
        if (!matchTaskFilterValue(taskClientFilter, clientActual, taskClientFilterMode)) return false;
      }
      {
        const assigneeActual = task.assignee_id ? String(task.assignee_id) : "unassigned";
        if (!matchTaskFilterValue(taskAssigneeFilter, assigneeActual, taskAssigneeFilterMode)) return false;
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
    })
      .slice()
      .sort(compareTaskEndDateAsc);
  }, [
    boardById,
    nowMs,
    projects,
    taskAssigneeFilter,
    taskAssigneeFilterMode,
    taskBoardFilter,
    taskBoardFilterMode,
    taskClientFilter,
    taskClientFilterMode,
    taskPeriodFilter,
    taskPriorityFilter,
    taskPriorityFilterMode,
    taskProjectFilter,
    taskProjectFilterMode,
    taskSearchFilter,
    taskStatusFilter,
    taskStatusFilterMode,
    tasksTabSource,
  ]);
  const myWorkMetrics = useMemo(() => {
    const rootTasks = tasks.filter((task) => !task.parent_id);
    const total = rootTasks.length;
    const todo = rootTasks.filter((task) => task.status === "todo").length;
    const inProgress = rootTasks.filter((task) => task.status === "in_progress").length;
    const blocked = rootTasks.filter((task) => task.status === "blocked").length;
    const done = rootTasks.filter((task) => task.status === "done").length;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const dueSoon = rootTasks.filter((task) => {
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
  const myWorkWeekBounds = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOfWeek = now.getDay(); // 0=domingo
    const daysFromMonday = (dayOfWeek + 6) % 7;
    const startOfWeekMon = startOfToday - daysFromMonday * 24 * 60 * 60 * 1000;
    // Segunda 00:00 ate sexta 23:59:59 da semana corrente
    const endOfWeekFri = startOfWeekMon + 5 * 24 * 60 * 60 * 1000 - 1;
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    return { startOfToday, endOfToday, startOfWeekMon, endOfWeekFri };
  }, [nowMs]);

  const matchesMyWorkTaskFilters = useCallback(
    (task: TaskItem) => {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const { startOfToday, endOfToday, startOfWeekMon, endOfWeekFri } = myWorkWeekBounds;
      if (!matchTaskFilterValue(myWorkPriorityFilter, String(task.priority ?? ""), myWorkPriorityFilterMode)) {
        return false;
      }
      if (!matchTaskFilterValue(myWorkStatusFilter, String(task.status ?? ""), myWorkStatusFilterMode)) {
        return false;
      }
      {
        const board = task.board_id ? boardById[task.board_id] : null;
        const projectId = board ? String(board.project_id ?? "") : "";
        if (!matchTaskFilterValue(myWorkProjectFilter, projectId, myWorkProjectFilterMode)) return false;
      }
      {
        const board = task.board_id ? boardById[task.board_id] : null;
        const projectId = board?.project_id ? String(board.project_id) : "";
        const project = projectId ? projects.find((row) => String(row.id) === projectId) : null;
        const clientId = project?.client_id ? String(project.client_id) : "";
        const clientName = String(task.client_name ?? "").trim();
        const clientActual = clientId || clientName;
        if (!matchTaskFilterValue(myWorkClientFilter, clientActual, myWorkClientFilterMode)) return false;
      }
      const endMs = task.end_date ? new Date(task.end_date).getTime() : null;
      const startMs = task.start_date ? new Date(task.start_date).getTime() : null;
      const refMs = endMs ?? startMs;
      if (myWorkDeadlineFilter.length > 0) {
        const deadlineKey =
          endMs === null
            ? "no_due"
            : endMs < nowMs && task.status !== "done"
              ? "overdue"
              : endMs >= nowMs && endMs <= nowMs + sevenDaysMs && task.status !== "done"
                ? "due_7"
                : "other";
        // "other" so nao casa com filtros especificos — include exige hit; exclude rejeita hit
        if (!matchTaskFilterValue(myWorkDeadlineFilter, deadlineKey, myWorkDeadlineFilterMode)) {
          // Se filtro so tem overdue/due_7/no_due e tarefa e "other", include falha (ok).
          // Mas due_7 e overdue sao exclusivos — ok.
          return false;
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
          if (!(isOpen && endMs >= startOfWeekMon && endMs <= endOfWeekFri)) return false;
        } else if (myWorkPeriodFilter === "overdue") {
          if (!(isOpen && endMs < startOfToday)) return false;
        }
      }
      if (myWorkDateFrom || myWorkDateTo) {
        if (refMs === null) return false;
        if (myWorkDateFrom) {
          const fromMs = new Date(`${myWorkDateFrom}T00:00:00`).getTime();
          if (Number.isFinite(fromMs) && refMs < fromMs) return false;
        }
        if (myWorkDateTo) {
          const toMs = new Date(`${myWorkDateTo}T23:59:59`).getTime();
          if (Number.isFinite(toMs) && refMs > toMs) return false;
        }
      }
      return true;
    },
    [
      boardById,
      myWorkClientFilter,
      myWorkClientFilterMode,
      myWorkDateFrom,
      myWorkDateTo,
      myWorkDeadlineFilter,
      myWorkDeadlineFilterMode,
      myWorkPeriodFilter,
      myWorkPriorityFilter,
      myWorkPriorityFilterMode,
      myWorkProjectFilter,
      myWorkProjectFilterMode,
      myWorkStatusFilter,
      myWorkStatusFilterMode,
      myWorkWeekBounds,
      nowMs,
      projects,
    ],
  );

  type MyWorkTaskRow = TaskItem & { children?: MyWorkTaskRow[] };

  const myWorkFilteredTasks = useMemo(() => {
    const matching = tasks.filter((task) => matchesMyWorkTaskFilters(task));
    const matchingIds = new Set(matching.map((t) => t.id));
    const childrenByParent = new Map<string, MyWorkTaskRow[]>();
    matching.forEach((task) => {
      if (!task.parent_id) return;
      const parentId = String(task.parent_id);
      const list = childrenByParent.get(parentId) ?? [];
      list.push({ ...task });
      childrenByParent.set(parentId, list);
    });
    childrenByParent.forEach((kids, parentId) => {
      childrenByParent.set(parentId, kids.slice().sort(compareTaskEndDateAsc));
    });

    const roots: MyWorkTaskRow[] = [];
    const seenRoots = new Set<string>();
    const considerRoot = (root: TaskItem) => {
      const rootId = root.id;
      if (seenRoots.has(rootId)) return;
      const kids = childrenByParent.get(rootId) ?? [];
      const rootMatches = matchingIds.has(rootId);
      if (!rootMatches && kids.length === 0) return;
      seenRoots.add(rootId);
      roots.push({
        ...root,
        children: kids.length > 0 ? kids : undefined,
      });
    };

    // Raizes que passaram no filtro
    matching.forEach((task) => {
      if (!task.parent_id) considerRoot(task);
    });
    // Pais das subtarefas filtradas (mesmo se o pai nao passou sozinho)
    childrenByParent.forEach((_kids, parentId) => {
      const parent = tasks.find((row) => row.id === parentId);
      if (parent) considerRoot(parent);
    });

    return roots.slice().sort(compareTaskEndDateAsc);
  }, [matchesMyWorkTaskFilters, tasks]);
  const taskTimeSummaryTargets = useMemo(() => {
    const map = new Map<string, TaskItem>();
    const pageSlice = <T,>(rows: T[], page: number): T[] => {
      const start = Math.max(0, (page - 1) * TASK_TABLE_PAGE_SIZE);
      return rows.slice(start, start + TASK_TABLE_PAGE_SIZE);
    };
    if (activeKey === "my-work") {
      pageSlice(myWorkFilteredTasks, myWorkTablePage).forEach((t) => {
        map.set(t.id, t);
        (t.children ?? []).forEach((child) => map.set(child.id, child));
      });
    }
    if ((activeKey === "dashboard" || activeKey === "tasks") && isAdmin) {
      pageSlice(tasksTabFiltered, adminTasksTablePage).forEach((t) => map.set(t.id, t));
      expandedAdminTasksKeys.forEach((parentId) => {
        const kids = subtasksByParentId[parentId] ?? [];
        kids.forEach((child) => map.set(child.id, child));
      });
    }
    if ((activeKey === "projects" || activeKey === "workspaces") && selectedProjectId) {
      boards
        .filter((board) => board.project_id === selectedProjectId)
        .forEach((board) => {
          const rows = boardListTasksByBoardId[board.id] ?? [];
          const page = boardListTablePageByBoardId[board.id] ?? 1;
          pageSlice(rows, page).forEach((t) => map.set(t.id, t));
          const expanded = expandedTaskKeysByBoardId[board.id] ?? [];
          expanded.forEach((parentId) => {
            (subtasksByParentId[parentId] ?? []).forEach((child) => map.set(child.id, child));
          });
        });
    }
    return Array.from(map.values());
  }, [
    activeKey,
    adminTasksTablePage,
    boardListTablePageByBoardId,
    boardListTasksByBoardId,
    boards,
    expandedAdminTasksKeys,
    expandedTaskKeysByBoardId,
    isAdmin,
    myWorkFilteredTasks,
    myWorkTablePage,
    selectedProjectId,
    subtasksByParentId,
    tasksTabFiltered,
  ]);
  const taskTimeSummaryIdsKey = useMemo(
    () => taskTimeSummaryTargets.map((t) => t.id).sort().join(","),
    [taskTimeSummaryTargets],
  );
  const anyTaskTimeSummaryActive = useMemo(
    () =>
      Object.values(taskTimeSummaryByTaskId).some(
        (row) => resolveControllableTimeLog(row.logs, "active", currentUserId, isAdmin) != null,
      ),
    [currentUserId, isAdmin, taskTimeSummaryByTaskId],
  );
  const myWorkOverdueTasks = useMemo(() => {
    return tasks
      .filter((task) => task.end_date && task.status !== "done" && new Date(task.end_date).getTime() < nowMs)
      .sort((a, b) => new Date(a.end_date ?? 0).getTime() - new Date(b.end_date ?? 0).getTime())
      .slice(0, 8);
  }, [nowMs, tasks]);
  const myWorkGrouped = useMemo(() => {
    const { startOfToday, endOfToday, startOfWeekMon, endOfWeekFri } = myWorkWeekBounds;
    const openTasks = tasks.filter((task) => task.status !== "done");
    const withDue = openTasks.filter((task) => !!task.end_date);
    const noDue = openTasks.filter((task) => !task.end_date);
    const today = withDue.filter((task) => {
      const t = new Date(task.end_date ?? "").getTime();
      return t >= startOfToday && t <= endOfToday;
    });
    const week = withDue.filter((task) => {
      const t = new Date(task.end_date ?? "").getTime();
      return t >= startOfWeekMon && t <= endOfWeekFri;
    });
    const overdue = withDue.filter((task) => new Date(task.end_date ?? "").getTime() < startOfToday);
    return { today, week, overdue, noDue };
  }, [myWorkWeekBounds, tasks]);
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
  const accessibleProjectsList = useMemo(() => {
    if (!visibleWorkspaceIds) return projects;
    return projects.filter((project) => {
      const portfolioId = String(project.portfolio_id ?? "");
      const portfolio = portfolios.find((item) => String(item.id) === portfolioId);
      const workspaceId = portfolio ? String(portfolio.workspace_id ?? "") : "";
      return workspaceId && visibleWorkspaceIds.has(workspaceId);
    });
  }, [portfolios, projects, visibleWorkspaceIds]);
  const filteredProjectsCards = useMemo(() => {
    const query = projectsListSearch.trim().toLowerCase();
    return accessibleProjectsList.filter((project) => {
      const projectId = String(project.id ?? "");
      const name = String(project.name ?? "").toLowerCase();
      const clientId = project.client_id ? String(project.client_id) : "";
      const clientName = clientId
        ? String(clients.find((c) => String(c.id) === clientId)?.name ?? "").toLowerCase()
        : "";
      const portfolioId = project.portfolio_id ? String(project.portfolio_id) : "";
      const workspaceId = portfolioId
        ? String(portfolios.find((p) => String(p.id) === portfolioId)?.workspace_id ?? "")
        : "";
      if (projectsListClientFilter !== "all" && clientId !== projectsListClientFilter) return false;
      if (projectsListWorkspaceFilter !== "all" && workspaceId !== projectsListWorkspaceFilter) return false;
      if (!query) return true;
      return name.includes(query) || clientName.includes(query) || projectId.includes(query);
    });
  }, [
    accessibleProjectsList,
    clients,
    portfolios,
    projectsListClientFilter,
    projectsListSearch,
    projectsListWorkspaceFilter,
  ]);
  const filteredWorkspacesCards = useMemo(() => {
    const query = workspacesListSearch.trim().toLowerCase();
    if (!query) return visibleWorkspaces;
    return visibleWorkspaces.filter((ws) => String(ws.name ?? "").toLowerCase().includes(query));
  }, [visibleWorkspaces, workspacesListSearch]);
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
  const portfoliosForWorkspace = useCallback(
    (workspaceId: string) =>
      portfolios.filter((portfolio) => String(portfolio.workspace_id ?? "") === workspaceId),
    [portfolios],
  );
  const projectsForPortfolio = useCallback(
    (portfolioId: string) => projects.filter((project) => String(project.portfolio_id ?? "") === portfolioId),
    [projects],
  );
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
  const selectedPortfolio = useMemo(
    () =>
      selectedPortfolioId ? portfolios.find((row) => String(row.id) === selectedPortfolioId) ?? null : null,
    [portfolios, selectedPortfolioId],
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
        children: portfoliosForWorkspace(workspaceId).map((portfolio) => {
          const portfolioId = String(portfolio.id);
          return {
            key: `pf:${portfolioId}`,
            title: String(portfolio.name ?? "Portfolio"),
            type: "portfolio",
            children: projectsForPortfolio(portfolioId).map((project) => {
              const projectId = String(project.id);
              const clientId = project.client_id ? String(project.client_id) : "";
              const clientName = clientId
                ? String(clients.find((row) => String(row.id) === clientId)?.name ?? "")
                : "";
              const projectTitle = clientName
                ? `${String(project.name ?? "Projeto")} (${clientName})`
                : String(project.name ?? "Projeto");
              return {
                key: `pr:${projectId}`,
                title: projectTitle,
                type: "project",
              };
            }),
          };
        }),
      };
    });
  }, [clients, portfoliosForWorkspace, projectsForPortfolio, visibleWorkspaces]);
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
    const pf = selectedPortfolioId;
    const pr = selectedProjectId;
    if (!ws) return null;
    const portfolioOk = Boolean(
      pf && portfoliosForWorkspace(ws).some((row) => String(row.id) === String(pf)),
    );
    const projectOk = Boolean(
      pf &&
        pr &&
        portfolioOk &&
        projectsForPortfolio(String(pf)).some((row) => String(row.id) === String(pr)),
    );
    if (projectOk && pf && pr) return `pr:${pr}`;
    if (portfolioOk && pf) return `pf:${pf}`;
    return `ws:${ws}`;
  }, [
    portfoliosForWorkspace,
    projectsForPortfolio,
    selectedPortfolioId,
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
      if (activeKey !== "projects" && activeKey !== "workspaces") {
        navigateTo(isAdmin ? "workspaces" : "projects");
      }
      if (raw.startsWith("ws:")) {
        const workspaceId = raw.replace("ws:", "");
        setSelectedWorkspaceId(workspaceId);
        setSelectedPortfolioId(null);
        setSelectedClientId(null);
        setSelectedProjectId(null);
        setSelectedBoardId(null);
        return;
      }
      if (raw.startsWith("pf:")) {
        const portfolioId = raw.replace("pf:", "");
        const portfolio = portfolios.find((row) => String(row.id) === portfolioId) ?? null;
        if (portfolio?.workspace_id) setSelectedWorkspaceId(String(portfolio.workspace_id));
        setSelectedPortfolioId(portfolioId);
        setSelectedClientId(null);
        setSelectedProjectId(null);
        setSelectedBoardId(null);
        return;
      }
      if (raw.startsWith("pr:")) {
        const projectId = raw.replace("pr:", "");
        const project = projects.find((row) => String(row.id) === projectId) ?? null;
        const portfolioId = project ? String(project.portfolio_id ?? "") : "";
        const workspaceId = portfolioId
          ? String(portfolios.find((item) => String(item.id) === portfolioId)?.workspace_id ?? "")
          : "";
        if (workspaceId) setSelectedWorkspaceId(workspaceId);
        if (portfolioId) setSelectedPortfolioId(portfolioId);
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
        if (project?.portfolio_id) setSelectedPortfolioId(String(project.portfolio_id));
        if (project?.client_id) setSelectedClientId(String(project.client_id));
        const workspaceId = project
          ? String(portfolios.find((item) => String(item.id) === String(project.portfolio_id ?? ""))?.workspace_id ?? "")
          : board.workspace_id;
        if (workspaceId) setSelectedWorkspaceId(workspaceId);
      }
    },
    [activeKey, boards, boardsForProject, isAdmin, navigateTo, portfolios, projects],
  );
  const taskContext = useCallback(
    (task: TaskItem) => {
      const board = boardById[task.board_id];
      const group = boardGroupsIndex[task.group_id];
      const projectId = board?.project_id ? String(board.project_id) : "";
      const project = projectId ? projects.find((row) => String(row.id) === projectId) : null;
      const projectName = projectId ? projectNameById[projectId] ?? projectId : "-";
      const clientId = project?.client_id ? String(project.client_id) : "";
      const clientFromList = clientId
        ? clients.find((row) => String(row.id) === clientId)
        : null;
      const clientLabel =
        String(task.client_name ?? "").trim() ||
        (clientFromList ? String(clientFromList.name ?? "") : "") ||
        (clientId || "-");
      const isCurrentUserTask = currentUserId !== null && task.assignee_id === currentUserId;
      const pick = task.assignee_id != null ? taskAssigneePickList.find((u) => u.id === task.assignee_id) : null;
      const personLabel = isCurrentUserTask
        ? currentUserIdentity.displayName
        : pick?.name || (task.assignee_id ? `Usuario ${task.assignee_id}` : "Sem responsavel");
      const personAvatarUrl = isCurrentUserTask
        ? currentUserIdentity.avatarUrl
        : task.assignee_id != null
          ? readStoredAvatarDataUrl(task.assignee_id)
          : null;
      return {
        personLabel,
        personAvatarUrl,
        personInitial: personLabel.charAt(0).toUpperCase() || "?",
        projectLabel: projectName,
        clientLabel,
        boardLabel: board?.name ?? task.board_id,
        groupLabel: group?.name ?? task.group_id,
      };
    },
    [boardById, boardGroupsIndex, clients, currentUserId, currentUserIdentity, projectNameById, projects, taskAssigneePickList],
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

  const fetchNotificationPreferences = useCallback(async () => {
    const response = await apiRequest<{ preferences: NotificationPreferenceItem[] }>(
      "/me/notification-preferences",
      { token },
    );
    if (response.ok) {
      setNotificationPreferences(response.data?.preferences ?? []);
    }
  }, [token]);

  const fetchNotificationSubscriptions = useCallback(async () => {
    const response = await apiRequest<{
      subscriptions: Array<{ target_type: string; target_id: string }>;
    }>("/me/notification-subscriptions", { token });
    if (!response.ok) return;
    const taskIds = new Set(
      (response.data?.subscriptions ?? [])
        .filter((row) => row.target_type === "task")
        .map((row) => String(row.target_id)),
    );
    setWatchedTaskIds(taskIds);
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
    const mapUserRow = (row: {
      id?: number;
      name?: string;
      email?: string;
      username?: string;
      avatar_url?: string | null;
    }) => {
      const id = Number(row.id);
      const nameRaw = String(row.name ?? "").trim();
      const email = String(row.email ?? "").trim();
      const username = String(row.username ?? "").trim() || email.split("@")[0] || `user${id}`;
      return {
        id,
        name: nameRaw || email || `Usuario ${id}`,
        email,
        username,
        avatar_url: row.avatar_url ?? null,
      };
    };
    const directoryResp = await apiRequest<{
      users?: Array<{ id?: number; name?: string; email?: string; username?: string; avatar_url?: string | null }>;
    }>("/assignees", { token });
    if (directoryResp.ok) {
      const rows = directoryResp.data?.users ?? [];
      setTaskAssigneePickList(
        rows
          .map(mapUserRow)
          .filter((row) => Number.isFinite(row.id))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
      return;
    }

    const resp = await apiRequest<{
      users?: Array<{ id?: number; name?: string; email?: string; username?: string; avatar_url?: string | null }>;
    }>("/users?page=1&page_size=200", { token });
    if (resp.ok) {
      const rows = resp.data?.users ?? [];
      setTaskAssigneePickList(
        rows
          .map(mapUserRow)
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
        username: String(u.email ?? "").split("@")[0] || `user${u.id}`,
        avatar_url: null as string | null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (fromAdmin.length > 0) {
      setTaskAssigneePickList(fromAdmin);
      return;
    }
    const uniq = new Map<
      number,
      { id: number; name: string; email: string; username: string; avatar_url?: string | null }
    >();
    const ensure = (
      id: number | null | undefined,
      name: string,
      email = "",
      avatarUrl: string | null = null,
      username = "",
    ) => {
      if (id == null || !Number.isFinite(Number(id))) return;
      const n = Number(id);
      const prev = uniq.get(n);
      if (!prev) {
        uniq.set(n, {
          id: n,
          name,
          email,
          username: username || email.split("@")[0] || `user${n}`,
          avatar_url: avatarUrl,
        });
        return;
      }
      if (prev.name.startsWith("Usuario ") && name && !name.startsWith("Usuario ")) {
        prev.name = name;
      }
      if (!prev.email && email) prev.email = email;
      if (!prev.username && (username || email)) prev.username = username || email.split("@")[0] || prev.username;
      if (!prev.avatar_url && avatarUrl) prev.avatar_url = avatarUrl;
    };
    for (const task of [...tasks, ...allTasks]) {
      if (task.assignee_id == null) continue;
      ensure(
        task.assignee_id,
        task.assignee_id === currentUserId
          ? currentUserIdentity.displayName
          : String(task.assignee_name ?? "").trim() || `Usuario ${task.assignee_id}`,
        String(task.assignee_email ?? "").trim(),
        task.assignee_avatar_url ?? null,
      );
    }
    if (currentUserId != null) {
      ensure(currentUserId, currentUserIdentity.displayName, "", currentUserIdentity.avatarUrl);
    }
    setTaskAssigneePickList(Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  }, [token, adminUsersCache, tasks, allTasks, currentUserId, currentUserIdentity.avatarUrl, currentUserIdentity.displayName]);

  const renderAssigneeAvatar = useCallback(
    (
      assigneeId: number | null | undefined,
      size: "small" | "default" | number = "small",
      extras?: { name?: string | null; avatarUrl?: string | null },
    ) => (
      <TaskAssigneeAvatar
        assigneeId={assigneeId}
        users={taskAssigneePickList}
        currentUserId={currentUserId}
        currentUserName={currentUserIdentity.displayName}
        currentUserAvatarUrl={currentUserIdentity.avatarUrl}
        fallbackName={extras?.name}
        fallbackAvatarUrl={extras?.avatarUrl}
        size={size}
      />
    ),
    [currentUserId, currentUserIdentity.avatarUrl, currentUserIdentity.displayName, taskAssigneePickList],
  );

  const assigneeColumn = useMemo(
    () => ({
      title: "Resp",
      key: "assignee",
      width: 72,
      align: "center" as const,
      render: (_: unknown, record: TaskItem) => (
        <span onClick={(event) => event.stopPropagation()}>
          {renderAssigneeAvatar(record.assignee_id, "small", {
            name: record.assignee_name,
            avatarUrl: record.assignee_avatar_url,
          })}
        </span>
      ),
    }),
    [renderAssigneeAvatar],
  );

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
    const [clientsResp, servicesResp, contractsResp, workspacesResp, portfoliosResp, projectsResp] = await Promise.all([
      apiRequest<{ clients: Record<string, unknown>[] }>("/clients?page=1&page_size=50", { token }),
      apiRequest<{ services: ServiceCatalogItem[] }>("/services", { token }),
      apiRequest<{ contracts: ContractItem[] }>("/contracts", { token }),
      apiRequest<{ workspaces: Record<string, unknown>[] }>("/workspaces", { token }),
      apiRequest<{ portfolios: Record<string, unknown>[] }>("/portfolios", { token }),
      apiRequest<{ projects: Record<string, unknown>[] }>("/projects", { token }),
    ]);
    const failures: string[] = [];
    if (clientsResp.ok) setClients(clientsResp.data?.clients ?? []);
    else failures.push(`clientes (${clientsResp.error?.message ?? "erro"})`);
    if (servicesResp.ok) setServiceCatalog(servicesResp.data?.services ?? []);
    else failures.push(`servicos (${servicesResp.error?.message ?? "erro"})`);
    if (contractsResp.ok) setContracts(contractsResp.data?.contracts ?? []);
    else failures.push(`vendas (${contractsResp.error?.message ?? "erro"})`);
    if (workspacesResp.ok) setWorkspaces(workspacesResp.data?.workspaces ?? []);
    else failures.push(`areas (${workspacesResp.error?.message ?? "erro"})`);
    if (portfoliosResp.ok) setPortfolios(portfoliosResp.data?.portfolios ?? []);
    else failures.push(`portfolios (${portfoliosResp.error?.message ?? "erro"})`);
    if (projectsResp.ok) setProjects(projectsResp.data?.projects ?? []);
    else failures.push(`projetos (${projectsResp.error?.message ?? "erro"})`);
    if (failures.length > 0) {
      apiMessage.error(
        `Falha ao carregar: ${failures.join("; ")}. Em producao, confira se as migrations foram aplicadas.`,
      );
    }
  }, [apiMessage, token]);

  const loadBoardGroupSelectOptions = useCallback(
    async (boardId: string) => {
      if (!boardId || !token) {
        setBoardGroupSelectOptions([]);
        return [] as { value: string; label: string }[];
      }
      const response = await apiRequest<{ groups: GroupItem[] }>(`/boards/${boardId}/groups`, { token });
      if (!response.ok) {
        setBoardGroupSelectOptions([]);
        return [] as { value: string; label: string }[];
      }
      const options = [...(response.data?.groups ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((group) => ({ value: group.id, label: formatColumnLabel(group.name) }));
      setBoardGroupSelectOptions(options);
      return options;
    },
    [token],
  );

  const ensureDefaultGroupForBoard = useCallback(
    async (boardId: string): Promise<{ value: string; label: string }[]> => {
      let options = await loadBoardGroupSelectOptions(boardId);
      if (options.length > 0) return options;

      const createDefaultGroup = await apiRequest<{ group?: { id?: string; name?: string } }>(
        `/boards/${boardId}/groups`,
        {
          method: "POST",
          token,
          body: { name: "Lista principal", wip_limit: 50 },
        },
      );
      if (!createDefaultGroup.ok) {
        apiMessage.error(
          createDefaultGroup.error?.message ?? "Falha ao preparar a lista padrao do quadro.",
        );
        return [];
      }

      options = await loadBoardGroupSelectOptions(boardId);
      if (options.length === 0) {
        const createdId = String(createDefaultGroup.data?.group?.id ?? "");
        if (createdId) {
          options = [{ value: createdId, label: "Lista principal" }];
          setBoardGroupSelectOptions(options);
        }
      }
      return options;
    },
    [apiMessage, loadBoardGroupSelectOptions, token],
  );

  useEffect(() => {
    if (!createTaskOpen || !token) return;
    void hydrateTaskAssigneePickList();
    const targetBoardId = composeBoardId ?? selectedBoardId;
    if (!targetBoardId) return;
    void (async () => {
      const options = await ensureDefaultGroupForBoard(targetBoardId);
      const currentGroupId = createTaskForm.getFieldValue("group_id");
      const stillValid = options.some((option) => option.value === currentGroupId);
      if (!stillValid && options[0]) {
        createTaskForm.setFieldsValue({ group_id: options[0].value });
      }
    })();
  }, [
    composeBoardId,
    createTaskForm,
    createTaskOpen,
    ensureDefaultGroupForBoard,
    hydrateTaskAssigneePickList,
    selectedBoardId,
    token,
  ]);

  useEffect(() => {
    if (!token || !selectedBoardId) {
      setBoardGroupSelectOptions([]);
      return;
    }
    void loadBoardGroupSelectOptions(selectedBoardId);
  }, [loadBoardGroupSelectOptions, selectedBoardId, token]);

  const fetchClientDetail = useCallback(
    async (clientId: string) => {
      if (!clientId) return;
      const response = await apiRequest<Record<string, unknown>>(`/clients/${clientId}`, { token });
      if (!response.ok) {
        apiMessage.error(response.error?.message ?? "Falha ao carregar detalhe do cliente.");
        return;
      }
      setClientDetailData(response.data ?? null);
    },
    [apiMessage, token],
  );
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
    const nextBoardId = resolveBoardSelection(
      rows,
      selectedBoardIdRef.current,
      selectedProjectIdRef.current,
    );
    if (nextBoardId !== selectedBoardIdRef.current) {
      setSelectedBoardId(nextBoardId);
    }
  }, [fetchBoardGroupsIndex, token]);

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

  const fetchStatusCatalog = useCallback(async () => {
    if (!token) return;
    const response = await apiRequest<{
      statuses?: Array<{
        key?: string;
        label?: string;
        color?: string;
        is_done_like?: boolean;
        position?: number;
        is_active?: boolean;
      }>;
    }>("/task-statuses", { token });
    if (!response.ok) return;
    const rows = response.data?.statuses ?? [];
    if (rows.length === 0) return;
    const nextPalette: Record<string, { label: string; color: string }> = {};
    rows
      .filter((row) => row.is_active !== false)
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .forEach((row) => {
        const key = String(row.key ?? "").trim();
        if (!key) return;
        nextPalette[key] = {
          label: String(row.label ?? key),
          color: normalizeStatusTagColor(String(row.color ?? "default") || "default"),
        };
      });
    if (Object.keys(nextPalette).length === 0) return;
    setStatusPalette(nextPalette);
    if (typeof window !== "undefined") {
      localStorage.setItem(STATUS_PALETTE_STORAGE_KEY, JSON.stringify(nextPalette));
    }
    // Evita warning do Ant Design quando a tela Status globais nao esta montada.
    if (activeKey === "status-config") {
      statusPaletteForm.setFieldsValue({
        rows: Object.entries(nextPalette).map(([key, meta]) => ({
          source_key: key,
          label: meta.label,
          color: meta.color,
          is_done_like: key === "done",
          is_active: true,
        })),
      });
    }
  }, [activeKey, statusPaletteForm, token]);

  const loadAllData = useCallback(async () => {
    if (!token) return;
    const jobs: Array<Promise<unknown>> = [
      fetchHealth(),
      fetchNotifications(),
      fetchNotificationPreferences(),
      fetchNotificationSubscriptions(),
      fetchTasks(),
      fetch2FASettings(),
      fetchProfile(),
      fetchMeWorkspaceAccess(),
      fetchCrudData(),
      fetchBoards(),
      fetchStatusCatalog(),
    ];
    await Promise.all(jobs);
  }, [
    fetch2FASettings,
    fetchBoards,
    fetchCrudData,
    fetchHealth,
    fetchMeWorkspaceAccess,
    fetchNotificationPreferences,
    fetchNotificationSubscriptions,
    fetchNotifications,
    fetchProfile,
    fetchStatusCatalog,
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
    if (!token || !isAdmin) return;
    if (activeKey === "clients" || activeKey === "services" || activeKey === "sales") {
      fetchCrudData().catch(() => undefined);
    }
  }, [activeKey, fetchCrudData, isAdmin, token]);

  useEffect(() => {
    if (!token || activeKey !== "profile") return;
    fetchNotificationPreferences().catch(() => undefined);
  }, [activeKey, fetchNotificationPreferences, token]);

  useEffect(() => {
    if (!token) return;
    installReportProblemCollectors();
  }, [token]);

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
      const validToken = isTokenExpired(storedToken) ? null : storedToken;
      if (!validToken) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(REFRESH_STORAGE_KEY);
      }
      const fallbackKey: MenuKey = "dashboard";
      const initialKey = getMenuKeyFromHash(window.location.hash, fallbackKey);
      setToken(validToken);
      setRefreshToken(localStorage.getItem(REFRESH_STORAGE_KEY));
      setActiveKey(initialKey);
      try {
        const raw = localStorage.getItem(TASK_STATUS_FILTER_KEY);
        if (!raw || raw === "all") setTaskStatusFilter([]);
        else if (raw.startsWith("[")) setTaskStatusFilter(JSON.parse(raw) as string[]);
        else setTaskStatusFilter(raw === "all" ? [] : [raw]);
      } catch {
        setTaskStatusFilter([]);
      }
      setTaskSearchFilter(localStorage.getItem(TASK_SEARCH_FILTER_KEY) ?? "");
      // Projetos / Areas de trabalho abrem sempre a visao geral (cards + filtros).
      // Nao restaurar drill-down do localStorage nessas rotas.
      if (initialKey === "projects" || initialKey === "workspaces") {
        setSelectedBoardId(null);
        setSelectedWorkspaceId(null);
        setSelectedPortfolioId(null);
        setSelectedClientId(null);
        setSelectedProjectId(null);
      } else {
        setSelectedBoardId(localStorage.getItem(BOARD_STORAGE_KEY));
        setSelectedWorkspaceId(localStorage.getItem(SELECTED_WORKSPACE_STORAGE_KEY));
        setSelectedPortfolioId(localStorage.getItem(SELECTED_PORTFOLIO_STORAGE_KEY));
        setSelectedClientId(localStorage.getItem(SELECTED_CLIENT_STORAGE_KEY));
        setSelectedProjectId(localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY));
      }
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
                color: normalizeStatusTagColor(parsed[key].color ?? DEFAULT_STATUS_META[key].color),
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
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      setBbThemeMode(storedTheme === "light" ? "light" : "dark");
      setHydratedSession(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<"light" | "dark">).detail;
      if (detail === "dark" || detail === "light") {
        setBbThemeMode(detail);
      }
    };
    window.addEventListener(BB_THEME_EVENT, onTheme as EventListener);
    return () => window.removeEventListener(BB_THEME_EVENT, onTheme as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hydratedSession) return;
    let previousHash = window.location.hash;
    const syncWithHash = () => {
      const defaultKey: MenuKey = "dashboard";
      const taskDeepLink = getTaskIdFromHash(window.location.hash);
      if (taskDeepLink) return;
      let nextKey = getMenuKeyFromHash(window.location.hash, defaultKey);
      if (isAdmin && nextKey === "tasks") nextKey = "dashboard";
      const previousKey = getMenuKeyFromHash(previousHash, defaultKey);
      previousHash = window.location.hash;
      if (!isAdmin && RESTRICTED_ADMIN_KEYS.includes(nextKey)) {
        setActiveKey(defaultKey);
        window.history.replaceState(null, "", `#${defaultKey}`);
        previousHash = `#${defaultKey}`;
        return;
      }
      // Ao entrar em Projetos / Areas (mudanca de rota), abrir a visao geral.
      if (
        (nextKey === "projects" || nextKey === "workspaces") &&
        previousKey !== nextKey
      ) {
        setSelectedWorkspaceId(null);
        setSelectedPortfolioId(null);
        setSelectedClientId(null);
        setSelectedProjectId(null);
        setSelectedBoardId(null);
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
    if (!token || !hydratedSession) return;
    if (!isTokenExpired(token, nowMs)) return;
    apiMessage.error("Sessao expirada. Entre novamente.");
    handleLogout();
  }, [apiMessage, hydratedSession, nowMs, token]);

  useEffect(() => {
    if (!token || !hydratedSession) return;
    const forceWhatsNew =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("novidades") === "1";
    if (forceWhatsNew) {
      setWhatsNewOpen(true);
      return;
    }
    if (whatsNewCheckedRef.current) return;
    whatsNewCheckedRef.current = true;
    const userKey = String(getUserIdFromToken(token) ?? "session");
    if (!hasSeenWhatsNew(userKey, APP_WHATS_NEW_VERSION)) {
      setWhatsNewOpen(true);
    }
  }, [hydratedSession, token]);

  useEffect(() => {
    if (!token || !hydratedSession) return;
    const taskId = typeof window !== "undefined" ? getTaskIdFromHash(window.location.hash) : null;
    if (!taskId) return;
    if (deepLinkTaskHandledRef.current === taskId) return;
    void (async () => {
      const cached =
        tasks.find((t) => t.id === taskId) ??
        allTasks.find((t) => t.id === taskId) ??
        null;
      if (cached) {
        deepLinkTaskHandledRef.current = taskId;
        await openTask(cached);
        return;
      }
      const response = await apiRequest<{ task: TaskItem }>(`/tasks/${taskId}`, { token });
      if (response.ok && response.data?.task) {
        deepLinkTaskHandledRef.current = taskId;
        await openTask(response.data.task);
      }
    })();
    // openTask is a function declaration in this component scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, hydratedSession, tasks, token]);

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
      job_title: String(profileResult.job_title ?? ""),
    });
    const avatarFromProfile = resolveMediaUrl(
      String(profileResult.avatar_url ?? profileResult.photo_url ?? profileResult.image_url ?? "") || null,
    );
    if (avatarFromProfile) {
      setProfileAvatarDataUrl(avatarFromProfile);
    }
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
      return;
    }
    let cancelled = false;
    const targetIds = taskTimeSummaryTargets.map((t) => t.id);
    (async () => {
      const resp = await apiRequest<{
        summaries?: Record<string, { total_seconds?: number; logs?: TimeLog[] }>;
      }>("/tasks/time-summaries", {
        method: "POST",
        token,
        body: { task_ids: targetIds },
      });
      if (cancelled) return;
      const fetchedAtMs = Date.now();
      if (!resp.ok) {
        const chunkSize = 6;
        for (let i = 0; i < targetIds.length; i += chunkSize) {
          if (cancelled) return;
          const chunk = targetIds.slice(i, i + chunkSize);
          const entries = await Promise.all(
            chunk.map(async (id) => {
              const one = await apiRequest<{ total_seconds: number; logs: TimeLog[] }>(
                `/tasks/${id}/time-summary`,
                { token },
              );
              if (!one.ok) return [id, null] as const;
              return [
                id,
                { total_seconds: one.data?.total_seconds ?? 0, logs: one.data?.logs ?? [] },
              ] as const;
            }),
          );
          if (cancelled) return;
          setTaskTimeSummaryByTaskId((prev) => {
            const next = { ...prev };
            for (const [id, data] of entries) {
              if (data) next[id] = { ...data, fetchedAtMs: Date.now() };
            }
            return next;
          });
        }
        return;
      }
      const summaries = resp.data?.summaries ?? {};
      setTaskTimeSummaryByTaskId((prev) => {
        const next = { ...prev };
        for (const id of targetIds) {
          const row = summaries[id];
          next[id] = {
            total_seconds: row?.total_seconds ?? 0,
            logs: row?.logs ?? [],
            fetchedAtMs,
          };
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
    selectedBoardIdRef.current = selectedBoardId;
  }, [selectedBoardId]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedBoardId) {
      localStorage.setItem(BOARD_STORAGE_KEY, selectedBoardId);
    } else {
      localStorage.removeItem(BOARD_STORAGE_KEY);
    }
  }, [selectedBoardId]);
  /** Na area Projetos / Areas de trabalho, board so faz sentido com projeto atual; senao sobrevive stale do LS/outras telas e a arvore destaca board errado. */
  useEffect(() => {
    if (activeKey !== "projects" && activeKey !== "workspaces") return;
    if (!selectedProjectId) {
      if (selectedBoardId) setSelectedBoardId(null);
      return;
    }
    if (!selectedWorkspaceId || !selectedPortfolioId) {
      if (selectedBoardId) setSelectedBoardId(null);
      return;
    }
    const boardRow = boards.find((b) => b.id === selectedBoardId);
    if (!boardRow || boardRow.project_id !== selectedProjectId) {
      const nextBoardId = resolveBoardSelection(boards, selectedBoardId, selectedProjectId);
      if (nextBoardId !== selectedBoardId) {
        setSelectedBoardId(nextBoardId);
      }
    }
  }, [
    activeKey,
    boards,
    selectedBoardId,
    selectedPortfolioId,
    selectedProjectId,
    selectedWorkspaceId,
  ]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedPortfolioId) {
      localStorage.setItem(SELECTED_PORTFOLIO_STORAGE_KEY, selectedPortfolioId);
    } else {
      localStorage.removeItem(SELECTED_PORTFOLIO_STORAGE_KEY);
    }
  }, [selectedPortfolioId]);
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
    localStorage.setItem(TASK_STATUS_FILTER_KEY, JSON.stringify(taskStatusFilter));
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
    >("/users?page=1&page_size=200&is_active=true", { method: "GET", token });
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
    if (activeKey !== "status-config" || !token || !isAdmin) return;
    queueMicrotask(() => {
      fetchStatusCatalog().catch(() => undefined);
    });
  }, [activeKey, fetchStatusCatalog, isAdmin, token]);
  useEffect(() => {
    if (activeKey !== "client-requests" || !token || !isAdmin) return;
    queueMicrotask(() => {
      void fetchClientRequestsList();
    });
  }, [activeKey, isAdmin, token]);
  useEffect(() => {
    if ((activeKey !== "dashboard" && activeKey !== "tasks") || !token || !isAdmin) return;
    queueMicrotask(() => {
      fetchAllTasks().catch(() => undefined);
      if (adminUsersCache.length === 0) fetchAdminUsers().catch(() => undefined);
      void fetchHoursDashboardData();
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

  async function markAllNotificationsAsRead() {
    const response = await apiRequest("/notifications/read-all", { method: "POST", token, body: {} });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao marcar todas como lidas.");
      return;
    }
    apiMessage.success("Todas as notificacoes foram marcadas como lidas.");
    await fetchNotifications();
  }

  async function openNotificationItem(item: NotificationItem) {
    if (!item.is_read) {
      await markNotificationAsRead(item.id);
    }
    const taskId = item.task_id ?? (item.metadata?.task_id ? String(item.metadata.task_id) : "");
    if (!taskId) {
      navigateTo("notifications");
      return;
    }
    // Mencao / comentario: abre a tarefa na aba Atualizacoes
    const focusTab: TaskDrawerTab =
      item.type === "task_mentioned" ||
      item.type === "task_commented" ||
      String(item.type).includes("mention")
        ? "comments"
        : "summary";
    const cached =
      tasks.find((task) => task.id === taskId) ??
      allTasks.find((task) => task.id === taskId);
    if (cached) {
      if (activeKey === "notifications") navigateTo("my-work");
      await openTask(cached, focusTab);
      return;
    }
    const response = await apiRequest<{ task: TaskItem }>(`/tasks/${taskId}`, { token });
    if (response.ok && response.data?.task) {
      if (activeKey === "notifications") navigateTo("my-work");
      await openTask(response.data.task, focusTab);
      return;
    }
    apiMessage.error("Nao foi possivel abrir a tarefa desta notificacao.");
  }

  async function toggleTaskWatch(taskId: string, watched: boolean) {
    const response = await apiRequest(`/tasks/${taskId}/watch`, {
      method: watched ? "DELETE" : "POST",
      token,
      body: {},
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao atualizar seguimento da tarefa.");
      return;
    }
    setWatchedTaskIds((prev) => {
      const next = new Set(prev);
      if (watched) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
    apiMessage.success(watched ? "Voce deixou de seguir a tarefa." : "Voce passou a seguir a tarefa.");
  }

  async function openTask(task: TaskItem, focusTab: TaskDrawerTab = "summary") {
    setSelectedTask(task);
    setTaskDrawerTab(focusTab);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#task/${task.id}`);
    }
    setTaskCommentReplyTo(null);
    setTaskCommentEditingId(null);
    setTaskCommentEditingContent("");
    setTaskCommentDraft("");
    setTaskCommentFiles([]);
    setTaskSubtasks([]);
    taskDetailsForm.setFieldsValue({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      effort_points: task.effort_points,
      assignee_id: task.assignee_id ?? undefined,
      start_date: toDateInputValue(task.start_date) || undefined,
      end_date: toDateInputValue(task.end_date) || undefined,
      is_recurring: Boolean(task.is_recurring),
      recurrence_frequency: task.recurrence_frequency || undefined,
    });
    void hydrateTaskAssigneePickList();
    void fetchNotificationSubscriptions();
    const [activityResp, summaryResp, groupsResp, commentsResp, subtasksResp] = await Promise.all([
      apiRequest<{ activities: TaskActivity[] }>(`/tasks/${task.id}/activity`, { token }),
      apiRequest<{ total_seconds: number; logs: TimeLog[] }>(`/tasks/${task.id}/time-summary`, { token }),
      apiRequest<{ groups: GroupItem[] }>(`/boards/${task.board_id}/groups`, { token }),
      apiRequest<{ comments: TaskCommentItem[] }>(`/tasks/${task.id}/comments`, { token }),
      task.parent_id
        ? Promise.resolve({ ok: true, status: 200, data: { tasks: [] as TaskItem[] } })
        : apiRequest<{ tasks: TaskItem[] }>(`/tasks?parent_id=${encodeURIComponent(task.id)}`, { token }),
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
    const loadedSubtasks = subtasksResp.data?.tasks ?? [];
    setTaskSubtasks(loadedSubtasks);
    if (!task.parent_id) {
      setSubtasksByParentId((prev) => ({ ...prev, [task.id]: loadedSubtasks }));
    }
    if (!activityResp.ok || !summaryResp.ok || !groupsResp.ok || !commentsResp.ok || !subtasksResp.ok) {
      const subtasksError =
        "error" in subtasksResp ? subtasksResp.error?.message : undefined;
      setGlobalError(
        activityResp.error?.message ??
          summaryResp.error?.message ??
          groupsResp.error?.message ??
          commentsResp.error?.message ??
          subtasksError ??
          "Falha ao carregar detalhes da tarefa.",
      );
    }
  }

  function applyUpdatedTaskLocally(updated: TaskItem) {
    const merge = (list: TaskItem[]) =>
      list.map((row) => (row.id === updated.id ? { ...row, ...updated } : row));
    setTasks((prev) => merge(prev));
    setAllTasks((prev) => merge(prev));
    setBoardListTasksByBoardId((prev) => {
      const next: Record<string, TaskItem[]> = { ...prev };
      for (const boardId of Object.keys(next)) {
        next[boardId] = merge(next[boardId] ?? []);
      }
      return next;
    });
    setBoardKanbanByBoardId((prev) => {
      const next: Record<string, KanbanGroup[]> = { ...prev };
      for (const boardId of Object.keys(next)) {
        next[boardId] = (next[boardId] ?? []).map((group) => ({
          ...group,
          tasks: merge(group.tasks),
        }));
      }
      return next;
    });
    setSubtasksByParentId((prev) => {
      const next: Record<string, TaskItem[]> = { ...prev };
      for (const parentId of Object.keys(next)) {
        next[parentId] = merge(next[parentId] ?? []);
      }
      return next;
    });
    setTaskSubtasks((prev) => merge(prev));
  }

  async function refreshTaskSubtasks(taskId: string) {
    setLoadingSubtasksParentId(taskId);
    try {
      const response = await apiRequest<{ tasks: TaskItem[] }>(
        `/tasks?parent_id=${encodeURIComponent(taskId)}`,
        { token },
      );
      if (!response.ok) {
        apiMessage.error(response.error?.message ?? "Falha ao carregar subtarefas.");
        return false;
      }
      const rows = response.data?.tasks ?? [];
      setSubtasksByParentId((prev) => ({ ...prev, [taskId]: rows }));
      if (selectedTask?.id === taskId) {
        setTaskSubtasks(rows);
      }
      return true;
    } finally {
      setLoadingSubtasksParentId(null);
    }
  }

  function openCreateSubtaskModal(parent: TaskItem) {
    if (parent.parent_id) {
      apiMessage.warning("Subtarefas nao podem ter subtarefas.");
      return;
    }
    setCreateSubtaskParent(parent);
    createSubtaskForm.setFieldsValue({
      title: "",
      description: "",
      priority: parent.priority || "medium",
      status: "todo",
      effort_points: 1,
      assignee_id: parent.assignee_id ?? undefined,
      start_date: toDateInputValue(parent.start_date) || undefined,
      end_date: toDateInputValue(parent.end_date) || undefined,
    });
    void hydrateTaskAssigneePickList();
    setCreateSubtaskOpen(true);
  }

  async function submitCreateSubtask(values: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    effort_points?: number;
    assignee_id?: number | null;
    start_date?: string | Date | null;
    end_date?: string | Date | null;
  }) {
    if (!createSubtaskParent) return;
    setSubtaskSaving(true);
    try {
      const response = await apiRequest<{ task: TaskItem }>("/tasks", {
        method: "POST",
        token,
        body: {
          parent_id: createSubtaskParent.id,
          title: values.title,
          description: values.description ?? "",
          status: values.status ?? "todo",
          priority: values.priority ?? createSubtaskParent.priority,
          effort_points: values.effort_points ?? 1,
          assignee_id: values.assignee_id ?? null,
          start_date: fromDateInputValue(values.start_date),
          end_date: fromDateInputValue(values.end_date),
        },
      });
      if (!response.ok) {
        apiMessage.error(response.error?.message ?? "Falha ao criar subtarefa.");
        return;
      }
      apiMessage.success("Subtarefa criada.");
      createSubtaskForm.resetFields();
      setCreateSubtaskOpen(false);
      const parentId = createSubtaskParent.id;
      const parentBoardId = createSubtaskParent.board_id;
      setCreateSubtaskParent(null);
      await refreshTaskSubtasks(parentId);
      setSelectedTask((prev) =>
        prev && prev.id === parentId ? { ...prev, subtasks_count: (prev.subtasks_count ?? 0) + 1 } : prev,
      );
      setBoardListTasksByBoardId((prev) => {
        const next = { ...prev };
        for (const [boardId, rows] of Object.entries(next)) {
          next[boardId] = rows.map((task) =>
            task.id === parentId ? { ...task, subtasks_count: (task.subtasks_count ?? 0) + 1 } : task,
          );
        }
        return next;
      });
      setExpandedTaskKeysByBoardId((prev) => {
        const current = prev[parentBoardId] ?? [];
        if (current.map(String).includes(parentId)) return prev;
        return { ...prev, [parentBoardId]: [...current, parentId] };
      });
      await fetchTasks();
      await refreshBoardViewsForProject(selectedProjectId);
    } finally {
      setSubtaskSaving(false);
    }
  }

  function nestedSubtasksForParent(parentId: string, onlyMine: boolean) {
    const rows = subtasksByParentId[parentId] ?? [];
    if (!onlyMine || currentUserId == null) return rows;
    return rows.filter((task) => Number(task.assignee_id) === Number(currentUserId));
  }

  function renderExpandableSubtasks(record: TaskItem, onlyMine: boolean) {
    const nested = nestedSubtasksForParent(record.id, onlyMine);
    const nestedLoading = loadingSubtasksParentId === record.id;
    return (
      <div
        style={{
          margin: "4px 0 8px 12px",
          padding: "10px 12px",
          borderLeft: "3px solid #d9d9d9",
          background: "#fafafa",
          borderRadius: 8,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
          Subtarefas de {record.title}
          {onlyMine ? " (somente as suas)" : ""}
        </Typography.Text>
        <Spin spinning={nestedLoading}>
          <Table<TaskItem>
            rowKey="id"
            size="small"
            pagination={false}
            locale={{ emptyText: onlyMine ? "Nenhuma subtarefa atribuida a voce." : "Nenhuma subtarefa ainda." }}
            dataSource={nested}
            onRow={(subtask) => ({
              onClick: () => void openTask(subtask),
              style: { cursor: "pointer" },
            })}
            columns={[
              { title: "Subtarefa", dataIndex: "title", ellipsis: true },
              assigneeColumn,
              {
                title: "Status",
                dataIndex: "status",
                width: 120,
                render: (value: string) => renderStatusTag(value),
              },
              {
                title: "Prioridade",
                dataIndex: "priority",
                width: 120,
                render: (value: string) => renderPriorityTag(value),
              },
              {
                title: "Prazo",
                dataIndex: "end_date",
                width: 140,
                render: (value: string | null) => formatDateOnly(value),
              },
              {
                title: "Acoes",
                width: 180,
                render: (subtask: TaskItem) => (
                  <Space size="small" onClick={(event) => event.stopPropagation()}>
                    <TipButton
                      tip={HELP_TIPS.editar}
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openTask(subtask).catch(() => undefined)}
                    >
                      Editar
                    </TipButton>
                    <TipButton
                      tip={HELP_TIPS.excluir}
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        openDeleteConfirmModal({
                          title: "Excluir esta subtarefa?",
                          onConfirm: async () => {
                            const ok = await deleteTaskById(subtask.id);
                            if (!ok) throw new Error("subtask_delete_failed");
                            await refreshTaskSubtasks(record.id);
                          },
                        })
                      }
                    >
                      Excluir
                    </TipButton>
                  </Space>
                ),
              },
            ]}
          />
        </Spin>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          style={{ marginTop: 10 }}
          onClick={() => openCreateSubtaskModal(record)}
        >
          Adicionar subtarefa
        </Button>
      </div>
    );
  }

  async function taskAction(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    if (!selectedTask) return;
    const response = await apiRequest<{ task?: TaskItem }>(path, { method, token, body });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha na acao da tarefa.");
      setGlobalError(response.error?.message ?? "Falha na acao da tarefa.");
      return;
    }
    setGlobalError(null);
    apiMessage.success("Acao executada com sucesso.");
    const updatedFromApi = response.data?.task;
    const nextTask: TaskItem = updatedFromApi
      ? { ...selectedTask, ...updatedFromApi }
      : selectedTask;
    if (updatedFromApi) {
      applyUpdatedTaskLocally(nextTask);
      setSelectedTask(nextTask);
      taskDetailsForm.setFieldsValue({
        title: nextTask.title,
        description: nextTask.description ?? "",
        status: nextTask.status,
        priority: nextTask.priority,
        effort_points: nextTask.effort_points,
        assignee_id: nextTask.assignee_id ?? undefined,
        start_date: toDateInputValue(nextTask.start_date) || undefined,
        end_date: toDateInputValue(nextTask.end_date) || undefined,
        is_recurring: Boolean(nextTask.is_recurring),
        recurrence_frequency: nextTask.recurrence_frequency || undefined,
      });
    }
    await fetchTasks();
    if (isAdmin) {
      await fetchAllTasks().catch(() => undefined);
    }
    const projectId =
      selectedProjectId ??
      boards.find((board) => board.id === nextTask.board_id)?.project_id ??
      null;
    await refreshBoardViewsForProject(projectId);
    await openTask(nextTask, taskDrawerTab);
  }

  async function refreshTaskTimeSummary(taskId: string) {
    const response = await apiRequest<{ total_seconds: number; logs: TimeLog[] }>(
      `/tasks/${taskId}/time-summary`,
      { token },
    );
    if (!response.ok) return false;
    const nowTick = Date.now();
    const total = response.data?.total_seconds ?? 0;
    const logs = response.data?.logs ?? [];
    setTaskTimeSummaryByTaskId((prev) => ({
      ...prev,
      [taskId]: { total_seconds: total, logs, fetchedAtMs: nowTick },
    }));
    if (selectedTask?.id === taskId) {
      setTaskSummary({ total_seconds: total, logs });
      setTaskSummaryFetchedAtMs(nowTick);
      setLiveTickMs(nowTick);
    }
    return true;
  }

  async function quickTaskTimeAction(task: TaskItem, action: "start" | "pause" | "resume") {
    const response = await apiRequest(`/tasks/${task.id}/time/${action}`, {
      method: "POST",
      token,
      body: {},
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha na acao de tempo.");
      return;
    }
    await refreshTaskTimeSummary(task.id);
  }

  async function submitManualTimeLog(values: {
    started_at?: string;
    ended_at?: string;
  }) {
    if (!selectedTask) return;
    const startedAt = fromDatetimeLocalValue(values.started_at);
    const endedAt = fromDatetimeLocalValue(values.ended_at);
    if (!startedAt || !endedAt) {
      apiMessage.error("Informe data/hora de inicio e fim.");
      return;
    }
    const response = await apiRequest(`/tasks/${selectedTask.id}/time/manual`, {
      method: "POST",
      token,
      body: { started_at: startedAt, ended_at: endedAt },
    });
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao adicionar sessao manual.");
      return;
    }
    apiMessage.success("Sessao manual adicionada.");
    setManualTimeModalOpen(false);
    manualTimeForm.resetFields();
    await refreshTaskTimeSummary(selectedTask.id);
  }

  const mentionOptions = useMemo(() => {
    const byUsername = new Map<string, { username: string; name: string; avatar_url?: string | null }>();
    const push = (u: { username?: string; name?: string; email?: string; avatar_url?: string | null }) => {
      const username = String(u.username ?? "").trim();
      if (!username) return;
      const key = username.toLowerCase();
      if (byUsername.has(key)) return;
      byUsername.set(key, {
        username,
        name: String(u.name || u.email || username),
        avatar_url: u.avatar_url ?? null,
      });
    };
    taskAssigneePickList.forEach(push);
    adminUsersCache.forEach((u) =>
      push({
        username: (u.email || "").split("@")[0] || `user${u.id}`,
        name: u.name,
        email: u.email,
        avatar_url: null,
      }),
    );
    return Array.from(byUsername.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({
        value: u.username,
        label: (
          <Space size={8}>
            <Avatar size="small" src={resolveMediaUrl(u.avatar_url) || undefined}>
              {(u.name.trim()[0] || "?").toUpperCase()}
            </Avatar>
            <span>
              {u.name} <Typography.Text type="secondary">@{u.username}</Typography.Text>
            </span>
          </Space>
        ),
      }));
  }, [adminUsersCache, taskAssigneePickList]);

  const mondayMentionOptions: MondayMentionOption[] = useMemo(() => {
    const byUsername = new Map<string, MondayMentionOption>();
    const push = (u: { username?: string; name?: string; email?: string }) => {
      const username = String(u.username ?? "").trim();
      if (!username) return;
      const key = username.toLowerCase();
      if (byUsername.has(key)) return;
      byUsername.set(key, {
        id: username,
        label: String(u.name || u.email || username),
      });
    };
    taskAssigneePickList.forEach(push);
    adminUsersCache.forEach((u) =>
      push({
        username: (u.email || "").split("@")[0] || `user${u.id}`,
        name: u.name,
        email: u.email,
      }),
    );
    return Array.from(byUsername.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [adminUsersCache, taskAssigneePickList]);

  const commentDraftKey =
    selectedTask && currentUserId != null
      ? `bb_comment_draft:${currentUserId}:${selectedTask.id}`
      : undefined;
  const descriptionDraftKey =
    selectedTask && currentUserId != null
      ? `bb_desc_draft:${currentUserId}:${selectedTask.id}`
      : undefined;

  async function uploadImageForComposer(file: File): Promise<string | null> {
    if (!selectedTask) return null;
    const formData = new FormData();
    formData.append("file", file);
    const uploadResp = await apiRequest<{ attachment?: { url?: string; file_url?: string; filename?: string } }>(
      `/tasks/${selectedTask.id}/attachments`,
      { method: "POST", token, body: formData },
    );
    if (!uploadResp.ok) {
      apiMessage.error(uploadResp.error?.message ?? `Falha ao enviar ${file.name}.`);
      return null;
    }
    const rawUrl =
      uploadResp.data?.attachment?.url ||
      uploadResp.data?.attachment?.file_url ||
      null;
    return toStoredMediaPath(rawUrl) || rawUrl;
  }

  async function saveTaskDrawerFields(values: Record<string, unknown>) {
    if (!selectedTask) return;
    const startIso = fromDateInputValue(values.start_date as string | null | undefined);
    const endIso = fromDateInputValue(values.end_date as string | null | undefined);
    if (startIso && endIso && new Date(startIso).getTime() > new Date(endIso).getTime()) {
      apiMessage.error("Prazo de inicio deve ser anterior ou igual ao prazo final.");
      return;
    }
    const nextStatus = String(values.status ?? selectedTask.status);
    await taskAction(`/tasks/${selectedTask.id}`, "PATCH", {
      title: values.title,
      description: values.description ?? "",
      priority: values.priority,
      effort_points:
        values.effort_points === undefined || values.effort_points === null
          ? selectedTask.effort_points
          : Number(values.effort_points),
      assignee_id:
        values.assignee_id === undefined || values.assignee_id === null || values.assignee_id === ""
          ? null
          : Number(values.assignee_id),
      start_date: startIso,
      end_date: endIso,
      is_recurring: Boolean(values.is_recurring),
      recurrence_frequency: values.is_recurring ? String(values.recurrence_frequency ?? "") : "",
    });
    if (nextStatus && nextStatus !== selectedTask.status) {
      await taskAction(`/tasks/${selectedTask.id}/status`, "PATCH", { status: nextStatus });
    }
    clearComposerDraft(descriptionDraftKey);
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

  async function uploadCommentAttachments(taskId: string, commentId: string, files: UploadFile[]) {
    for (const item of files) {
      const blob = item.originFileObj;
      if (!blob) continue;
      const formData = new FormData();
      formData.append("file", blob as File);
      formData.append("comment_id", commentId);
      const uploadResp = await apiRequest(`/tasks/${taskId}/attachments`, {
        method: "POST",
        token,
        body: formData,
      });
      if (!uploadResp.ok) {
        apiMessage.error(uploadResp.error?.message ?? `Falha ao enviar ${item.name || "anexo"}.`);
      }
    }
  }

  async function createTaskComment(taskId: string, rawContent: string): Promise<boolean> {
    if (commentMutationInFlightRef.current) return false;
    const content = isEmptyRichHtml(rawContent)
      ? taskCommentFiles.length > 0
        ? "Anexo(s)"
        : ""
      : rawContent.trim();
    if (!content) return false;
    commentMutationInFlightRef.current = true;
    try {
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
        return false;
      }
      const commentId = response.data?.comment?.id;
      if (commentId && taskCommentFiles.length > 0) {
        await uploadCommentAttachments(taskId, commentId, taskCommentFiles);
      }
      clearComposerDraft(commentDraftKey);
      setTaskCommentDraft("");
      setTaskCommentFiles([]);
      setTaskCommentReplyTo(null);
      await refreshTaskComments(taskId);
      apiMessage.success("Atualizacao registrada.");
      return true;
    } finally {
      commentMutationInFlightRef.current = false;
    }
  }
  async function updateTaskComment(taskId: string, commentId: string, rawContent: string): Promise<boolean> {
    if (commentMutationInFlightRef.current) return false;
    const content = isEmptyRichHtml(rawContent) ? "" : rawContent.trim();
    if (!content) return false;
    commentMutationInFlightRef.current = true;
    try {
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
        return false;
      }
      setTaskCommentEditingId(null);
      setTaskCommentEditingContent("");
      await refreshTaskComments(taskId);
      apiMessage.success("Comentario atualizado.");
      return true;
    } finally {
      commentMutationInFlightRef.current = false;
    }
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

  function selectAccessibleProject(projectId: string) {
    const project = projects.find((row) => String(row.id) === projectId);
    if (!project) return;
    const portfolioId = String(project.portfolio_id ?? "");
    const portfolio = portfolios.find((item) => String(item.id) === portfolioId);
    const workspaceId = portfolio ? String(portfolio.workspace_id ?? "") : "";
    if (workspaceId) setSelectedWorkspaceId(workspaceId);
    if (portfolioId) setSelectedPortfolioId(portfolioId);
    if (project.client_id) setSelectedClientId(String(project.client_id));
    setSelectedProjectId(projectId);
    const firstBoard = boardsForProject(projectId)[0]?.id ?? null;
    setSelectedBoardId(firstBoard);
  }

  function buildRequestDescription(row: Record<string, unknown>) {
    const base = String(row.description ?? "").trim();
    const clientName = String(row.client_name ?? "").trim();
    const contactName = String(row.contact_name ?? "").trim();
    const contactEmail = String(row.contact_email ?? "").trim();
    const contactPhone = String(row.contact_phone ?? "").trim();
    const requester = [contactName, contactEmail, contactPhone].filter(Boolean).join(" · ") || "-";
    const meta = [`Pedido cliente: ${clientName || "-"}`, `Solicitante: ${requester}`].join("\n");
    return base ? `${base}\n\n${meta}` : meta;
  }

  function matchClientIdByName(clientName: string): string | undefined {
    const needle = clientName.trim().toLowerCase();
    if (!needle) return undefined;
    const exact = clients.find((c) => String(c.name ?? "").trim().toLowerCase() === needle);
    if (exact?.id) return String(exact.id);
    const partial = clients.find((c) => String(c.name ?? "").trim().toLowerCase().includes(needle));
    return partial?.id ? String(partial.id) : undefined;
  }

  async function openConvertRequestModal(row: Record<string, unknown>) {
    setConvertRequestModal(row);
    convertRequestForm.resetFields();
    void hydrateTaskAssigneePickList();
    const matchedClientId = matchClientIdByName(String(row.client_name ?? ""));
    const projectForClient = matchedClientId
      ? projects.find((p) => String(p.client_id ?? "") === matchedClientId)
      : undefined;
    convertRequestForm.setFieldsValue({
      title: String(row.title ?? ""),
      description: buildRequestDescription(row),
      client_id: matchedClientId,
      project_id: projectForClient ? String(projectForClient.id) : undefined,
      priority: "medium",
      status: "todo",
      effort_points: 1,
    });
    if (projectForClient?.id) {
      await loadConvertBoardsForProject(String(projectForClient.id));
    } else {
      setConvertBoardOptions([]);
      setConvertGroupOptions([]);
    }
  }

  async function loadConvertBoardsForProject(projectId: string) {
    const projectBoards = boards.filter((b) => String(b.project_id ?? "") === String(projectId));
    const options = projectBoards.map((b) => ({
      value: String(b.id),
      label: String(b.name ?? b.id),
    }));
    setConvertBoardOptions(options);
    setConvertGroupOptions([]);
    convertRequestForm.setFieldsValue({ board_id: undefined, group_id: undefined });
    if (options[0]) {
      convertRequestForm.setFieldsValue({ board_id: options[0].value });
      await loadConvertGroupsForBoard(options[0].value);
    }
  }

  async function loadConvertGroupsForBoard(boardId: string) {
    const options = await ensureDefaultGroupForBoard(boardId);
    setConvertGroupOptions(options);
    convertRequestForm.setFieldsValue({
      group_id: options[0]?.value,
    });
  }

  async function fetchClientRequestsList() {
    setClientRequestsLoading(true);
    const response = await apiRequest<{ client_requests?: Record<string, unknown>[]; requests?: Record<string, unknown>[] }>(
      "/client-requests",
      { token },
    );
    setClientRequestsLoading(false);
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao carregar pedidos.");
      return;
    }
    const rows = response.data?.client_requests ?? response.data?.requests ?? [];
    setClientRequests(Array.isArray(rows) ? rows : []);
  }

  async function fetchHoursDashboardData(
    clientId = hoursClientFilter,
    projectId = hoursProjectFilter,
    userId = hoursUserFilter,
    period = hoursPeriodFilter,
    dateFrom = hoursDateFrom,
    dateTo = hoursDateTo,
    userRole = hoursUserRoleFilter,
  ) {
    setHoursDashboardLoading(true);
    const params = new URLSearchParams();
    if (clientId) params.set("client_id", clientId);
    if (projectId) params.set("project_id", projectId);
    if (userId) params.set("user_id", userId);
    if (period && period !== "all") params.set("period", period);
    if (period === "custom") {
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
    }
    if (userRole && userRole !== "all") params.set("user_role", userRole);
    const query = params.toString();
    const response = await apiRequest<Record<string, unknown>>(
      `/admin/hours-dashboard${query ? `?${query}` : ""}`,
      { token },
    );
    setHoursDashboardLoading(false);
    if (!response.ok) {
      apiMessage.error(response.error?.message ?? "Falha ao carregar dashboard de horas.");
      return;
    }
    setHoursDashboard(response.data ?? null);
    setHoursDetailCollaborator(null);
  }

  function clearHoursFilters() {
    setHoursUserFilter("");
    setHoursUserRoleFilter("all");
    setHoursClientFilter("");
    setHoursProjectFilter("");
    setHoursPeriodFilter("this_week");
    setHoursDateFrom("");
    setHoursDateTo("");
    setHoursDetailCollaborator(null);
    void fetchHoursDashboardData("", "", "", "this_week", "", "", "all");
  }

  async function copyTaskDeepLink(taskId: string) {
    const hash = `#task/${taskId}`;
    const url = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}${hash}` : hash;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", hash);
    }
    try {
      await navigator.clipboard.writeText(url);
      apiMessage.success("Link copiado.");
    } catch {
      apiMessage.info(`Link: ${url}`);
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
    if (isAdmin) await fetchAllTasks().catch(() => undefined);
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
    whatsNewCheckedRef.current = false;
    setWhatsNewOpen(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(REFRESH_STORAGE_KEY);
    localStorage.removeItem(BOARD_STORAGE_KEY);
    localStorage.removeItem(TASK_STATUS_FILTER_KEY);
    localStorage.removeItem(TASK_SEARCH_FILTER_KEY);
    localStorage.removeItem(SELECTED_WORKSPACE_STORAGE_KEY);
    localStorage.removeItem(SELECTED_PORTFOLIO_STORAGE_KEY);
    localStorage.removeItem(SELECTED_CLIENT_STORAGE_KEY);
    localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    localStorage.removeItem(PROJECT_SIDEBAR_EXPANDED_KEY);
    localStorage.removeItem(DEFAULT_PORTFOLIO_STORAGE_KEY);
    localStorage.removeItem(ADMIN_USERS_STORAGE_KEY);
    localStorage.removeItem(ADMIN_USER_META_STORAGE_KEY);
    setMeWorkspaceAccess(null);
    setSelectedTask(null);
    setTaskDrawerTab("summary");
    setNotifications([]);
    setTasks([]);
    setAllTasks([]);
    setWorkspaces([]);
    setClients([]);
    setProjects([]);
    setContracts([]);
    setPortfolios([]);
    setBoards([]);
    setBoardGroupsIndex({});
    setBoardKanbanByBoardId({});
    setGlobalError(null);
    setActiveKey("dashboard");
  }

  useEffect(() => {
    if (!token || activeKey !== "stats" || !isAdmin) return;
    void fetchHoursDashboardData();
  }, [activeKey, isAdmin, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnauthorized = () => {
      apiMessage.error("Autenticacao necessaria. Entre novamente.");
      handleLogout();
    };
    window.addEventListener("bb:unauthorized", onUnauthorized);
    return () => window.removeEventListener("bb:unauthorized", onUnauthorized);
  }, [apiMessage, handleLogout]);

  useEffect(() => {
    if (token) return;
    if (typeof window === "undefined") return;
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [token]);

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
            setSelectedPortfolioId(null);
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
    if (node.type === "portfolio") {
      if (action === "rename") {
        openTextInputModal({
          title: "Renomear portfolio",
          initialValue: node.title,
          placeholder: "Novo nome do portfolio",
          onSubmit: async (nextName) => {
            const response = await apiRequest(`/portfolios/${id}`, {
              method: "PATCH",
              token,
              body: { name: nextName },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao renomear portfolio.");
              throw new Error("portfolio_rename_failed");
            }
            apiMessage.success("Portfolio atualizado.");
            await fetchCrudData();
          },
        });
        return;
      }
      openDeleteConfirmModal({
        title: `Excluir o portfolio "${node.title}"?`,
        onConfirm: async () => {
          const response = await apiRequest(`/portfolios/${id}`, { method: "DELETE", token });
          if (!response.ok) {
            apiMessage.error(response.error?.message ?? "Falha ao excluir portfolio.");
            throw new Error("portfolio_delete_failed");
          }
          apiMessage.success("Portfolio excluido.");
          if (selectedPortfolioId === id) {
            setSelectedPortfolioId(null);
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
        if (isSuperuser) await fetchAudit();
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
      <WhatsNewModal
        open={whatsNewOpen}
        onClose={() => {
          const userKey = String(currentUserId ?? getUserIdFromToken(token) ?? "session");
          markWhatsNewSeen(userKey, APP_WHATS_NEW_VERSION);
          setWhatsNewOpen(false);
        }}
      />
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
      <Layout style={{ minHeight: "100vh", background: antToken.colorBgLayout }}>
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
        <Layout style={{ background: antToken.colorBgLayout }}>
          <Header
            style={{
              background: antToken.colorBgContainer,
              borderBottom: `1px solid ${antToken.colorBorderSecondary}`,
              color: antToken.colorText,
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
              <Typography.Title
                level={4}
                style={{ margin: 0, flex: 1, minWidth: 0, color: antToken.colorText }}
                ellipsis
              >
                {brandingConfig.app_name}
              </Typography.Title>
            </Space>
            <Space>
              <HelpTip title={HELP_TIPS.notificacoes}>
                <Dropdown
                  trigger={["click"]}
                  popupRender={() => (
                    <Card size="small" style={{ width: 360 }} title="Notificacoes recentes">
                      <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                        {notifications.slice(0, 5).length === 0 ? (
                          <Typography.Text type="secondary">Nenhuma notificacao.</Typography.Text>
                        ) : (
                          notifications.slice(0, 5).map((item) => (
                            <Button
                              key={item.id}
                              type="text"
                              block
                              style={{ height: "auto", textAlign: "left", whiteSpace: "normal" }}
                              onClick={() => void openNotificationItem(item)}
                            >
                              <Space orientation="vertical" size={0} style={{ width: "100%" }}>
                                <Typography.Text strong={!item.is_read}>{item.title}</Typography.Text>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  {NOTIFICATION_EVENT_LABELS[item.type] ?? item.type}
                                </Typography.Text>
                              </Space>
                            </Button>
                          ))
                        )}
                        <Space wrap>
                          <HelpTip title={HELP_TIPS.verTodasNotificacoes}>
                            <Button size="small" onClick={() => navigateTo("notifications")}>
                              Ver todas
                            </Button>
                          </HelpTip>
                          {unreadCount > 0 ? (
                            <HelpTip title={HELP_TIPS.marcarTodasLidas}>
                              <Button size="small" onClick={() => void markAllNotificationsAsRead()}>
                                Marcar todas lidas
                              </Button>
                            </HelpTip>
                          ) : null}
                        </Space>
                      </Space>
                    </Card>
                  )}
                >
                  <Button type="text" aria-label="Abrir notificacoes" icon={<BellOutlined />}>
                    {unreadCount > 0 ? `(${unreadCount})` : ""}
                  </Button>
                </Dropdown>
              </HelpTip>
              <HelpTip title={HELP_TIPS.conta}>
                <Dropdown menu={{ items: accountMenuItems }} trigger={["click"]} placement="bottomRight">
                  <Button type="text" aria-label="Abrir menu da conta" icon={<UserOutlined />}>
                    Conta
                  </Button>
                </Dropdown>
              </HelpTip>
            </Space>
          </Header>
          <Content
            id="conteudo-principal"
            tabIndex={-1}
            style={{ padding: isCompactNav ? 12 : 24, background: antToken.colorBgLayout }}
          >
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
                {activeKey === "dashboard" && !isAdmin && (
                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={8}>
                        <Card title="Horas trabalhadas">
                          <Space orientation="vertical" size={4}>
                            <Typography.Text>Hoje: {decimalHoursToHmText(collaboratorDashboardHours.today)}</Typography.Text>
                            <Typography.Text>Semana: {decimalHoursToHmText(collaboratorDashboardHours.week)}</Typography.Text>
                            <Typography.Text>Mes: {decimalHoursToHmText(collaboratorDashboardHours.month)}</Typography.Text>
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
                      <Card
                        title="Minhas tarefas (acoes rapidas)"
                        extra={
                          <TipButton
                            tip={HELP_TIPS.limparFiltros}
                            onClick={() => {
                              setMyWorkPeriodFilter("all");
                              setMyWorkDateFrom("");
                              setMyWorkDateTo("");
                              setMyWorkStatusFilter([]);
                              setMyWorkStatusFilterMode("include");
                              setMyWorkPriorityFilter([]);
                              setMyWorkPriorityFilterMode("include");
                              setMyWorkDeadlineFilter([]);
                              setMyWorkDeadlineFilterMode("include");
                              setMyWorkClientFilter([]);
                              setMyWorkClientFilterMode("include");
                              setMyWorkProjectFilter([]);
                              setMyWorkProjectFilterMode("include");
                              setMyWorkTablePage(1);
                            }}
                          >
                            Limpar filtros
                          </TipButton>
                        }
                      >
                        <Space wrap style={{ marginBottom: 12 }}>
                          <TipSelect
                            tip={HELP_TIPS.filterPeriodo}
                            value={myWorkPeriodFilter}
                            onChange={setMyWorkPeriodFilter}
                            style={{ minWidth: 200 }}
                            options={[
                              { value: "all", label: `Todos os periodos (${tasks.filter((t) => t.status !== "done").length})` },
                              { value: "today", label: `Hoje (${myWorkGrouped.today.length})` },
                              { value: "week", label: `Esta semana seg-sex (${myWorkGrouped.week.length})` },
                              { value: "overdue", label: `Atrasado (${myWorkGrouped.overdue.length})` },
                              { value: "no_due", label: `Sem prazo (${myWorkGrouped.noDue.length})` },
                            ]}
                          />
                          <Input
                            type="date"
                            value={myWorkDateFrom}
                            onChange={(event) => setMyWorkDateFrom(event.target.value)}
                            style={{ width: 150 }}
                            aria-label="Prazo de"
                            title="De (prazo)"
                          />
                          <Typography.Text type="secondary">ate</Typography.Text>
                          <Input
                            type="date"
                            value={myWorkDateTo}
                            onChange={(event) => setMyWorkDateTo(event.target.value)}
                            style={{ width: 150 }}
                            aria-label="Prazo ate"
                            title="Ate (prazo)"
                          />
                          {(myWorkDateFrom || myWorkDateTo) && (
                            <Button
                              size="small"
                              onClick={() => {
                                setMyWorkDateFrom("");
                                setMyWorkDateTo("");
                              }}
                            >
                              Limpar datas
                            </Button>
                          )}
                          <Space.Compact>
                            <Select
                              value={myWorkStatusFilterMode}
                              onChange={setMyWorkStatusFilterMode}
                              style={{ width: 100 }}
                              options={filterModeOptions}
                            />
                            <Select
                              mode="multiple"
                              allowClear
                              maxTagCount="responsive"
                              placeholder={
                                myWorkStatusFilterMode === "exclude" ? "Status a excluir" : "Status"
                              }
                              value={myWorkStatusFilter}
                              onChange={(value) => setMyWorkStatusFilter(value)}
                              style={{ minWidth: 200 }}
                              options={statusOptions}
                            />
                          </Space.Compact>
                          <Space.Compact>
                            <Select
                              value={myWorkPriorityFilterMode}
                              onChange={setMyWorkPriorityFilterMode}
                              style={{ width: 100 }}
                              options={filterModeOptions}
                            />
                            <Select
                              mode="multiple"
                              allowClear
                              maxTagCount="responsive"
                              placeholder={
                                myWorkPriorityFilterMode === "exclude"
                                  ? "Prioridades a excluir"
                                  : "Prioridades"
                              }
                              value={myWorkPriorityFilter}
                              onChange={setMyWorkPriorityFilter}
                              style={{ minWidth: 180 }}
                              options={[
                                { value: "low", label: "Baixa" },
                                { value: "medium", label: "Média" },
                                { value: "high", label: "Alta" },
                                { value: "critical", label: "Crítica" },
                              ]}
                            />
                          </Space.Compact>
                          <Space.Compact>
                            <Select
                              value={myWorkDeadlineFilterMode}
                              onChange={setMyWorkDeadlineFilterMode}
                              style={{ width: 100 }}
                              options={filterModeOptions}
                            />
                            <Select
                              mode="multiple"
                              allowClear
                              maxTagCount="responsive"
                              placeholder={
                                myWorkDeadlineFilterMode === "exclude" ? "Prazos a excluir" : "Prazos"
                              }
                              value={myWorkDeadlineFilter}
                              onChange={setMyWorkDeadlineFilter}
                              style={{ minWidth: 190 }}
                              options={[
                                { value: "due_7", label: "Vence em 7 dias" },
                                { value: "overdue", label: "Atrasadas" },
                                { value: "no_due", label: "Sem prazo" },
                              ]}
                            />
                          </Space.Compact>
                          <Space.Compact>
                            <Select
                              value={myWorkClientFilterMode}
                              onChange={setMyWorkClientFilterMode}
                              style={{ width: 100 }}
                              options={filterModeOptions}
                            />
                            <Select
                              mode="multiple"
                              allowClear
                              maxTagCount="responsive"
                              placeholder={
                                myWorkClientFilterMode === "exclude" ? "Clientes a excluir" : "Clientes"
                              }
                              value={myWorkClientFilter}
                              onChange={setMyWorkClientFilter}
                              style={{ minWidth: 180 }}
                              showSearch
                              optionFilterProp="label"
                              options={clients.map((c) => ({
                                value: String(c.id),
                                label: String(c.name ?? c.id),
                              }))}
                            />
                          </Space.Compact>
                          <Space.Compact>
                            <Select
                              value={myWorkProjectFilterMode}
                              onChange={setMyWorkProjectFilterMode}
                              style={{ width: 100 }}
                              options={filterModeOptions}
                            />
                            <Select
                              mode="multiple"
                              allowClear
                              maxTagCount="responsive"
                              placeholder={
                                myWorkProjectFilterMode === "exclude" ? "Projetos a excluir" : "Projetos"
                              }
                              value={myWorkProjectFilter}
                              onChange={setMyWorkProjectFilter}
                              style={{ minWidth: 180 }}
                              showSearch
                              optionFilterProp="label"
                              options={projects.map((p) => ({
                                value: String(p.id),
                                label: String(p.name ?? p.id),
                              }))}
                            />
                          </Space.Compact>
                        </Space>
                        <Table<MyWorkTaskRow>
                          rowKey="id"
                          size="small"
                          className="bb-compact-table"
                          dataSource={myWorkFilteredTasks}
                          pagination={{
                            pageSize: TASK_TABLE_PAGE_SIZE,
                            current: myWorkTablePage,
                            onChange: (page) => setMyWorkTablePage(page),
                          }}
                          expandable={{
                            expandedRowKeys: expandedMyWorkTaskKeys,
                            onExpand: (expanded, record) => {
                              setExpandedMyWorkTaskKeys((prev) =>
                                expanded
                                  ? Array.from(new Set([...prev, record.id]))
                                  : prev.filter((key) => key !== record.id),
                              );
                            },
                            // Subtarefas atribuidas a voce vem em `children` (arvore da tabela).
                            rowExpandable: (record) => Boolean(record.children && record.children.length > 0),
                          }}
                          onRow={(record) => ({
                            onClick: () => openTask(record),
                            style: { cursor: "pointer" },
                          })}
                          columns={[
                            {
                              title: "Titulo",
                              dataIndex: "title",
                              width: 320,
                              ellipsis: true,
                              sorter: (a, b) => a.title.localeCompare(b.title),
                              render: (value: string, record: MyWorkTaskRow) => renderTaskTitleCell(value, record),
                            },
                            {
                              ...assigneeColumn,
                              sorter: (a: TaskItem, b: TaskItem) =>
                                String(a.assignee_name ?? a.assignee_id ?? "").localeCompare(
                                  String(b.assignee_name ?? b.assignee_id ?? ""),
                                ),
                            },
                            {
                              title: "Projeto",
                              sorter: (a, b) => taskContext(a).projectLabel.localeCompare(taskContext(b).projectLabel),
                              render: (record: TaskItem) => taskContext(record).projectLabel,
                            },
                            {
                              title: "Cliente",
                              sorter: (a, b) => taskContext(a).clientLabel.localeCompare(taskContext(b).clientLabel),
                              render: (record: TaskItem) => taskContext(record).clientLabel,
                            },
                            {
                              title: "Prioridade",
                              dataIndex: "priority",
                              sorter: (a, b) => a.priority.localeCompare(b.priority),
                              render: (v: string) => renderPriorityTag(v),
                            },
                            {
                              title: "Status",
                              dataIndex: "status",
                              sorter: (a, b) => a.status.localeCompare(b.status),
                              render: (_: string, record: TaskItem) => renderEditableStatusTag(record),
                            },
                            {
                              title: "Prazo inicio",
                              dataIndex: "start_date",
                              sorter: (a, b) => new Date(a.start_date ?? 0).getTime() - new Date(b.start_date ?? 0).getTime(),
                              render: (v: string | null) => formatDateOnly(v),
                            },
                            {
                              title: "Prazo fim",
                              dataIndex: "end_date",
                              defaultSortOrder: "ascend",
                              sorter: compareTaskEndDateAsc,
                              render: (v: string | null) => formatDateOnly(v),
                            },
                            {
                              title: "Tempo",
                              render: (record: TaskItem) => {
                                const row = taskTimeSummaryByTaskId[record.id];
                                if (!row) {
                                  return <Typography.Text type="secondary">—</Typography.Text>;
                                }
                                const now = taskTimeTickMs || Date.now();
                                const display = liveTotalSecondsFromSummary(
                                  row.total_seconds,
                                  row.logs,
                                  row.fetchedAtMs,
                                  now,
                                  currentUserId,
                                );
                                const active =
                                  resolveControllableTimeLog(row.logs, "active", currentUserId, isAdmin) != null;
                                return (
                                  <Space
                                    size={4}
                                    style={{ whiteSpace: "nowrap", flexWrap: "nowrap" }}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <Typography.Text style={{ whiteSpace: "nowrap" }}>
                                      {secondsToText(display)}
                                    </Typography.Text>
                                    {active ? <Tag color="processing" style={{ marginInlineEnd: 0 }}>Contando</Tag> : null}
                                  </Space>
                                );
                              },
                            },
                            {
                              title: "Acoes",
                              render: (record: TaskItem) => {
                                const row = taskTimeSummaryByTaskId[record.id];
                                const active =
                                  row != null &&
                                  resolveControllableTimeLog(row.logs, "active", currentUserId, isAdmin) != null;
                                const paused =
                                  row != null &&
                                  resolveControllableTimeLog(row.logs, "paused", currentUserId, isAdmin) != null;
                                return (
                                  <Space size={4} onClick={(event) => event.stopPropagation()}>
                                    {active ? (
                                      <TipButton
                                        tip={HELP_TIPS.timerPausar}
                                        size="small"
                                        icon={<PauseCircleOutlined />}
                                        onClick={() => void quickTaskTimeAction(record, "pause")}
                                      />
                                    ) : (
                                      <TipButton
                                        tip={HELP_TIPS.timerIniciar}
                                        size="small"
                                        icon={<PlayCircleOutlined />}
                                        onClick={() =>
                                          void quickTaskTimeAction(record, paused ? "resume" : "start")
                                        }
                                      />
                                    )}
                                    <TipButton
                                      tip="Adicionar subtarefa nesta tarefa"
                                      size="small"
                                      icon={<PlusOutlined />}
                                      onClick={() => openCreateSubtaskModal(record)}
                                    />
                                    <TipButton
                                      tip={HELP_TIPS.comentarios}
                                      size="small"
                                      icon={<CommentOutlined />}
                                      onClick={() => openTask(record, "comments").catch(() => undefined)}
                                    />
                                    <TipButton
                                      tip={HELP_TIPS.excluir}
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={() =>
                                        openDeleteConfirmModal({
                                          title:
                                            (record.subtasks_count ?? 0) > 0
                                              ? `Excluir esta tarefa e suas ${record.subtasks_count} subtarefas?`
                                              : "Excluir esta tarefa?",
                                          onConfirm: async () => {
                                            const ok = await deleteTaskById(record.id);
                                            if (!ok) throw new Error("delete_failed");
                                          },
                                        })
                                      }
                                    />
                                  </Space>
                                );
                              },
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col span={24}>
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
                  </Row>
                )}

                {(activeKey === "dashboard" || activeKey === "tasks") && isAdmin && (
                  <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                    <Card
                      title="Horas dos colaboradores"
                      extra={
                        <Button loading={hoursDashboardLoading} onClick={() => void fetchHoursDashboardData()}>
                          Atualizar horas
                        </Button>
                      }
                    >
                      <Space wrap style={{ marginBottom: 12 }}>
                        <Select
                          allowClear
                          placeholder="Usuario"
                          style={{ minWidth: 220 }}
                          showSearch
                          optionFilterProp="label"
                          value={hoursUserFilter || undefined}
                          onChange={(value) => setHoursUserFilter(value ?? "")}
                          options={adminUsersCache
                            .filter((u) => {
                              if (hoursUserRoleFilter === "admin") return u.type === "admin";
                              if (hoursUserRoleFilter === "collaborator") return u.type === "collaborador";
                              return true;
                            })
                            .map((u) => ({
                              value: String(u.id),
                              label: `${u.name || u.email || `Usuario ${u.id}`} (${u.type === "admin" ? "Admin" : "Colaborador"})`,
                            }))}
                        />
                        <Select
                          value={hoursUserRoleFilter}
                          onChange={(value) => setHoursUserRoleFilter(value)}
                          style={{ minWidth: 180 }}
                          options={[
                            { value: "all", label: "Todos (colab. + admin)" },
                            { value: "collaborator", label: "So colaborador" },
                            { value: "admin", label: "So admin" },
                          ]}
                        />
                        <Select
                          allowClear
                          placeholder="Cliente"
                          style={{ minWidth: 200 }}
                          showSearch
                          optionFilterProp="label"
                          value={hoursClientFilter || undefined}
                          onChange={(value) => setHoursClientFilter(value ?? "")}
                          options={clients.map((c) => ({
                            value: String(c.id),
                            label: String(c.name ?? c.id),
                          }))}
                        />
                        <Select
                          allowClear
                          placeholder="Projeto"
                          style={{ minWidth: 200 }}
                          showSearch
                          optionFilterProp="label"
                          value={hoursProjectFilter || undefined}
                          onChange={(value) => setHoursProjectFilter(value ?? "")}
                          options={projects.map((p) => ({
                            value: String(p.id),
                            label: String(p.name ?? p.id),
                          }))}
                        />
                        <Select
                          value={hoursPeriodFilter}
                          onChange={(value) => {
                            setHoursPeriodFilter(value);
                            if (value !== "custom") {
                              setHoursDateFrom("");
                              setHoursDateTo("");
                            }
                          }}
                          style={{ minWidth: 220 }}
                          options={[
                            { value: "this_week", label: "Semana (seg–sex)" },
                            { value: "this_month", label: "Total do mes" },
                            { value: "all", label: "Todo o tempo" },
                            { value: "today", label: "Hoje" },
                            { value: "last_7", label: "Ultimos 7 dias" },
                            { value: "last_30", label: "Ultimos 30 dias" },
                            { value: "custom", label: "Periodo personalizado" },
                          ]}
                        />
                        {hoursPeriodFilter === "custom" ? (
                          <>
                            <Input
                              type="date"
                              value={hoursDateFrom}
                              onChange={(e) => setHoursDateFrom(e.target.value)}
                              style={{ width: 150 }}
                              aria-label="Data inicial"
                            />
                            <Input
                              type="date"
                              value={hoursDateTo}
                              onChange={(e) => setHoursDateTo(e.target.value)}
                              style={{ width: 150 }}
                              aria-label="Data final"
                            />
                          </>
                        ) : null}
                        <Button type="primary" loading={hoursDashboardLoading} onClick={() => void fetchHoursDashboardData()}>
                          Consultar
                        </Button>
                        <Button
                          onClick={() => {
                            clearHoursFilters();
                          }}
                        >
                          Limpar filtros
                        </Button>
                      </Space>
                      {hoursDashboard ? (
                        <Row gutter={[16, 16]}>
                          <Col xs={24} md={8}>
                            <Statistic
                              title="Horas consumidas"
                              value={decimalHoursToHmText(Number(hoursDashboard.consumed_hours ?? 0))}
                            />
                          </Col>
                          <Col xs={24} md={8}>
                            <Statistic
                              title="Horas contratadas"
                              value={decimalHoursToHmText(Number(hoursDashboard.contracted_hours ?? 0))}
                            />
                          </Col>
                          <Col xs={24} md={8}>
                            <Statistic
                              title="Horas previstas"
                              value={formatEffortHoursDisplay(Number(hoursDashboard.effort_points_total ?? 0))}
                            />
                          </Col>
                          <Col span={24}>
                            <Table
                              size="small"
                              rowKey={(row) => String((row as { user_id?: number | null }).user_id ?? "none")}
                              pagination={{ pageSize: 8 }}
                              dataSource={
                                Array.isArray(hoursDashboard.by_collaborator)
                                  ? (hoursDashboard.by_collaborator as Array<Record<string, unknown>>)
                                  : []
                              }
                              locale={{ emptyText: "Sem apontamentos para os filtros." }}
                              onRow={(row) => ({
                                onClick: () => setHoursDetailCollaborator(row as Record<string, unknown>),
                                style: { cursor: "pointer" },
                              })}
                              columns={[
                                {
                                  title: "Usuario",
                                  dataIndex: "name",
                                  render: (value: string, row: Record<string, unknown>) =>
                                    `${value}${row.email ? ` (${row.email})` : ""}`,
                                },
                                {
                                  title: "Tipo",
                                  key: "user_type",
                                  width: 110,
                                  render: (_: unknown, row: Record<string, unknown>) => {
                                    const isAdminRow =
                                      row.user_type === "admin" || Boolean(row.is_staff);
                                    return isAdminRow ? "Admin" : "Colaborador";
                                  },
                                },
                                {
                                  title: "Tarefas",
                                  key: "tasks_count",
                                  width: 90,
                                  render: (_: unknown, row: Record<string, unknown>) =>
                                    Number(row.tasks_count ?? (Array.isArray(row.tasks) ? row.tasks.length : 0)),
                                },
                                {
                                  title: "Horas previstas",
                                  dataIndex: "effort_points_total",
                                  width: 130,
                                  render: (value: number) => formatEffortHoursDisplay(Number(value ?? 0)),
                                },
                                {
                                  title: "Horas",
                                  dataIndex: "consumed_hours",
                                  width: 120,
                                  render: (value: number) => decimalHoursToHmText(value),
                                },
                              ]}
                            />
                            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                              Clique no usuario para abrir o detalhe por tarefa (horas previstas, horas apontadas e cliente).
                            </Typography.Paragraph>
                          </Col>
                        </Row>
                      ) : (
                        <Typography.Text type="secondary">Consulte para ver horas por colaborador.</Typography.Text>
                      )}
                    </Card>
                  <Card
                    title="Dashboard · Tarefas"
                    extra={
                      <Space wrap>
                        <TipButton
                          tip={HELP_TIPS.novaTarefa}
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => {
                            setComposeBoardId(null);
                            createTaskForm.resetFields();
                            createTaskForm.setFieldsValue({
                              priority: "medium",
                              status: "todo",
                              effort_points: 1,
                            });
                            setCreateTaskOpen(true);
                          }}
                        >
                          Nova tarefa
                        </TipButton>
                        <TipButton
                          tip={HELP_TIPS.atualizar}
                          onClick={() => {
                            if (isAdmin) fetchAllTasks().catch(() => undefined);
                            else fetchTasks().catch(() => undefined);
                          }}
                          loading={allTasksLoading}
                        >
                          Atualizar
                        </TipButton>
                        <TipButton
                          tip={HELP_TIPS.limparFiltros}
                          onClick={() => {
                            setTaskStatusFilter([]);
                            setTaskPriorityFilter([]);
                            setTaskProjectFilter([]);
                            setTaskClientFilter([]);
                            setTaskBoardFilter([]);
                            setTaskAssigneeFilter([]);
                            setTaskPeriodFilter("all");
                            setTaskSearchFilter("");
                            setTaskStatusFilterMode("include");
                            setTaskPriorityFilterMode("include");
                            setTaskProjectFilterMode("include");
                            setTaskClientFilterMode("include");
                            setTaskBoardFilterMode("include");
                            setTaskAssigneeFilterMode("include");
                            setAdminTasksTablePage(1);
                          }}
                        >
                          Limpar filtros
                        </TipButton>
                      </Space>
                    }
                  >
                    <Space style={{ marginBottom: 12 }} wrap>
                      <TipSelect
                        tip={HELP_TIPS.filterPeriodo}
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
                      <Space.Compact>
                        <Select
                          value={taskStatusFilterMode}
                          onChange={setTaskStatusFilterMode}
                          style={{ width: 100 }}
                          options={filterModeOptions}
                        />
                        <Select
                          mode="multiple"
                          allowClear
                          maxTagCount="responsive"
                          placeholder={
                            taskStatusFilterMode === "exclude" ? "Status a excluir" : "Status"
                          }
                          value={taskStatusFilter}
                          onChange={setTaskStatusFilter}
                          style={{ minWidth: 180 }}
                          options={statusOptions}
                        />
                      </Space.Compact>
                      <Space.Compact>
                        <Select
                          value={taskPriorityFilterMode}
                          onChange={setTaskPriorityFilterMode}
                          style={{ width: 100 }}
                          options={filterModeOptions}
                        />
                        <Select
                          mode="multiple"
                          allowClear
                          maxTagCount="responsive"
                          placeholder={
                            taskPriorityFilterMode === "exclude"
                              ? "Prioridades a excluir"
                              : "Prioridades"
                          }
                          value={taskPriorityFilter}
                          onChange={setTaskPriorityFilter}
                          style={{ minWidth: 160 }}
                          options={[
                            { value: "low", label: "Baixa" },
                            { value: "medium", label: "Média" },
                            { value: "high", label: "Alta" },
                            { value: "critical", label: "Crítica" },
                          ]}
                        />
                      </Space.Compact>
                      <Space.Compact>
                        <Select
                          value={taskProjectFilterMode}
                          onChange={setTaskProjectFilterMode}
                          style={{ width: 100 }}
                          options={filterModeOptions}
                        />
                        <Select
                          mode="multiple"
                          allowClear
                          maxTagCount="responsive"
                          placeholder={
                            taskProjectFilterMode === "exclude" ? "Projetos a excluir" : "Projetos"
                          }
                          value={taskProjectFilter}
                          onChange={(value) => {
                            setTaskProjectFilter(value);
                            if (value.length > 0) {
                              const validBoards = new Set(
                                boards
                                  .filter((b) => value.includes(String(b.project_id)))
                                  .map((b) => b.id),
                              );
                              setTaskBoardFilter((prev) => prev.filter((id) => validBoards.has(id)));
                            }
                          }}
                          style={{ minWidth: 200 }}
                          showSearch
                          optionFilterProp="label"
                          options={projects.map((p) => ({
                            value: String(p.id),
                            label: String(p.name ?? p.id),
                          }))}
                        />
                      </Space.Compact>
                      <Space.Compact>
                        <Select
                          value={taskClientFilterMode}
                          onChange={setTaskClientFilterMode}
                          style={{ width: 100 }}
                          options={filterModeOptions}
                        />
                        <Select
                          mode="multiple"
                          allowClear
                          maxTagCount="responsive"
                          placeholder={
                            taskClientFilterMode === "exclude" ? "Clientes a excluir" : "Clientes"
                          }
                          value={taskClientFilter}
                          onChange={setTaskClientFilter}
                          style={{ minWidth: 200 }}
                          showSearch
                          optionFilterProp="label"
                          options={clients.map((c) => ({
                            value: String(c.id),
                            label: String(c.name ?? c.id),
                          }))}
                        />
                      </Space.Compact>
                      <Space.Compact>
                        <Select
                          value={taskBoardFilterMode}
                          onChange={setTaskBoardFilterMode}
                          style={{ width: 100 }}
                          options={filterModeOptions}
                        />
                        <Select
                          mode="multiple"
                          allowClear
                          maxTagCount="responsive"
                          placeholder={
                            taskBoardFilterMode === "exclude" ? "Grupos a excluir" : "Grupos"
                          }
                          value={taskBoardFilter}
                          onChange={setTaskBoardFilter}
                          style={{ minWidth: 200 }}
                          showSearch
                          optionFilterProp="label"
                          options={boards
                            .filter(
                              (b) =>
                                taskProjectFilter.length === 0 ||
                                taskProjectFilter.includes(String(b.project_id)),
                            )
                            .map((b) => ({
                              value: b.id,
                              label: b.name,
                            }))}
                        />
                      </Space.Compact>
                      <Space.Compact>
                        <Select
                          value={taskAssigneeFilterMode}
                          onChange={setTaskAssigneeFilterMode}
                          style={{ width: 100 }}
                          options={filterModeOptions}
                        />
                        <Select
                          mode="multiple"
                          allowClear
                          maxTagCount="responsive"
                          placeholder={
                            taskAssigneeFilterMode === "exclude"
                              ? "Colaboradores a excluir"
                              : "Colaboradores"
                          }
                          value={taskAssigneeFilter}
                          onChange={setTaskAssigneeFilter}
                          style={{ minWidth: 200 }}
                          showSearch
                          optionFilterProp="label"
                          options={[
                            ...(currentUserId != null
                              ? [
                                  {
                                    value: String(currentUserId),
                                    label: "Eu (meu responsavel)",
                                  },
                                ]
                              : []),
                            {
                              value: "unassigned",
                              label: "Sem responsavel",
                            },
                            ...adminUsersCache
                              .filter((u) => currentUserId == null || u.id !== currentUserId)
                              .map((u) => ({
                                value: String(u.id),
                                label: u.name || u.email || `Usuario ${u.id}`,
                              })),
                          ]}
                        />
                      </Space.Compact>
                      <Tooltip title={HELP_TIPS.buscarTitulo} mouseEnterDelay={0.35}>
                        <Input
                          placeholder="Buscar por titulo"
                          value={taskSearchFilter}
                          onChange={(event) => setTaskSearchFilter(event.target.value)}
                          style={{ width: 260 }}
                        />
                      </Tooltip>
                      <Tag color="processing">{tasksTabFiltered.length} tarefas visiveis</Tag>
                    </Space>
                    <Table<TaskItem>
                      rowKey="id"
                      size="small"
                      className="bb-compact-table"
                      loading={allTasksLoading}
                      dataSource={tasksTabFiltered}
                      pagination={{
                        pageSize: TASK_TABLE_PAGE_SIZE,
                        current: adminTasksTablePage,
                        onChange: (page) => setAdminTasksTablePage(page),
                      }}
                      expandable={{
                        expandedRowKeys: expandedAdminTasksKeys,
                        onExpand: (expanded, record) => {
                          setExpandedAdminTasksKeys((prev) =>
                            expanded
                              ? Array.from(new Set([...prev, record.id]))
                              : prev.filter((key) => key !== record.id),
                          );
                          if (expanded) void refreshTaskSubtasks(record.id);
                        },
                        rowExpandable: (record) => !record.parent_id && (record.subtasks_count ?? 0) > 0,
                        expandedRowRender: (record) =>
                          renderExpandableSubtasks(
                            record,
                            currentUserId != null &&
                              taskAssigneeFilter.includes(String(currentUserId)),
                          ),
                      }}
                      onRow={(record) => ({
                        onClick: () => openTask(record),
                        style: { cursor: "pointer" },
                      })}
                      columns={[
                        {
                          title: "Titulo",
                          dataIndex: "title",
                          width: 320,
                          ellipsis: true,
                          sorter: (a, b) => a.title.localeCompare(b.title),
                          render: (value: string, record: TaskItem) => renderTaskTitleCell(value, record),
                        },
                        {
                          ...assigneeColumn,
                          sorter: (a: TaskItem, b: TaskItem) =>
                            String(a.assignee_name ?? a.assignee_id ?? "").localeCompare(
                              String(b.assignee_name ?? b.assignee_id ?? ""),
                            ),
                        },
                        {
                          title: "Projeto",
                          sorter: (a, b) => taskContext(a).projectLabel.localeCompare(taskContext(b).projectLabel),
                          render: (record: TaskItem) => taskContext(record).projectLabel,
                        },
                        {
                          title: "Cliente",
                          sorter: (a, b) => taskContext(a).clientLabel.localeCompare(taskContext(b).clientLabel),
                          render: (record: TaskItem) => taskContext(record).clientLabel,
                        },
                        {
                          title: "Prioridade",
                          dataIndex: "priority",
                          sorter: (a, b) => a.priority.localeCompare(b.priority),
                          render: (v: string) => renderPriorityTag(v),
                        },
                        {
                          title: "Status",
                          dataIndex: "status",
                          sorter: (a, b) => a.status.localeCompare(b.status),
                          render: (_: string, record: TaskItem) => renderEditableStatusTag(record),
                        },
                        {
                          title: "Prazo inicio",
                          dataIndex: "start_date",
                          sorter: (a, b) => new Date(a.start_date ?? 0).getTime() - new Date(b.start_date ?? 0).getTime(),
                          render: (v: string | null) => formatDateOnly(v),
                        },
                        {
                          title: "Prazo fim",
                          dataIndex: "end_date",
                          defaultSortOrder: "ascend",
                          sorter: compareTaskEndDateAsc,
                          render: (v: string | null) => formatDateOnly(v),
                        },
                        {
                          title: "Tempo",
                          render: (record: TaskItem) => {
                            const row = taskTimeSummaryByTaskId[record.id];
                            if (!row) {
                              return <Typography.Text type="secondary">—</Typography.Text>;
                            }
                            const now = taskTimeTickMs || Date.now();
                            const display = liveTotalSecondsFromSummary(
                              row.total_seconds,
                              row.logs,
                              row.fetchedAtMs,
                              now,
                              currentUserId,
                            );
                            const active =
                              resolveControllableTimeLog(row.logs, "active", currentUserId, isAdmin) != null;
                            return (
                              <Space
                                size={4}
                                style={{ whiteSpace: "nowrap", flexWrap: "nowrap" }}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Typography.Text style={{ whiteSpace: "nowrap" }}>
                                  {secondsToText(display)}
                                </Typography.Text>
                                {active ? <Tag color="processing" style={{ marginInlineEnd: 0 }}>Contando</Tag> : null}
                              </Space>
                            );
                          },
                        },
                        {
                          title: "Acoes",
                          render: (record: TaskItem) => {
                            const row = taskTimeSummaryByTaskId[record.id];
                            const active =
                              row != null &&
                              resolveControllableTimeLog(row.logs, "active", currentUserId, isAdmin) != null;
                            const paused =
                              row != null &&
                              resolveControllableTimeLog(row.logs, "paused", currentUserId, isAdmin) != null;
                            return (
                              <Space size={4} onClick={(event) => event.stopPropagation()}>
                                {active ? (
                                  <TipButton
                                    tip={HELP_TIPS.timerPausar}
                                    size="small"
                                    icon={<PauseCircleOutlined />}
                                    onClick={() => void quickTaskTimeAction(record, "pause")}
                                  />
                                ) : (
                                  <TipButton
                                    tip={HELP_TIPS.timerIniciar}
                                    size="small"
                                    icon={<PlayCircleOutlined />}
                                    onClick={() =>
                                      void quickTaskTimeAction(record, paused ? "resume" : "start")
                                    }
                                  />
                                )}
                                <TipButton
                                  tip="Adicionar subtarefa nesta tarefa"
                                  size="small"
                                  icon={<PlusOutlined />}
                                  onClick={() => openCreateSubtaskModal(record)}
                                />
                                <TipButton
                                  tip={HELP_TIPS.comentarios}
                                  size="small"
                                  icon={<CommentOutlined />}
                                  onClick={() => openTask(record, "comments").catch(() => undefined)}
                                />
                                <TipButton
                                  tip={HELP_TIPS.excluir}
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() =>
                                    openDeleteConfirmModal({
                                      title:
                                        (record.subtasks_count ?? 0) > 0
                                          ? `Excluir esta tarefa e suas ${record.subtasks_count} subtarefas?`
                                          : "Excluir esta tarefa?",
                                      onConfirm: async () => {
                                        const ok = await deleteTaskById(record.id);
                                        if (!ok) throw new Error("delete_failed");
                                      },
                                    })
                                  }
                                />
                              </Space>
                            );
                          },
                        },
                      ]}
                    />
                  </Card>
                  </Space>
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
                                  <TipButton
                                    tip={HELP_TIPS.atualizar}
                                    onClick={() => fetchAdminUsers().catch(() => undefined)}
                                    loading={adminUsersLoading}
                                  >
                                    Atualizar lista
                                  </TipButton>
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
                                          <Space>
                                            <TipButton
                                              tip={HELP_TIPS.editar}
                                              size="small"
                                              icon={<EditOutlined />}
                                              onClick={() => {
                                                void (async () => {
                                                  manageUserProfileForm.setFieldsValue({
                                                    user_id: record.id,
                                                    name: record.name,
                                                    email: record.email,
                                                    is_staff: record.type === "admin",
                                                    birth_date: record.birth_date,
                                                    workspace_ids: [] as string[],
                                                    is_active: true,
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
                                            </TipButton>
                                            <TipButton
                                              tip={HELP_TIPS.excluir}
                                              size="small"
                                              danger
                                              icon={<DeleteOutlined />}
                                              onClick={() =>
                                                openDeleteConfirmModal({
                                                  title: `Excluir usuario "${record.name || record.email}"? (inativacao logica)`,
                                                  onConfirm: async () => {
                                                    const response = await apiRequest(`/users/${record.id}`, {
                                                      method: "PATCH",
                                                      token,
                                                      body: { is_active: false },
                                                    });
                                                    if (!response.ok) {
                                                      apiMessage.error(
                                                        extractApiErrorMessage(response.error, "Falha ao excluir usuario."),
                                                      );
                                                      throw new Error("user_delete_failed");
                                                    }
                                                    setAdminUsersCache((prev) => prev.filter((row) => row.id !== record.id));
                                                    await fetchAdminUsers().catch(() => undefined);
                                                    apiMessage.success("Usuario excluido (inativado).");
                                                  },
                                                })
                                              }
                                            >
                                              Excluir
                                            </TipButton>
                                          </Space>
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
                                        ...(String(values.password ?? "").trim()
                                          ? { password: String(values.password).trim() }
                                          : {}),
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
                                  <Form.Item
                                    name="password"
                                    label="Nova senha (opcional)"
                                    extra="Deixe em branco para manter. Minimo 12 caracteres com maiuscula, minuscula, numero e especial."
                                    rules={[
                                      { min: 12, message: "A senha precisa ter no minimo 12 caracteres." },
                                    ]}
                                  >
                                    <Input.Password autoComplete="new-password" />
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
                                            setAdminUsersCache((prev) => prev.filter((row) => row.id !== Number(userId)));
                                            await fetchAdminUsers().catch(() => undefined);
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
                              is_done_like: key === "done",
                              is_active: true,
                            })),
                          }}
                          onFinish={async (values) => {
                            const rows = Array.isArray(values.rows) ? values.rows : [];
                            const usedKeys = new Set<string>();
                            const statuses: Array<{
                              key: string;
                              label: string;
                              color: string;
                              is_done_like: boolean;
                              position: number;
                              is_active: boolean;
                            }> = [];
                            rows.forEach(
                              (
                                row: {
                                  source_key?: string;
                                  label?: string;
                                  color?: string;
                                  is_done_like?: boolean;
                                  is_active?: boolean;
                                },
                                index: number,
                              ) => {
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
                                statuses.push({
                                  key: safeKey,
                                  label,
                                  color: String(row.color ?? "default"),
                                  is_done_like: Boolean(row.is_done_like) || safeKey === "done",
                                  position: index + 1,
                                  is_active: row.is_active !== false,
                                });
                              },
                            );
                            if (statuses.length === 0) {
                              apiMessage.warning("Adicione pelo menos um status.");
                              return;
                            }
                            const response = await apiRequest<{
                              statuses?: Array<{ key?: string; label?: string; color?: string }>;
                            }>("/task-statuses", {
                              method: "PUT",
                              token,
                              body: { statuses },
                            });
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Falha ao salvar status globais.");
                              return;
                            }
                            const nextPalette: Record<string, { label: string; color: string }> = {};
                            (response.data?.statuses ?? statuses).forEach((row) => {
                              const key = String(row.key ?? "").trim();
                              if (!key) return;
                              nextPalette[key] = {
                                label: String(row.label ?? key),
                                color: String(row.color ?? "default"),
                              };
                            });
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
                                            { value: "geekblue", label: "Azul acinzentado" },
                                            { value: "blue", label: "Azul" },
                                            { value: "cyan", label: "Ciano" },
                                            { value: "green", label: "Verde" },
                                            { value: "lime", label: "Lima" },
                                            { value: "gold", label: "Dourado" },
                                            { value: "orange", label: "Laranja" },
                                            { value: "volcano", label: "Laranja forte" },
                                            { value: "red", label: "Vermelho" },
                                            { value: "magenta", label: "Magenta" },
                                            { value: "purple", label: "Roxo" },
                                            { value: "default", label: "Cinza (suave)" },
                                            { value: "processing", label: "Azul suave" },
                                            { value: "warning", label: "Amarelo suave" },
                                            { value: "success", label: "Verde suave" },
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
                                          const previewColor = normalizeStatusTagColor(String(row?.color ?? "geekblue"));
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

                {activeKey === "clients" && isAdmin && (
                  <Card
                    title="Clientes"
                    extra={
                      <Space wrap>
                        <Input
                          allowClear
                          placeholder="Buscar por nome, CNPJ ou contato"
                          value={clientListSearch}
                          onChange={(event) => setClientListSearch(event.target.value)}
                          style={{ width: 280 }}
                          title={HELP_TIPS.buscarCliente}
                        />
                        <TipButton tip={HELP_TIPS.atualizar} onClick={() => fetchCrudData().catch(() => undefined)}>
                          Atualizar
                        </TipButton>
                        <HelpTip title={HELP_TIPS.novoCliente}>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              manageClientForm.resetFields();
                              setManageClientModal({ mode: "create" });
                            }}
                          >
                            Novo cliente
                          </Button>
                        </HelpTip>
                      </Space>
                    }
                  >
                    <Table
                      rowKey="id"
                      dataSource={filteredClientsManage}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: "Nome", dataIndex: "name" },
                        { title: "CNPJ", dataIndex: "cnpj", render: (v: string) => v || "-" },
                        { title: "Contato", dataIndex: "contact_name", render: (v: string) => v || "-" },
                        {
                          title: "Status",
                          dataIndex: "status",
                          render: (v: string) => (
                            <Tag color={v === "active" ? "success" : "default"}>{v === "active" ? "Ativo" : v ?? "-"}</Tag>
                          ),
                        },
                        {
                          title: "Acoes",
                          render: (row: Record<string, unknown>) => {
                            const clientId = String(row.id ?? "");
                            return (
                              <Space>
                                <TipButton
                                  tip={HELP_TIPS.editar}
                                  size="small"
                                  icon={<EditOutlined />}
                                  onClick={() => {
                                    manageClientForm.setFieldsValue({
                                      name: String(row.name ?? ""),
                                      cnpj: String(row.cnpj ?? ""),
                                      contact_name: String(row.contact_name ?? ""),
                                      financial_emails: String(row.financial_emails ?? ""),
                                      description: String(row.description ?? ""),
                                    });
                                    setManageClientModal({ mode: "edit", clientId });
                                  }}
                                >
                                  Editar
                                </TipButton>
                                <TipButton
                                  tip={HELP_TIPS.excluir}
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() =>
                                    openDeleteConfirmModal({
                                      title: `Excluir cliente "${String(row.name ?? "")}"?`,
                                      onConfirm: async () => {
                                        const response = await apiRequest(`/clients/${clientId}`, {
                                          method: "DELETE",
                                          token,
                                        });
                                        if (!response.ok) {
                                          apiMessage.error(response.error?.message ?? "Falha ao excluir cliente.");
                                          throw new Error("client_delete_failed");
                                        }
                                        apiMessage.success("Cliente excluido.");
                                        await fetchCrudData();
                                      },
                                    })
                                  }
                                >
                                  Excluir
                                </TipButton>
                              </Space>
                            );
                          },
                        },
                      ]}
                    />
                  </Card>
                )}
                {activeKey === "services" && isAdmin && (
                  <Card
                    title="Servicos"
                    extra={
                      <Space wrap>
                        <TipButton tip={HELP_TIPS.atualizar} onClick={() => fetchCrudData().catch(() => undefined)}>
                          Atualizar
                        </TipButton>
                        <HelpTip title={HELP_TIPS.novoServico}>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              manageServiceForm.resetFields();
                              manageServiceForm.setFieldsValue({ is_active: true, display_order: 100 });
                              setManageServiceModal({ mode: "create" });
                            }}
                          >
                            Novo servico
                          </Button>
                        </HelpTip>
                      </Space>
                    }
                  >
                    <Table<ServiceCatalogItem>
                      rowKey="id"
                      dataSource={serviceCatalog}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: "Nome", dataIndex: "name" },
                        { title: "Descricao", dataIndex: "description", ellipsis: true },
                        { title: "Ordem", dataIndex: "display_order" },
                        {
                          title: "Ativo",
                          dataIndex: "is_active",
                          render: (v: boolean) => <Tag color={v ? "success" : "default"}>{v ? "Sim" : "Nao"}</Tag>,
                        },
                        {
                          title: "Acoes",
                          render: (row) => (
                            <Space>
                              <TipButton
                                tip={HELP_TIPS.editar}
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => {
                                  manageServiceForm.setFieldsValue({
                                    name: row.name,
                                    description: row.description,
                                    display_order: row.display_order,
                                    is_active: row.is_active,
                                  });
                                  setManageServiceModal({ mode: "edit", serviceId: row.id });
                                }}
                              >
                                Editar
                              </TipButton>
                              <TipButton
                                tip={HELP_TIPS.excluir}
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                  openDeleteConfirmModal({
                                    title: `Excluir servico "${row.name}"?`,
                                    onConfirm: async () => {
                                      const response = await apiRequest(`/services/${row.id}`, {
                                        method: "DELETE",
                                        token,
                                      });
                                      if (!response.ok) {
                                        apiMessage.error(response.error?.message ?? "Falha ao excluir servico.");
                                        throw new Error("service_delete_failed");
                                      }
                                      apiMessage.success("Servico excluido.");
                                      await fetchCrudData();
                                    },
                                  })
                                }
                              >
                                Excluir
                              </TipButton>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Card>
                )}
                {activeKey === "sales" && isAdmin && (
                  <Card
                    title="Vendas e contratos"
                    extra={
                      <Space wrap>
                        <TipButton tip={HELP_TIPS.atualizar} onClick={() => fetchCrudData().catch(() => undefined)}>
                          Atualizar
                        </TipButton>
                        <HelpTip title={HELP_TIPS.novaVenda}>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              setNewSaleWizardStep(0);
                              newSaleWizardForm.resetFields();
                              const initialWizardValues = {
                                use_existing_client: false,
                                emits_invoice: true,
                                has_iss_retention: false,
                                has_inss_retention: false,
                                payment_method: "boleto",
                                service_lines: [{ service_type: "one_off", amount: "0.00" }],
                              };
                              newSaleWizardForm.setFieldsValue(initialWizardValues);
                              newSaleWizardValuesRef.current = initialWizardValues;
                              setNewSaleWizardOpen(true);
                            }}
                          >
                            Nova venda
                          </Button>
                        </HelpTip>
                      </Space>
                    }
                  >
                    <Table<ContractItem>
                      rowKey="id"
                      dataSource={contracts}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: "Cliente", render: (row) => row.client_name ?? row.client_id },
                        {
                          title: "Status",
                          dataIndex: "status",
                          render: (v: string) => <Tag color={v === "active" ? "success" : "default"}>{v}</Tag>,
                        },
                        { title: "Pagamento", dataIndex: "payment_method" },
                        { title: "NF", render: (row) => (row.emits_invoice ? "Sim" : "Nao") },
                        { title: "ISS", render: (row) => (row.has_iss_retention ? "Sim" : "Nao") },
                        { title: "INSS", render: (row) => (row.has_inss_retention ? "Sim" : "Nao") },
                        { title: "Servicos", render: (row) => row.service_lines?.length ?? 0 },
                        {
                          title: "Criado em",
                          dataIndex: "created_at",
                          render: (v: string | undefined) => (v ? formatDate(v) : "-"),
                        },
                        {
                          title: "Acoes",
                          render: (row) => (
                            <Space wrap>
                              <TipButton
                                tip={HELP_TIPS.visualizarVenda}
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => {
                                  void (async () => {
                                    const response = await apiRequest<{ contract: ContractItem }>(
                                      `/contracts/${row.id}`,
                                      { token },
                                    );
                                    if (!response.ok || !response.data?.contract) {
                                      apiMessage.error(
                                        extractApiErrorMessage(response.error, "Falha ao carregar venda."),
                                      );
                                      return;
                                    }
                                    setViewContractData(response.data.contract);
                                  })();
                                }}
                              >
                                Visualizar
                              </TipButton>
                              <TipButton
                                tip={HELP_TIPS.editar}
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => {
                                  void (async () => {
                                    const response = await apiRequest<{ contract: ContractItem }>(
                                      `/contracts/${row.id}`,
                                      { token },
                                    );
                                    if (!response.ok || !response.data?.contract) {
                                      apiMessage.error(
                                        extractApiErrorMessage(response.error, "Falha ao carregar venda."),
                                      );
                                      return;
                                    }
                                    const contract = response.data.contract;
                                    editContractForm.setFieldsValue(contractToEditFormValues(contract));
                                    setEditContractId(contract.id);
                                  })();
                                }}
                              >
                                Editar
                              </TipButton>
                              <TipButton
                                tip={HELP_TIPS.excluir}
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                disabled={row.status === "active"}
                                onClick={() =>
                                  openDeleteConfirmModal({
                                    title: `Excluir venda de "${row.client_name ?? row.client_id}"?`,
                                    onConfirm: async () => {
                                      const response = await apiRequest(`/contracts/${row.id}`, {
                                        method: "DELETE",
                                        token,
                                      });
                                      if (!response.ok) {
                                        apiMessage.error(
                                          extractApiErrorMessage(response.error, "Falha ao excluir venda."),
                                        );
                                        throw new Error("contract_delete_failed");
                                      }
                                      apiMessage.success("Venda excluida.");
                                      await fetchCrudData();
                                    },
                                  })
                                }
                              >
                                Excluir
                              </TipButton>
                              {row.status !== "active" && row.status !== "cancelled" ? (
                                <TipButton
                                  tip={HELP_TIPS.confirmarVenda}
                                  size="small"
                                  type="primary"
                                  onClick={async () => {
                                    const response = await apiRequest(`/contracts/${row.id}/confirm`, {
                                      method: "POST",
                                      token,
                                      body: {},
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao confirmar contrato.");
                                      return;
                                    }
                                    apiMessage.success("Contrato confirmado e projetos criados.");
                                    await fetchCrudData();
                                  }}
                                >
                                  Confirmar
                                </TipButton>
                              ) : null}
                              {row.status === "cancelled" ? (
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<PlayCircleOutlined />}
                                  onClick={async () => {
                                    const response = await apiRequest<{ contract: ContractItem }>(
                                      `/contracts/${row.id}/reactivate`,
                                      { method: "POST", token, body: {} },
                                    );
                                    if (!response.ok) {
                                      apiMessage.error(
                                        extractApiErrorMessage(response.error, "Falha ao reativar contrato."),
                                      );
                                      return;
                                    }
                                    const nextStatus = response.data?.contract?.status ?? "submitted";
                                    apiMessage.success(
                                      nextStatus === "active"
                                        ? "Contrato reativado (ativo)."
                                        : "Contrato reativado. Confirme novamente se necessario.",
                                    );
                                    await fetchCrudData();
                                  }}
                                >
                                  Reativar
                                </Button>
                              ) : null}
                              {row.status !== "cancelled" ? (
                                <Button
                                  size="small"
                                  danger
                                  onClick={async () => {
                                    const response = await apiRequest(`/contracts/${row.id}/cancel`, {
                                      method: "POST",
                                      token,
                                      body: {},
                                    });
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao cancelar contrato.");
                                      return;
                                    }
                                    apiMessage.success("Contrato cancelado.");
                                    await fetchCrudData();
                                  }}
                                >
                                  Cancelar
                                </Button>
                              ) : null}
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Card>
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
                                            setAdminUsersCache((prev) => prev.filter((row) => row.id !== Number(userId)));
                                            await fetchAdminUsers().catch(() => undefined);
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
                                  src={
                                    resolveMediaUrl(profileAvatarDataUrl) ||
                                    profileAvatarDataUrl ||
                                    undefined
                                  }
                                  icon={
                                    !(resolveMediaUrl(profileAvatarDataUrl) || profileAvatarDataUrl)
                                      ? <UserOutlined />
                                      : undefined
                                  }
                                >
                                  {!(resolveMediaUrl(profileAvatarDataUrl) || profileAvatarDataUrl)
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
                                  if (file.size > 5 * 1024 * 1024) {
                                    apiMessage.error("Foto deve ter no maximo 5MB.");
                                    return Upload.LIST_IGNORE;
                                  }
                                  void (async () => {
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    const response = await apiRequest<{ user?: { avatar_url?: string | null } }>(
                                      "/me/avatar",
                                      { method: "POST", token, body: formData },
                                    );
                                    if (!response.ok) {
                                      apiMessage.error(response.error?.message ?? "Falha ao enviar foto.");
                                      return;
                                    }
                                    const remoteUrl = resolveMediaUrl(response.data?.user?.avatar_url ?? null) ?? "";
                                    if (remoteUrl) {
                                      setProfileAvatarDataUrl(remoteUrl);
                                      setProfileResult((prev) =>
                                        prev ? { ...prev, avatar_url: response.data?.user?.avatar_url ?? remoteUrl } : prev,
                                      );
                                    } else {
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const result = String(reader.result ?? "");
                                        setProfileAvatarDataUrl(result);
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                    if (typeof window !== "undefined" && currentUserId) {
                                      const raw = localStorage.getItem(`bb_profile_extra_${currentUserId}`);
                                      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
                                      localStorage.setItem(
                                        `bb_profile_extra_${currentUserId}`,
                                        JSON.stringify({
                                          ...parsed,
                                          avatar_data_url: remoteUrl || undefined,
                                          avatar_url: response.data?.user?.avatar_url ?? remoteUrl,
                                        }),
                                      );
                                    }
                                    void hydrateTaskAssigneePickList();
                                    await fetchProfile();
                                    apiMessage.success("Imagem de perfil atualizada.");
                                  })();
                                  return false;
                                }}
                              >
                                <TipButton tip={HELP_TIPS.subirImagemPerfil} icon={<EditOutlined />}>
                                  Subir imagem
                                </TipButton>
                              </Upload>
                              <TipButton
                                tip="Remove a foto de perfil"
                                danger
                                onClick={async () => {
                                  const response = await apiRequest("/me/avatar", { method: "DELETE", token });
                                  if (!response.ok) {
                                    apiMessage.error(response.error?.message ?? "Falha ao remover avatar.");
                                    return;
                                  }
                                  setProfileAvatarDataUrl("");
                                  setProfileResult((prev) => (prev ? { ...prev, avatar_url: null } : prev));
                                  if (typeof window !== "undefined" && currentUserId) {
                                    localStorage.removeItem(`bb_profile_extra_${currentUserId}`);
                                  }
                                  void hydrateTaskAssigneePickList();
                                  await fetchProfile();
                                  apiMessage.success("Avatar removido.");
                                }}
                              >
                                Remover avatar
                              </TipButton>
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
                            <TipButton
                              tip={HELP_TIPS.iniciar2fa}
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
                            </TipButton>
                            <TipButton
                              tip={HELP_TIPS.desativar2fa}
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
                            </TipButton>
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Alterar senha">
                        <Form
                          form={passwordChangeForm}
                          layout="vertical"
                          onFinish={async (values) => {
                            const response = await apiRequest("/me/password", {
                              method: "POST",
                              token,
                              body: {
                                current_password: String(values.current_password ?? ""),
                                new_password: String(values.new_password ?? ""),
                              },
                            });
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Falha ao alterar senha.");
                              return;
                            }
                            passwordChangeForm.resetFields();
                            apiMessage.success("Senha atualizada.");
                          }}
                        >
                          <Form.Item
                            name="current_password"
                            label="Senha atual"
                            rules={[{ required: true, message: "Informe a senha atual." }]}
                          >
                            <Input.Password autoComplete="current-password" />
                          </Form.Item>
                          <Form.Item
                            name="new_password"
                            label="Nova senha"
                            rules={[
                              { required: true, message: "Informe a nova senha." },
                              { min: 12, message: "Minimo de 12 caracteres." },
                            ]}
                          >
                            <Input.Password autoComplete="new-password" />
                          </Form.Item>
                          <Button type="primary" htmlType="submit">
                            Salvar nova senha
                          </Button>
                        </Form>
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="Aparencia">
                        <Space>
                          <Typography.Text>Tema escuro</Typography.Text>
                          <Switch
                            checked={bbThemeMode === "dark"}
                            onChange={(checked) => {
                              const next = checked ? "dark" : "light";
                              setBbThemeMode(next);
                              setBbTheme(next);
                            }}
                          />
                        </Space>
                      </Card>
                    </Col>
                    {isAdmin ? (
                      <Col xs={24} lg={12}>
                        <Card title="Testar e-mail">
                          <Typography.Paragraph type="secondary">
                            Envia um e-mail de teste para o endereco do perfil (ou da conta).
                            Requer SMTP configurado em <Typography.Text code>infra/env/api.env</Typography.Text>.
                          </Typography.Paragraph>
                          <Button
                            onClick={async () => {
                              const response = await apiRequest<{ to?: string }>("/me/email-test", {
                                method: "POST",
                                token,
                                body: {},
                              });
                              if (!response.ok) {
                                const details = response.error?.details as { error?: string } | undefined;
                                const detailMsg =
                                  details && typeof details.error === "string" && details.error.trim()
                                    ? ` (${details.error})`
                                    : "";
                                apiMessage.error(
                                  `${response.error?.message ?? "Falha ao enviar e-mail de teste."}${detailMsg}`,
                                );
                                return;
                              }
                              const to = response.data?.to ? ` para ${response.data.to}` : "";
                              apiMessage.success(`E-mail de teste enviado${to}.`);
                            }}
                          >
                            Testar e-mail
                          </Button>
                        </Card>
                      </Col>
                    ) : null}
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
                              job_title: String(values.job_title ?? ""),
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
                                  job_title: payload.job_title,
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
                            await fetchProfile();
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
                              <Form.Item name="job_title" label="Cargo">
                                <Input placeholder="Ex.: Designer, Desenvolvedor" />
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
                          <TipButton tip={HELP_TIPS.salvar} htmlType="submit" type="primary">
                            Salvar dados do perfil
                          </TipButton>
                        </Form>
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="Notificacoes por e-mail">
                        <Typography.Paragraph type="secondary">
                          Escolha como deseja ser avisado por evento. Instantaneo envia na hora; resumos agrupam varios avisos.
                        </Typography.Paragraph>
                        <Table
                          size="small"
                          rowKey="event_type"
                          pagination={false}
                          dataSource={notificationPreferences}
                          columns={[
                            {
                              title: "Evento",
                              dataIndex: "event_type",
                              render: (value: string) => NOTIFICATION_EVENT_LABELS[value] ?? value,
                            },
                            {
                              title: "No sistema",
                              render: (row: NotificationPreferenceItem) => (
                                <Select
                                  size="small"
                                  style={{ width: 100 }}
                                  value={row.in_app_enabled}
                                  options={[
                                    { value: true, label: "Sim" },
                                    { value: false, label: "Nao" },
                                  ]}
                                  onChange={(next) =>
                                    setNotificationPreferences((prev) =>
                                      prev.map((item) =>
                                        item.event_type === row.event_type
                                          ? { ...item, in_app_enabled: Boolean(next) }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              ),
                            },
                            {
                              title: "E-mail",
                              render: (row: NotificationPreferenceItem) => (
                                <Select
                                  size="small"
                                  style={{ width: 160 }}
                                  value={row.email_mode}
                                  options={NOTIFICATION_EMAIL_MODE_OPTIONS}
                                  onChange={(next) =>
                                    setNotificationPreferences((prev) =>
                                      prev.map((item) =>
                                        item.event_type === row.event_type
                                          ? { ...item, email_mode: next as NotificationPreferenceItem["email_mode"] }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              ),
                            },
                          ]}
                        />
                        <TipButton
                          tip={HELP_TIPS.salvarPreferenciasEmail}
                          type="primary"
                          style={{ marginTop: 12 }}
                          onClick={async () => {
                            const response = await apiRequest<{ preferences: NotificationPreferenceItem[] }>(
                              "/me/notification-preferences",
                              {
                                method: "PATCH",
                                token,
                                body: { preferences: notificationPreferences },
                              },
                            );
                            if (!response.ok) {
                              apiMessage.error(response.error?.message ?? "Falha ao salvar preferencias.");
                              return;
                            }
                            setNotificationPreferences(response.data?.preferences ?? notificationPreferences);
                            apiMessage.success("Preferencias de notificacao salvas.");
                          }}
                        >
                          Salvar preferencias
                        </TipButton>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "notifications" && (
                  <Card title="Central de notificacoes">
                    <Space style={{ marginBottom: 12 }} wrap>
                      <Tag color={unreadCount > 0 ? "processing" : "default"}>{unreadCount} nao lidas</Tag>
                      <TipButton tip={HELP_TIPS.atualizar} size="small" onClick={() => fetchNotifications().catch(() => undefined)}>
                        Atualizar
                      </TipButton>
                      {unreadCount > 0 ? (
                        <TipButton tip={HELP_TIPS.marcarTodasLidas} size="small" onClick={() => void markAllNotificationsAsRead()}>
                          Marcar todas como lidas
                        </TipButton>
                      ) : null}
                      {isAdmin ? (
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
                      ) : null}
                    </Space>
                    <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                      {notifications.length === 0 ? (
                        <Empty description="Nenhuma notificacao no momento." />
                      ) : null}
                      {notifications.map((item) => (
                        <Card
                          key={item.id}
                          size="small"
                          hoverable
                          onClick={() => void openNotificationItem(item)}
                          style={{ cursor: "pointer" }}
                        >
                          <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                            <Space>
                              <Typography.Text strong={!item.is_read}>{item.title}</Typography.Text>
                              <Tag>{NOTIFICATION_EVENT_LABELS[item.type] ?? item.type}</Tag>
                              <Tag color={item.is_read ? "default" : "processing"}>{item.is_read ? "Lida" : "Nova"}</Tag>
                            </Space>
                            {!item.is_read ? (
                              <Button
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void markNotificationAsRead(item.id);
                                }}
                              >
                                Marcar como lida
                              </Button>
                            ) : null}
                          </Space>
                          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
                            {item.message} - {formatDate(item.created_at)}
                          </Typography.Paragraph>
                          {item.metadata?.breadcrumb ? (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {String(item.metadata.breadcrumb)}
                            </Typography.Text>
                          ) : null}
                        </Card>
                      ))}
                    </Space>
                  </Card>
                )}

                {activeKey === "problems" && isAdmin && token ? (
                  <ProblemReportsPanel token={token} />
                ) : null}

                {activeKey === "agents" && isAdmin && token ? (
                  <AgentsPanel token={token} />
                ) : null}

                {activeKey === "client-requests" && isAdmin && (
                  <Card
                    title="Pedidos de clientes"
                    extra={
                      <Space wrap>
                        <Button
                          onClick={() => {
                            const url =
                              typeof window !== "undefined"
                                ? `${window.location.origin}/pedido`
                                : "/pedido";
                            void navigator.clipboard.writeText(url).then(
                              () => apiMessage.success("Link do formulario copiado."),
                              () => apiMessage.info(url),
                            );
                          }}
                        >
                          Copiar link do formulario
                        </Button>
                        <Button
                          type="default"
                          href="/pedido"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir formulario
                        </Button>
                        <Button loading={clientRequestsLoading} onClick={() => void fetchClientRequestsList()}>
                          Atualizar
                        </Button>
                      </Space>
                    }
                  >
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 16 }}
                      title="Formulario publico"
                      description={
                        <span>
                          Clientes enviam pedidos em{" "}
                          <Typography.Link href="/pedido" target="_blank">
                            {typeof window !== "undefined"
                              ? `${window.location.origin}/pedido`
                              : "/pedido"}
                          </Typography.Link>
                          . Depois voce converte em tarefa neste painel.
                        </span>
                      }
                    />
                    <Table
                      rowKey={(row) => String(row.id ?? row.uuid ?? Math.random())}
                      loading={clientRequestsLoading}
                      dataSource={clientRequests}
                      pagination={{ pageSize: 10 }}
                      locale={{ emptyText: "Nenhum pedido pendente." }}
                      columns={[
                        { title: "Titulo", dataIndex: "title", render: (v: string) => v || "-" },
                        { title: "Cliente", dataIndex: "client_name", render: (v: string) => v || "-" },
                        { title: "Contato", dataIndex: "contact_email", render: (v: string) => v || "-" },
                        {
                          title: "Status",
                          dataIndex: "status",
                          render: (v: string) => renderClientRequestStatusTag(v || "new"),
                        },
                        {
                          title: "Criado em",
                          dataIndex: "created_at",
                          render: (v: string) => formatDate(v),
                        },
                        {
                          title: "Acoes",
                          render: (row: Record<string, unknown>) => {
                            const id = String(row.id ?? "");
                            if (!id) return "-";
                            const converted = String(row.status ?? "") === "converted";
                            return (
                              <Space size={6} wrap>
                                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewRequestModal(row)}>
                                  Visualizar
                                </Button>
                                <Button
                                  type="primary"
                                  size="small"
                                  disabled={converted}
                                  onClick={() => void openConvertRequestModal(row)}
                                >
                                  Converter
                                </Button>
                              </Space>
                            );
                          },
                        },
                      ]}
                    />
                  </Card>
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
                      <Card
                        title="Dashboard de horas (contratado vs consumido)"
                        extra={
                          <Button loading={hoursDashboardLoading} onClick={() => void fetchHoursDashboardData()}>
                            Atualizar
                          </Button>
                        }
                      >
                        <Space wrap style={{ marginBottom: 12 }}>
                          <Select
                            allowClear
                            placeholder="Filtrar cliente"
                            style={{ minWidth: 200 }}
                            value={hoursClientFilter || undefined}
                            onChange={(value) => setHoursClientFilter(value ?? "")}
                            options={clients.map((c) => ({
                              value: String(c.id),
                              label: String(c.name ?? c.id),
                            }))}
                          />
                          <Select
                            allowClear
                            placeholder="Filtrar projeto"
                            style={{ minWidth: 200 }}
                            value={hoursProjectFilter || undefined}
                            onChange={(value) => setHoursProjectFilter(value ?? "")}
                            options={projects.map((p) => ({
                              value: String(p.id),
                              label: String(p.name ?? p.id),
                            }))}
                          />
                          <Select
                            value={hoursPeriodFilter}
                            onChange={(value) => {
                              setHoursPeriodFilter(value);
                              if (value !== "custom") {
                                setHoursDateFrom("");
                                setHoursDateTo("");
                              }
                            }}
                            style={{ minWidth: 220 }}
                            options={[
                              { value: "this_week", label: "Semana (seg–sex)" },
                              { value: "this_month", label: "Total do mes" },
                              { value: "all", label: "Todo o tempo" },
                              { value: "today", label: "Hoje" },
                              { value: "last_7", label: "Ultimos 7 dias" },
                              { value: "last_30", label: "Ultimos 30 dias" },
                              { value: "custom", label: "Periodo personalizado" },
                            ]}
                          />
                          {hoursPeriodFilter === "custom" ? (
                            <>
                              <Input type="date" value={hoursDateFrom} onChange={(e) => setHoursDateFrom(e.target.value)} style={{ width: 150 }} />
                              <Input type="date" value={hoursDateTo} onChange={(e) => setHoursDateTo(e.target.value)} style={{ width: 150 }} />
                            </>
                          ) : null}
                          <Button
                            type="primary"
                            loading={hoursDashboardLoading}
                            onClick={() => void fetchHoursDashboardData()}
                          >
                            Consultar
                          </Button>
                          <Button onClick={() => clearHoursFilters()}>Limpar filtros</Button>
                        </Space>
                        {hoursDashboard ? (
                          <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                              <Statistic
                                title="Horas consumidas"
                                value={decimalHoursToHmText(Number(hoursDashboard.consumed_hours ?? 0))}
                              />
                            </Col>
                            <Col xs={24} md={8}>
                              <Statistic
                                title="Horas contratadas"
                                value={decimalHoursToHmText(Number(hoursDashboard.contracted_hours ?? 0))}
                              />
                            </Col>
                            <Col xs={24} md={8}>
                              <Statistic
                                title="Horas previstas"
                                value={formatEffortHoursDisplay(Number(hoursDashboard.effort_points_total ?? 0))}
                              />
                            </Col>
                            <Col span={24}>
                              <Typography.Text type="secondary">
                                Consumo bruto: {Number(hoursDashboard.consumed_seconds ?? 0)}s
                                {hoursDashboard.contract_amount_total != null
                                  ? ` · Valor linhas contrato: ${Number(hoursDashboard.contract_amount_total)}`
                                  : ""}
                              </Typography.Text>
                            </Col>
                          </Row>
                        ) : (
                          <Typography.Text type="secondary">
                            Sem dados — aplique filtros e consulte.
                          </Typography.Text>
                        )}
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title="Resultado">
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{statsResult ? JSON.stringify(statsResult, null, 2) : "Sem dados"}</pre>
                      </Card>
                    </Col>
                  </Row>
                )}

                {activeKey === "projects" && !selectedProjectId && (
                  <Card title="Projetos">
                    <Space wrap style={{ marginBottom: 16, width: "100%" }}>
                      <Input
                        allowClear
                        placeholder="Buscar projeto ou cliente"
                        value={projectsListSearch}
                        onChange={(event) => setProjectsListSearch(event.target.value)}
                        style={{ width: 260 }}
                      />
                      <Select
                        value={projectsListClientFilter}
                        onChange={setProjectsListClientFilter}
                        style={{ minWidth: 200 }}
                        options={[
                          { value: "all", label: "Todos os clientes" },
                          ...clients.map((c) => ({ value: String(c.id), label: String(c.name ?? c.id) })),
                        ]}
                      />
                      <Select
                        value={projectsListWorkspaceFilter}
                        onChange={setProjectsListWorkspaceFilter}
                        style={{ minWidth: 200 }}
                        options={[
                          { value: "all", label: "Todas as areas" },
                          ...visibleWorkspaces.map((w) => ({
                            value: String(w.id),
                            label: String(w.name ?? w.id),
                          })),
                        ]}
                      />
                      <Button
                        onClick={() => {
                          setProjectsListSearch("");
                          setProjectsListClientFilter("all");
                          setProjectsListWorkspaceFilter("all");
                        }}
                      >
                        Limpar filtros
                      </Button>
                    </Space>
                    <Row gutter={[16, 16]}>
                      {filteredProjectsCards.length === 0 ? (
                        <Col span={24}>
                          <Empty description="Nenhum projeto encontrado com os filtros atuais." />
                        </Col>
                      ) : (
                        filteredProjectsCards.map((project) => {
                          const projectId = String(project.id ?? "");
                          const clientId = project.client_id ? String(project.client_id) : "";
                          const clientName = clientId
                            ? String(clients.find((c) => String(c.id) === clientId)?.name ?? clientId)
                            : "-";
                          const portfolioId = project.portfolio_id ? String(project.portfolio_id) : "";
                          const workspaceId = portfolioId
                            ? String(portfolios.find((p) => String(p.id) === portfolioId)?.workspace_id ?? "")
                            : "";
                          const workspaceName = workspaceId
                            ? String(workspaces.find((w) => String(w.id) === workspaceId)?.name ?? workspaceId)
                            : "-";
                          return (
                            <Col key={projectId} xs={24} sm={12} lg={8} xl={6}>
                              <Card
                                size="small"
                                hoverable
                                onClick={() => selectAccessibleProject(projectId)}
                              >
                                <Space orientation="vertical" size={4}>
                                  <Typography.Text strong>{String(project.name ?? projectId)}</Typography.Text>
                                  <Typography.Text type="secondary">Cliente: {clientName}</Typography.Text>
                                  <Typography.Text type="secondary">Area: {workspaceName}</Typography.Text>
                                </Space>
                              </Card>
                            </Col>
                          );
                        })
                      )}
                    </Row>
                  </Card>
                )}

                {(activeKey === "workspaces" || (activeKey === "projects" && Boolean(selectedProjectId))) && (

                  <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                    <Space wrap align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                      <Space wrap size={4} align="center">
                        {activeKey === "workspaces" ? (
                          <>
                            <Button
                              type="link"
                              onClick={() => {
                                setSelectedWorkspaceId(null);
                                setSelectedPortfolioId(null);
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
                                    setSelectedPortfolioId(null);
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
                            {selectedPortfolio ? (
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
                                  {`Portfolio: ${String(selectedPortfolio.name ?? "Portfolio")}`}
                                </Button>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <Button
                            type="link"
                            onClick={() => {
                              setSelectedWorkspaceId(null);
                              setSelectedPortfolioId(null);
                              setSelectedClientId(null);
                              setSelectedProjectId(null);
                              setSelectedBoardId(null);
                            }}
                            style={{ paddingInline: 0 }}
                          >
                            Projetos
                          </Button>
                        )}
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
                        {activeKey === "workspaces" && !selectedWorkspaceId && isAdmin ? (
                          <HelpTip title={HELP_TIPS.novaArea}>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateWorkspaceOpen(true)}>
                              Nova area de trabalho
                            </Button>
                          </HelpTip>
                        ) : null}
                        {activeKey === "workspaces" && selectedWorkspaceId && !selectedPortfolioId && isAdmin ? (
                          <HelpTip title={HELP_TIPS.novoPortfolio}>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreatePortfolioOpen(true)}>
                              Novo portfolio
                            </Button>
                          </HelpTip>
                        ) : null}
                        {activeKey === "workspaces" && selectedPortfolioId && !selectedProjectId && isAdmin ? (
                          <HelpTip title={HELP_TIPS.novoProjeto}>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateProjectOpen(true)}>
                              Novo projeto
                            </Button>
                          </HelpTip>
                        ) : null}
                        {selectedProjectId && isAdmin ? (
                          <HelpTip title={HELP_TIPS.novoGrupo}>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateBoardOpen(true)}>
                              Novo grupo
                            </Button>
                          </HelpTip>
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

                    {activeKey === "workspaces" && !selectedWorkspaceId && (
                      <Card title="Areas de trabalho">
                        <Space wrap style={{ marginBottom: 16, width: "100%" }}>
                          <Input
                            allowClear
                            placeholder="Buscar area de trabalho"
                            value={workspacesListSearch}
                            onChange={(event) => setWorkspacesListSearch(event.target.value)}
                            style={{ width: 280 }}
                          />
                          <Button onClick={() => setWorkspacesListSearch("")}>Limpar filtro</Button>
                        </Space>
                        {filteredWorkspacesCards.length === 0 ? (
                          <Empty description={isAdmin ? "Nenhuma area de trabalho. Crie a primeira para comecar." : "Voce ainda nao foi adicionado a nenhuma area de trabalho."} />
                        ) : (
                          <Row gutter={[16, 16]}>
                            {filteredWorkspacesCards.map((ws) => {
                              const wsId = String(ws.id);
                              const wsPortfolios = portfoliosForWorkspace(wsId).length;
                              const wsProjects = (projectsByWorkspace[wsId] ?? []).length;
                              return (
                                <Col xs={24} sm={12} lg={8} xl={6} key={wsId}>
                                  <Card
                                    hoverable
                                    onClick={() => {
                                      setSelectedWorkspaceId(wsId);
                                      setSelectedPortfolioId(null);
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
                                          <HelpTip title={HELP_TIPS.sidebarRename}>
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
                                          </HelpTip>
                                          <HelpTip title={HELP_TIPS.sidebarDelete}>
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
                                                      setSelectedPortfolioId(null);
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
                                          </HelpTip>
                                        </Space>
                                      ) : null
                                    }
                                  >
                                    <Space orientation="vertical" size={4}>
                                      <Tag color="processing">{wsPortfolios} portfolios</Tag>
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

                    {activeKey === "workspaces" && selectedWorkspaceId && !selectedPortfolioId && (
                      <Card title={`Portfolios em ${String(selectedWorkspace?.name ?? "")}`}>
                        {portfoliosForWorkspace(selectedWorkspaceId).length === 0 ? (
                          <Empty
                            description={
                              isAdmin
                                ? "Sem portfolios nesta area. Crie o primeiro (ex.: Producao, Financeiro)."
                                : "Sem portfolios vinculados aqui."
                            }
                          />
                        ) : (
                          <Row gutter={[16, 16]}>
                            {portfoliosForWorkspace(selectedWorkspaceId).map((portfolio) => {
                              const portfolioId = String(portfolio.id);
                              const projectsCount = projectsForPortfolio(portfolioId).length;
                              return (
                                <Col xs={24} sm={12} lg={8} xl={6} key={portfolioId}>
                                  <Card
                                    hoverable
                                    onClick={() => {
                                      setSelectedPortfolioId(portfolioId);
                                      setSelectedClientId(null);
                                      setSelectedProjectId(null);
                                      setSelectedBoardId(null);
                                    }}
                                    title={String(portfolio.name ?? "Portfolio")}
                                    extra={
                                      isAdmin ? (
                                        <Space
                                          size={0}
                                          onClick={(event) => event.stopPropagation()}
                                          onMouseDown={(event) => event.stopPropagation()}
                                        >
                                          <HelpTip title={HELP_TIPS.sidebarRename}>
                                            <Button
                                              type="text"
                                              size="small"
                                              icon={<EditOutlined />}
                                              aria-label="Renomear portfolio"
                                              onClick={() =>
                                                openTextInputModal({
                                                  title: "Renomear portfolio",
                                                  initialValue: String(portfolio.name ?? ""),
                                                  placeholder: "Novo nome do portfolio",
                                                  onSubmit: async (nextName) => {
                                                    const response = await apiRequest(`/portfolios/${portfolioId}`, {
                                                      method: "PATCH",
                                                      token,
                                                      body: { name: nextName },
                                                    });
                                                    if (!response.ok) {
                                                      apiMessage.error(
                                                        response.error?.message ?? "Falha ao renomear portfolio.",
                                                      );
                                                      throw new Error("portfolio_rename_failed");
                                                    }
                                                    apiMessage.success("Portfolio atualizado.");
                                                    await fetchCrudData();
                                                  },
                                                })
                                              }
                                            />
                                          </HelpTip>
                                        </Space>
                                      ) : null
                                    }
                                  >
                                    <Space orientation="vertical" size={4}>
                                      <Tag color="purple">{projectsCount} projetos</Tag>
                                      {portfolio.description ? (
                                        <Typography.Text type="secondary">
                                          {String(portfolio.description)}
                                        </Typography.Text>
                                      ) : null}
                                    </Space>
                                  </Card>
                                </Col>
                              );
                            })}
                          </Row>
                        )}
                      </Card>
                    )}

                    {activeKey === "workspaces" && selectedWorkspaceId && selectedPortfolioId && !selectedProjectId && (
                      <Card title={`Projetos em ${String(selectedPortfolio?.name ?? "")}`}>
                        {projectsForPortfolio(selectedPortfolioId).length === 0 ? (
                          <Empty
                            description={
                              isAdmin
                                ? "Sem projetos neste portfolio. Crie o primeiro e vincule um cliente existente."
                                : "Sem projetos vinculados."
                            }
                          />
                        ) : (
                          <Row gutter={[16, 16]}>
                            {projectsForPortfolio(selectedPortfolioId).map((project) => {
                              const projectId = String(project.id);
                              const projectBoards = boardsForProject(projectId).length;
                              const clientId = project.client_id ? String(project.client_id) : "";
                              const clientName = clientId
                                ? String(clients.find((row) => String(row.id) === clientId)?.name ?? "Cliente")
                                : "Sem cliente";
                              const contractLineId = String(project.contract_line_id ?? "");
                              const contractLine = contractLineId ? contractLineById[contractLineId] : undefined;
                              return (
                                <Col xs={24} sm={12} lg={8} xl={6} key={projectId}>
                                  <Card
                                    hoverable
                                    onClick={() => {
                                      setSelectedProjectId(projectId);
                                      if (clientId) setSelectedClientId(clientId);
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
                                          <HelpTip title={HELP_TIPS.sidebarRename}>
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
                                          </HelpTip>
                                          <HelpTip title={HELP_TIPS.sidebarDelete}>
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
                                          </HelpTip>
                                        </Space>
                                      ) : null
                                    }
                                  >
                                    <Space orientation="vertical" size={4}>
                                      <Tag color="gold">{clientName}</Tag>
                                      <Tag color="processing">{projectBoards} grupos</Tag>
                                      <Typography.Text type="secondary">Status: {String(project.status ?? "-")}</Typography.Text>
                                      {contractLine ? (
                                        <>
                                          <Typography.Text type="secondary">
                                            Servico: {String(contractLine.service_name ?? contractLine.service_id ?? "-")}
                                          </Typography.Text>
                                          <Typography.Text type="secondary">
                                            Tipo: {contractLine.service_type === "recurring" ? "Recorrente" : "Avulso"} | Valor:{" "}
                                            {String(contractLine.amount ?? "-")}
                                          </Typography.Text>
                                        </>
                                      ) : (
                                        <Typography.Text type="secondary">Origem: sem contrato vinculado</Typography.Text>
                                      )}
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
                                      aria-label="Como visualizar este grupo"
                                      options={[
                                        { value: "list", label: "Tabela" },
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
                                              placeholder="Selecione o grupo destino"
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
                                            <HelpTip title={HELP_TIPS.moverSelecionadas}>
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
                                            </HelpTip>
                                          </>
                                        ) : null}
                                        {boardViewModeForBoard === "kanban" ? (
                                          <HelpTip title={HELP_TIPS.novaLista}>
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
                                          </HelpTip>
                                        ) : null}
                                        <HelpTip title={HELP_TIPS.excluirGrupo}>
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
                                            Excluir
                                          </Button>
                                        </HelpTip>
                                      </>
                                    ) : null}
                                    <HelpTip title={HELP_TIPS.novaTarefa}>
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
                                    </HelpTip>
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
                                                <Space size={4} wrap>
                                                  <TipButton
                                                    tip={HELP_TIPS.novaTarefa}
                                                    size="small"
                                                    type="text"
                                                    icon={<PlusOutlined />}
                                                    onClick={() => {
                                                      setSelectedBoardId(boardId);
                                                      setComposeBoardId(boardId);
                                                      setKanbanGroups(boardKanban);
                                                      createTaskForm.setFieldsValue({ group_id: column.group.id });
                                                      setCreateTaskOpen(true);
                                                    }}
                                                  >
                                                    Tarefa
                                                  </TipButton>
                                                  {isAdmin ? (
                                                    <>
                                                      <TipButton
                                                        tip={HELP_TIPS.kanbanRenomearLista}
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
                                                      </TipButton>
                                                      <TipButton
                                                        tip={HELP_TIPS.kanbanExcluirLista}
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
                                                      </TipButton>
                                                    </>
                                                  ) : null}
                                                </Space>
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
                                                          <HelpTip title={HELP_TIPS.editar}>
                                                            <Button
                                                              type="text"
                                                              size="small"
                                                              icon={<EditOutlined />}
                                                              aria-label="Editar tarefa"
                                                              onClick={() => openTask(task).catch(() => undefined)}
                                                            />
                                                          </HelpTip>
                                                          <HelpTip title={HELP_TIPS.excluir}>
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
                                                          </HelpTip>
                                                        </Space>
                                                      ) : null
                                                    }
                                                  >
                                                    <Typography.Text strong>{task.title}</Typography.Text>
                                                    {(task.subtasks_count ?? 0) > 0 ? (
                                                      <Tag style={{ marginLeft: 6 }}>{task.subtasks_count} subtarefas</Tag>
                                                    ) : null}
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
                                                      <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 4 }}>
                                                        {renderAssigneeAvatar(task.assignee_id, 26, {
                                                          name: task.assignee_name,
                                                          avatarUrl: task.assignee_avatar_url,
                                                        })}
                                                      </span>
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
                                      size="small"
                                      className="bb-compact-table"
                                      dataSource={boardListTasks}
                                      locale={{ emptyText: "Nenhuma tarefa neste grupo." }}
                                      pagination={{
                                        pageSize: TASK_TABLE_PAGE_SIZE,
                                        current: boardListTablePageByBoardId[boardId] ?? 1,
                                        onChange: (page) =>
                                          setBoardListTablePageByBoardId((prev) => ({
                                            ...prev,
                                            [boardId]: page,
                                          })),
                                      }}
                                      rowSelection={
                                        isAdmin
                                          ? {
                                              selectedRowKeys: selectedTaskIdsByBoardId[boardId] ?? [],
                                              onChange: (selectedRowKeys) =>
                                                setSelectedTaskIdsByBoardId((prev) => ({
                                                  ...prev,
                                                  [boardId]: selectedRowKeys.map((key) => String(key)),
                                                })),
                                            }
                                          : undefined
                                      }
                                      expandable={{
                                        expandedRowKeys: expandedTaskKeysByBoardId[boardId] ?? [],
                                        onExpand: (expanded, record) => {
                                          setExpandedTaskKeysByBoardId((prev) => {
                                            const current = prev[boardId] ?? [];
                                            const nextKeys = expanded
                                              ? Array.from(new Set([...current, record.id]))
                                              : current.filter((key) => key !== record.id);
                                            return { ...prev, [boardId]: nextKeys };
                                          });
                                          if (expanded && !record.parent_id) {
                                            void refreshTaskSubtasks(record.id);
                                          }
                                        },
                                        rowExpandable: (record) =>
                                          !record.parent_id && (record.subtasks_count ?? 0) > 0,
                                        expandedRowRender: (record) => renderExpandableSubtasks(record, false),
                                      }}
                                      onRow={(record) => ({
                                        onClick: () => openTask(record),
                                        style: { cursor: "pointer" },
                                      })}
                                      columns={[
                                        {
                                          title: "Titulo",
                                          dataIndex: "title",
                                          width: 280,
                                          ellipsis: true,
                                          sorter: (a, b) => a.title.localeCompare(b.title),
                                          render: (value: string, record: TaskItem) =>
                                            renderTaskTitleCell(value, record),
                                        },
                                        {
                                          ...assigneeColumn,
                                          sorter: (a: TaskItem, b: TaskItem) =>
                                            String(a.assignee_name ?? a.assignee_id ?? "").localeCompare(
                                              String(b.assignee_name ?? b.assignee_id ?? ""),
                                            ),
                                        },
                                        {
                                          title: "Cliente",
                                          ellipsis: true,
                                          sorter: (a: TaskItem, b: TaskItem) =>
                                            taskContext(a).clientLabel.localeCompare(taskContext(b).clientLabel),
                                          render: (record: TaskItem) => taskContext(record).clientLabel,
                                        },
                                        {
                                          title: "Prioridade",
                                          dataIndex: "priority",
                                          sorter: (a, b) => a.priority.localeCompare(b.priority),
                                          render: (v: string) => renderPriorityTag(v),
                                        },
                                        {
                                          title: "Status",
                                          dataIndex: "status",
                                          sorter: (a, b) => a.status.localeCompare(b.status),
                                          render: (_: string, record: TaskItem) =>
                                            renderEditableStatusTag(record),
                                        },
                                        {
                                          title: "Prazo inicio",
                                          dataIndex: "start_date",
                                          sorter: (a, b) =>
                                            new Date(a.start_date ?? 0).getTime() -
                                            new Date(b.start_date ?? 0).getTime(),
                                          render: (v: string | null) => formatDateOnly(v),
                                        },
                                        {
                                          title: "Prazo fim",
                                          dataIndex: "end_date",
                                          defaultSortOrder: "ascend",
                                          sorter: compareTaskEndDateAsc,
                                          render: (v: string | null) => formatDateOnly(v),
                                        },
                                        {
                                          title: "Tempo",
                                          render: (record: TaskItem) => {
                                            const row = taskTimeSummaryByTaskId[record.id];
                                            if (!row) {
                                              return <Typography.Text type="secondary">—</Typography.Text>;
                                            }
                                            const now = taskTimeTickMs || Date.now();
                                            const display = liveTotalSecondsFromSummary(
                                              row.total_seconds,
                                              row.logs,
                                              row.fetchedAtMs,
                                              now,
                                              currentUserId,
                                            );
                                            const active =
                                              resolveControllableTimeLog(
                                                row.logs,
                                                "active",
                                                currentUserId,
                                                isAdmin,
                                              ) != null;
                                            return (
                                              <Space
                                                size={4}
                                                style={{ whiteSpace: "nowrap", flexWrap: "nowrap" }}
                                                onClick={(event) => event.stopPropagation()}
                                              >
                                                <Typography.Text style={{ whiteSpace: "nowrap" }}>
                                                  {secondsToText(display)}
                                                </Typography.Text>
                                                {active ? (
                                                  <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                                                    Contando
                                                  </Tag>
                                                ) : null}
                                              </Space>
                                            );
                                          },
                                        },
                                        {
                                          title: "Acoes",
                                          render: (record: TaskItem) => {
                                            const row = taskTimeSummaryByTaskId[record.id];
                                            const active =
                                              row != null &&
                                              resolveControllableTimeLog(
                                                row.logs,
                                                "active",
                                                currentUserId,
                                                isAdmin,
                                              ) != null;
                                            const paused =
                                              row != null &&
                                              resolveControllableTimeLog(
                                                row.logs,
                                                "paused",
                                                currentUserId,
                                                isAdmin,
                                              ) != null;
                                            return (
                                              <Space
                                                size={4}
                                                onClick={(event) => event.stopPropagation()}
                                              >
                                                {active ? (
                                                  <TipButton
                                                    tip={HELP_TIPS.timerPausar}
                                                    size="small"
                                                    icon={<PauseCircleOutlined />}
                                                    onClick={() => void quickTaskTimeAction(record, "pause")}
                                                  />
                                                ) : (
                                                  <TipButton
                                                    tip={HELP_TIPS.timerIniciar}
                                                    size="small"
                                                    icon={<PlayCircleOutlined />}
                                                    onClick={() =>
                                                      void quickTaskTimeAction(
                                                        record,
                                                        paused ? "resume" : "start",
                                                      )
                                                    }
                                                  />
                                                )}
                                                <TipButton
                                                  tip="Adicionar subtarefa nesta tarefa"
                                                  size="small"
                                                  icon={<PlusOutlined />}
                                                  onClick={() => openCreateSubtaskModal(record)}
                                                />
                                                <TipButton
                                                  tip={HELP_TIPS.comentarios}
                                                  size="small"
                                                  icon={<CommentOutlined />}
                                                  onClick={() =>
                                                    openTask(record, "comments").catch(() => undefined)
                                                  }
                                                />
                                                {(isAdmin ||
                                                  (currentUserId != null &&
                                                    Number(record.assignee_id) === Number(currentUserId))) && (
                                                  <TipButton
                                                    tip={HELP_TIPS.excluir}
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    onClick={() =>
                                                      openDeleteConfirmModal({
                                                        title:
                                                          (record.subtasks_count ?? 0) > 0
                                                            ? `Excluir esta tarefa e suas ${record.subtasks_count} subtarefas?`
                                                            : "Excluir esta tarefa?",
                                                        onConfirm: async () => {
                                                          const ok = await deleteTaskById(record.id);
                                                          if (!ok) throw new Error("task_delete_failed");
                                                        },
                                                      })
                                                    }
                                                  />
                                                )}
                                              </Space>
                                            );
                                          },
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
        title="Novo portfolio"
        open={createPortfolioOpen}
        onCancel={() => setCreatePortfolioOpen(false)}
        onOk={() => createPortfolioForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
      >
        <Form
          layout="vertical"
          form={createPortfolioForm}
          onFinish={async (values) => {
            if (!selectedWorkspaceId) {
              apiMessage.error("Selecione uma area de trabalho.");
              return;
            }
            const response = await apiRequest<{ portfolio: Record<string, unknown> }>("/portfolios", {
              method: "POST",
              token,
              body: {
                name: values.name,
                description: values.description ?? "",
                workspace_id: selectedWorkspaceId,
              },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao criar portfolio.");
              return;
            }
            const created = response.data?.portfolio as { id?: string } | undefined;
            apiMessage.success("Portfolio criado.");
            await fetchCrudData();
            if (created?.id) {
              setSelectedPortfolioId(String(created.id));
            }
            createPortfolioForm.resetFields();
            setCreatePortfolioOpen(false);
          }}
        >
          <Form.Item
            name="name"
            label="Nome do portfolio"
            rules={[{ required: true, message: "Informe o nome." }, { min: 3 }, { max: 255 }]}
          >
            <Input placeholder="Ex.: Producao, Financeiro, Administrativo" />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={2} placeholder="Opcional" />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            title={`Area de trabalho: ${String(selectedWorkspace?.name ?? "")}`}
            description="Portfolios organizam projetos dentro da area (ex.: setores da agencia)."
          />
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
              body: {
                name: values.name,
                cnpj: String(values.cnpj ?? ""),
                contact_name: String(values.contact_name ?? ""),
                financial_emails: String(values.financial_emails ?? ""),
                description: values.description ?? "",
              },
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
            label="Nome fantasia"
            rules={[{ required: true, message: "Informe o nome." }, { min: 3 }, { max: 255 }]}
          >
            <Input placeholder="Ex.: Cliente Alfa" />
          </Form.Item>
          <Form.Item
            name="cnpj"
            label="CNPJ"
            getValueFromEvent={(event) => maskCnpjInput(event?.target?.value)}
            rules={[
              { required: true, message: "Informe o CNPJ." },
              {
                validator: (_rule, value) => {
                  const digits = String(value ?? "").replace(/\D/g, "");
                  return digits.length === 14
                    ? Promise.resolve()
                    : Promise.reject(new Error("CNPJ deve ter 14 digitos."));
                },
              },
            ]}
          >
            <Input placeholder="Somente numeros ou formatado" />
          </Form.Item>
          <Form.Item
            name="contact_name"
            label="Nome para contato"
            rules={[{ required: true, message: "Informe o nome de contato." }]}
          >
            <Input placeholder="Ex.: Maria Financeiro" />
          </Form.Item>
          <Form.Item
            name="financial_emails"
            label="E-mail financeiro"
            getValueFromEvent={(event) => normalizeFinancialEmailsInput(event?.target?.value)}
            rules={[{ required: true, message: "Informe ao menos um e-mail financeiro." }]}
          >
            <Input placeholder="financeiro@cliente.com;contas@cliente.com" />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            title="Cliente global"
            description="O cliente e cadastrado no catalogo geral. Para aparecer nesta area, vincule-o ao criar um projeto dentro de um portfolio."
          />
        </Form>
      </Modal>

      <Modal
        title={manageClientModal?.mode === "edit" ? "Editar cliente" : "Novo cliente"}
        open={Boolean(manageClientModal)}
        onCancel={() => setManageClientModal(null)}
        onOk={() => manageClientForm.submit()}
        okText={manageClientModal?.mode === "edit" ? "Salvar" : "Criar"}
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Form
          layout="vertical"
          form={manageClientForm}
          onFinish={async (values) => {
            if (manageClientModal?.mode === "edit" && manageClientModal.clientId) {
              const response = await apiRequest(`/clients/${manageClientModal.clientId}`, {
                method: "PATCH",
                token,
                body: {
                  name: values.name,
                  cnpj: String(values.cnpj ?? ""),
                  contact_name: String(values.contact_name ?? ""),
                  financial_emails: String(values.financial_emails ?? ""),
                  description: values.description ?? "",
                },
              });
              if (!response.ok) {
                apiMessage.error(response.error?.message ?? "Falha ao atualizar cliente.");
                return;
              }
              apiMessage.success("Cliente atualizado.");
            } else {
              const response = await apiRequest<{ client?: { id?: string } }>("/clients", {
                method: "POST",
                token,
                body: {
                  name: values.name,
                  cnpj: String(values.cnpj ?? ""),
                  contact_name: String(values.contact_name ?? ""),
                  financial_emails: String(values.financial_emails ?? ""),
                  description: values.description ?? "",
                },
              });
              if (!response.ok) {
                apiMessage.error(response.error?.message ?? "Falha ao criar cliente.");
                return;
              }
              apiMessage.success("Cliente criado.");
              const newClientId = response.data?.client?.id ? String(response.data.client.id) : null;
              if (newClientId && createProjectOpen) {
                createProjectForm.setFieldsValue({ client_id: newClientId });
              }
            }
            setManageClientModal(null);
            manageClientForm.resetFields();
            await fetchCrudData();
          }}
        >
          <Form.Item name="name" label="Nome fantasia" rules={[{ required: true }, { min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="cnpj"
            label="CNPJ"
            getValueFromEvent={(event) => maskCnpjInput(event?.target?.value)}
            rules={[
              { required: true },
              {
                validator: (_rule, value) => {
                  const digits = String(value ?? "").replace(/\D/g, "");
                  return digits.length === 14
                    ? Promise.resolve()
                    : Promise.reject(new Error("CNPJ deve ter 14 digitos."));
                },
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="contact_name" label="Nome para contato" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="financial_emails"
            label="E-mails financeiros"
            getValueFromEvent={(event) => normalizeFinancialEmailsInput(event?.target?.value)}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={manageServiceModal?.mode === "edit" ? "Editar servico" : "Novo servico"}
        open={Boolean(manageServiceModal)}
        onCancel={() => setManageServiceModal(null)}
        onOk={() => manageServiceForm.submit()}
        okText={manageServiceModal?.mode === "edit" ? "Salvar" : "Criar"}
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Form
          layout="vertical"
          form={manageServiceForm}
          initialValues={{ is_active: true, display_order: 100 }}
          onFinish={async (values) => {
            const body = {
              name: String(values.name ?? "").trim(),
              description: String(values.description ?? ""),
              is_active: Boolean(values.is_active),
              display_order: Number(values.display_order ?? 100),
            };
            if (manageServiceModal?.mode === "edit" && manageServiceModal.serviceId) {
              const response = await apiRequest(`/services/${manageServiceModal.serviceId}`, {
                method: "PATCH",
                token,
                body,
              });
              if (!response.ok) {
                apiMessage.error(response.error?.message ?? "Falha ao atualizar servico.");
                return;
              }
              apiMessage.success("Servico atualizado.");
            } else {
              const response = await apiRequest("/services", { method: "POST", token, body });
              if (!response.ok) {
                apiMessage.error(response.error?.message ?? "Falha ao criar servico.");
                return;
              }
              apiMessage.success("Servico criado.");
            }
            setManageServiceModal(null);
            manageServiceForm.resetFields();
            await fetchCrudData();
          }}
        >
          <Form.Item name="name" label="Nome do servico" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="display_order" label="Ordem">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="is_active" label="Ativo">
            <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Detalhes da venda"
        open={Boolean(viewContractData)}
        onCancel={() => setViewContractData(null)}
        footer={[
          <Button key="close" onClick={() => setViewContractData(null)}>
            Fechar
          </Button>,
          viewContractData ? (
            <Button
              key="edit"
              type="primary"
              onClick={() => {
                if (!viewContractData) return;
                editContractForm.setFieldsValue(contractToEditFormValues(viewContractData));
                setEditContractId(viewContractData.id);
                setViewContractData(null);
              }}
            >
              Editar
            </Button>
          ) : null,
        ]}
        width={760}
        destroyOnHidden
      >
        {viewContractData ? (
          <Space orientation="vertical" style={{ width: "100%" }} size="middle">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <Typography.Text type="secondary">Cliente</Typography.Text>
                <div>{viewContractData.client_name ?? viewContractData.client_id}</div>
              </Col>
              <Col xs={24} md={12}>
                <Typography.Text type="secondary">Status</Typography.Text>
                <div>
                  <Tag color={viewContractData.status === "active" ? "success" : "default"}>
                    {viewContractData.status}
                  </Tag>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <Typography.Text type="secondary">Pagamento</Typography.Text>
                <div>
                  {paymentMethodLabel(viewContractData.payment_method)}
                  {viewContractData.payment_other ? ` (${viewContractData.payment_other})` : ""}
                </div>
              </Col>
              <Col xs={24} md={12}>
                <Typography.Text type="secondary">NF / ISS / INSS</Typography.Text>
                <div>
                  NF: {viewContractData.emits_invoice ? "Sim" : "Nao"} | ISS:{" "}
                  {viewContractData.has_iss_retention ? "Sim" : "Nao"} | INSS:{" "}
                  {viewContractData.has_inss_retention ? "Sim" : "Nao"}
                </div>
              </Col>
              {viewContractData.notes ? (
                <Col span={24}>
                  <Typography.Text type="secondary">Observacoes</Typography.Text>
                  <div>{viewContractData.notes}</div>
                </Col>
              ) : null}
              {viewContractData.created_at ? (
                <Col xs={24} md={12}>
                  <Typography.Text type="secondary">Criado em</Typography.Text>
                  <div>{formatDate(viewContractData.created_at)}</div>
                </Col>
              ) : null}
            </Row>
            <Table
              size="small"
              rowKey={contractServiceLineRowKey}
              pagination={false}
              dataSource={viewContractData.service_lines ?? []}
              columns={[
                { title: "Servico", render: (line) => line.service_name ?? line.service_id ?? line.service ?? "-" },
                {
                  title: "Tipo",
                  dataIndex: "service_type",
                  render: (v: string) => (v === "recurring" ? "Recorrente" : "Avulso"),
                },
                { title: "Valor", dataIndex: "amount" },
                {
                  title: "Recorrencia",
                  render: (line) =>
                    line.service_type === "recurring"
                      ? `${line.recurrence ?? "-"}${line.starts_on ? ` (${line.starts_on} - ${line.ends_on ?? "..."})` : ""}`
                      : "-",
                },
                { title: "Obs.", dataIndex: "notes", render: (v: string | undefined) => v || "-" },
              ]}
            />
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="Editar venda"
        open={Boolean(editContractId)}
        onCancel={() => {
          setEditContractId(null);
          editContractForm.resetFields();
        }}
        onOk={() => editContractForm.submit()}
        okText="Salvar"
        cancelText="Cancelar"
        width={900}
        destroyOnHidden
      >
        <Form
          layout="vertical"
          form={editContractForm}
          onFinish={async (values) => {
            if (!editContractId) return;
            const body = buildContractPatchBody(values as Record<string, unknown>);
            if (!body.service_lines.length) {
              apiMessage.error("Informe ao menos um servico.");
              return;
            }
            if (body.service_lines.some((line) => !line.service)) {
              apiMessage.error("Selecione o servico em todas as linhas.");
              return;
            }
            const response = await apiRequest(`/contracts/${editContractId}`, {
              method: "PATCH",
              token,
              body,
            });
            if (!response.ok) {
              apiMessage.error(extractApiErrorMessage(response.error, "Falha ao atualizar venda."));
              return;
            }
            apiMessage.success("Venda atualizada.");
            setEditContractId(null);
            editContractForm.resetFields();
            await fetchCrudData();
          }}
        >
          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <Form.Item name="emits_invoice" label="Emissao de NF?">
                <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="has_iss_retention" label="Retencao ISS (imposto sobre servicos)?">
                <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="has_inss_retention" label="Retencao INSS (previdencia)?">
                <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="payment_method" label="Forma de pagamento" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "boleto", label: "Boleto" },
                    { value: "transfer", label: "Transferencia" },
                    { value: "pix", label: "PIX" },
                    { value: "other", label: "Outro" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
              {({ getFieldValue }) =>
                getFieldValue("payment_method") === "other" ? (
                  <Col xs={24} md={12}>
                    <Form.Item name="payment_other" label="Detalhe do pagamento" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                ) : null
              }
            </Form.Item>
            <Col span={24}>
              <Form.Item name="notes" label="Observacoes">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Divider>Servicos</Divider>
          <Form.List name="service_lines">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" style={{ width: "100%" }}>
                {fields.map((field, index) => (
                  <Card key={field.key} type="inner" title={`Servico ${index + 1}`}>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Form.Item name={[field.name, "service"]} label="Servico" rules={[{ required: true }]}>
                          <Select
                            showSearch
                            optionFilterProp="label"
                            options={serviceCatalog.map((item) => ({
                              value: item.id,
                              label: item.name,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name={[field.name, "service_type"]} label="Tipo" rules={[{ required: true }]}>
                          <Select
                            options={[
                              { value: "one_off", label: "Avulso" },
                              { value: "recurring", label: "Recorrente" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name={[field.name, "amount"]} label="Valor" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name={[field.name, "notes"]} label="Observacoes">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) =>
                          getFieldValue(["service_lines", field.name, "service_type"]) === "recurring" ? (
                            <>
                              <Col xs={24} md={12}>
                                <Form.Item name={[field.name, "starts_on"]} label="Inicio (YYYY-MM-DD)">
                                  <Input />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item name={[field.name, "ends_on"]} label="Fim (YYYY-MM-DD)">
                                  <Input />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item name={[field.name, "recurrence"]} label="Periodicidade">
                                  <Select
                                    options={[
                                      { value: "monthly", label: "Mensal" },
                                      { value: "bimonthly", label: "Bimestral" },
                                      { value: "quarterly", label: "Trimestral" },
                                      { value: "semiannual", label: "Semestral" },
                                      { value: "other", label: "Outro" },
                                    ]}
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item name={[field.name, "recurrence_other"]} label="Recorrencia customizada">
                                  <Input />
                                </Form.Item>
                              </Col>
                            </>
                          ) : null
                        }
                      </Form.Item>
                    </Row>
                    <Button danger onClick={() => remove(field.name)}>
                      Remover servico
                    </Button>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add({ service_type: "one_off", amount: "0.00" })} icon={<PlusOutlined />}>
                  Adicionar servico
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="Nova venda"
        open={newSaleWizardOpen}
        onCancel={() => {
          setNewSaleWizardOpen(false);
          setNewSaleWizardStep(0);
        }}
        width={900}
        footer={null}
      >
        <Steps
          size="small"
          current={newSaleWizardStep}
          items={[
            { title: "Cliente" },
            { title: "Servicos" },
            { title: "Financeiro" },
            { title: "Recorrencia" },
            { title: "Revisao" },
          ]}
          style={{ marginBottom: 16 }}
        />
        <Form
          layout="vertical"
          form={newSaleWizardForm}
          initialValues={{
            use_existing_client: false,
            emits_invoice: true,
            has_iss_retention: false,
            has_inss_retention: false,
            payment_method: "boleto",
            service_lines: [{ service_type: "one_off", amount: "0.00" }],
          }}
          onValuesChange={(_, allValues) => {
            newSaleWizardValuesRef.current = allValues as Record<string, unknown>;
          }}
          onFinish={async () => {
            const values = {
              ...newSaleWizardValuesRef.current,
              ...newSaleWizardForm.getFieldsValue(true),
            } as Record<string, unknown>;
            const validation = buildNewSaleWizardValidation(values, clients, serviceCatalog);
            if (!validation.ok) {
              apiMessage.error(validation.errors.join(" "));
              return;
            }

            let clientId = validation.clientId;
            if (!validation.useExistingClient) {
              const createClientResp = await apiRequest<{ client: { id: string } }>("/clients", {
                method: "POST",
                token,
                body: {
                  name: String(values.name ?? "").trim(),
                  cnpj: String(values.cnpj ?? ""),
                  contact_name: String(values.contact_name ?? "").trim(),
                  financial_emails: String(values.financial_emails ?? "").trim(),
                  description: String(values.description ?? "").trim(),
                },
              });
              if (!createClientResp.ok || !createClientResp.data?.client?.id) {
                apiMessage.error(extractApiErrorMessage(createClientResp.error, "Falha ao criar cliente."));
                return;
              }
              clientId = String(createClientResp.data.client.id).trim();
            }
            if (!clientId) {
              apiMessage.error("Cliente obrigatorio para continuar.");
              return;
            }

            const paymentMethod = validation.paymentMethod;
            const lines = validation.lines;
            const contractResp = await apiRequest<{ contract: { id: string } }>("/contracts", {
              method: "POST",
              token,
              body: {
                client: clientId,
                emits_invoice: Boolean(values.emits_invoice),
                has_iss_retention: Boolean(values.has_iss_retention),
                has_inss_retention: Boolean(values.has_inss_retention),
                payment_method: paymentMethod,
                payment_other: paymentMethod === "other" ? String(values.payment_other ?? "").trim() : "",
                status: "submitted",
                notes: String(values.notes ?? "").trim(),
                service_lines: lines,
              },
            });
            if (!contractResp.ok || !contractResp.data?.contract?.id) {
              apiMessage.error(extractApiErrorMessage(contractResp.error, "Falha ao criar contrato."));
              return;
            }
            const confirmResp = await apiRequest(`/contracts/${contractResp.data.contract.id}/confirm`, {
              method: "POST",
              token,
              body: {},
            });
            if (!confirmResp.ok) {
              apiMessage.error(extractApiErrorMessage(confirmResp.error, "Contrato criado, mas falhou ao confirmar."));
              return;
            }
            apiMessage.success("Venda confirmada. Estrutura operacional criada automaticamente.");
            await fetchCrudData();
            setNewSaleWizardOpen(false);
            setNewSaleWizardStep(0);
            newSaleWizardForm.resetFields();
          }}
        >
          <div style={{ display: newSaleWizardStep === 0 ? "block" : "none" }}>
            <Row gutter={[12, 12]}>
              <Col span={24}>
                <Form.Item name="use_existing_client" label="Cliente existente?">
                  <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
                </Form.Item>
              </Col>
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.use_existing_client !== curr.use_existing_client}>
                {({ getFieldValue }) =>
                  isUseExistingClient(getFieldValue("use_existing_client")) ? (
                    <Col span={24}>
                      <Form.Item name="existing_client_id" label="Cliente" rules={[{ required: true }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={clients.map((row) => ({
                            value: String(row.id),
                            label: `${String(row.name ?? row.id)} (${String((row as { cnpj?: string }).cnpj ?? "sem cnpj")})`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                  ) : (
                    <>
                      <Col xs={24} md={12}>
                        <Form.Item name="name" label="Nome fantasia" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="cnpj"
                          label="CNPJ"
                          getValueFromEvent={(event) => maskCnpjInput(event?.target?.value)}
                          rules={[
                            { required: true, message: "Informe o CNPJ." },
                            {
                              validator: (_rule, value) => {
                                const digits = String(value ?? "").replace(/\D/g, "");
                                return digits.length === 14
                                  ? Promise.resolve()
                                  : Promise.reject(new Error("CNPJ deve ter 14 digitos."));
                              },
                            },
                          ]}
                        >
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="contact_name" label="Nome para contato" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="financial_emails"
                          label="E-mail financeiro"
                          getValueFromEvent={(event) => normalizeFinancialEmailsInput(event?.target?.value)}
                          rules={[{ required: true }]}
                        >
                          <Input />
                        </Form.Item>
                      </Col>
                    </>
                  )
                }
              </Form.Item>
            </Row>
          </div>

          <div style={{ display: newSaleWizardStep === 1 || newSaleWizardStep === 3 ? "block" : "none" }} aria-hidden={newSaleWizardStep !== 1 && newSaleWizardStep !== 3}>
            <Form.List name="service_lines">
              {(fields, { add, remove }) => (
                <Space orientation="vertical" style={{ width: "100%" }}>
                  {fields.map((field, index) => (
                    <Card
                      key={field.key}
                      type="inner"
                      title={newSaleWizardStep === 3 ? "Recorrencia por servico" : `Servico ${index + 1}`}
                    >
                      <div style={{ display: newSaleWizardStep === 1 ? "block" : "none" }}>
                        <Row gutter={[12, 12]}>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, "service"]} label="Servico" rules={[{ required: true }]}>
                              <Select
                                showSearch
                                optionFilterProp="label"
                                options={serviceCatalog
                                  .filter((item) => item.is_active)
                                  .map((item) => ({ value: item.id, label: item.name }))}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, "service_type"]} label="Tipo" rules={[{ required: true }]}>
                              <Select
                                options={[
                                  { value: "one_off", label: "Avulso" },
                                  { value: "recurring", label: "Recorrente" },
                                ]}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, "amount"]} label="Valor por servico" rules={[{ required: true }]}>
                              <Input />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, "notes"]} label="Observacoes">
                              <Input />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Button danger onClick={() => remove(field.name)}>
                          Remover servico
                        </Button>
                      </div>
                      <div style={{ display: newSaleWizardStep === 3 ? "block" : "none" }}>
                        <Form.Item noStyle shouldUpdate>
                          {({ getFieldValue }) =>
                            getFieldValue(["service_lines", field.name, "service_type"]) === "recurring" ? (
                              <Row gutter={[12, 12]}>
                                <Col xs={24} md={12}>
                                  <Form.Item name={[field.name, "starts_on"]} label="Inicio vigencia (YYYY-MM-DD)">
                                    <Input />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                  <Form.Item name={[field.name, "ends_on"]} label="Fim vigencia (YYYY-MM-DD)">
                                    <Input />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                  <Form.Item name={[field.name, "recurrence"]} label="Periodicidade">
                                    <Select
                                      options={[
                                        { value: "monthly", label: "Mensal" },
                                        { value: "bimonthly", label: "Bimestral" },
                                        { value: "quarterly", label: "Trimestral" },
                                        { value: "semiannual", label: "Semestral" },
                                        { value: "other", label: "Outro" },
                                      ]}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                  <Form.Item name={[field.name, "recurrence_other"]} label="Recorrencia customizada">
                                    <Input />
                                  </Form.Item>
                                </Col>
                              </Row>
                            ) : (
                              <Alert type="info" showIcon title="Servico avulso: sem campos extras de recorrencia." />
                            )
                          }
                        </Form.Item>
                      </div>
                    </Card>
                  ))}
                  {newSaleWizardStep === 1 ? (
                    <Button onClick={() => add({ service_type: "one_off", amount: "0.00" })}>Adicionar servico</Button>
                  ) : null}
                </Space>
              )}
            </Form.List>
          </div>

          <div style={{ display: newSaleWizardStep === 2 ? "block" : "none" }}>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <Form.Item name="emits_invoice" label="Havera emissao de NF?">
                  <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="payment_method" label="Forma de pagamento" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: "boleto", label: "Boleto" },
                      { value: "transfer", label: "Transferencia" },
                      { value: "pix", label: "PIX" },
                      { value: "other", label: "Outro" },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.payment_method !== curr.payment_method}>
                {({ getFieldValue }) =>
                  getFieldValue("payment_method") === "other" ? (
                    <Col xs={24} md={12}>
                      <Form.Item name="payment_other" label="Qual forma de pagamento?" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  ) : null
                }
              </Form.Item>
              <Col xs={24} md={12}>
                <Form.Item name="has_iss_retention" label="Retencao de ISS (imposto sobre servicos)?">
                  <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="has_inss_retention" label="Retencao de INSS (previdencia)?">
                  <Select options={[{ value: true, label: "Sim" }, { value: false, label: "Nao" }]} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="notes" label="Observacoes gerais">
                  <Input.TextArea rows={3} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <div style={{ display: newSaleWizardStep === 4 ? "block" : "none" }}>
            <Form.Item noStyle shouldUpdate>
              {() => {
                const values = {
                  ...newSaleWizardValuesRef.current,
                  ...newSaleWizardForm.getFieldsValue(true),
                } as Record<string, unknown>;
                const validation = buildNewSaleWizardValidation(values, clients, serviceCatalog);
                return (
                  <Space orientation="vertical" style={{ width: "100%" }} size={12}>
                    <Alert
                      type={validation.ok ? "success" : "warning"}
                      showIcon
                      title="Revisao final"
                      description="Confira os dados abaixo antes de confirmar. O sistema cria o contrato e gera automaticamente area, portfolio e projetos vinculados."
                    />
                    <Card type="inner" title="Resumo da venda">
                      <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                        <Typography.Text>
                          <strong>Cliente:</strong> {validation.clientLabel}
                          {validation.useExistingClient ? " (existente)" : " (novo)"}
                        </Typography.Text>
                        <Typography.Text>
                          <strong>Pagamento:</strong> {validation.paymentLabel}
                        </Typography.Text>
                        <Typography.Text>
                          <strong>NF:</strong> {values.emits_invoice ? "Sim" : "Nao"} | <strong>ISS:</strong>{" "}
                          {values.has_iss_retention ? "Sim" : "Nao"} | <strong>INSS:</strong>{" "}
                          {values.has_inss_retention ? "Sim" : "Nao"}
                        </Typography.Text>
                        <Typography.Text strong>Servicos:</Typography.Text>
                        {validation.serviceSummaries.length === 0 ? (
                          <Typography.Text type="secondary">Nenhum servico selecionado.</Typography.Text>
                        ) : (
                          validation.serviceSummaries.map((line, index) => (
                            <Typography.Text key={`${line.name}-${index}`}>
                              - {line.name} ({line.type}) — R$ {line.amount}
                            </Typography.Text>
                          ))
                        )}
                      </Space>
                    </Card>
                    {!validation.ok ? (
                      <Alert
                        type="error"
                        showIcon
                        title="Campos obrigatorios pendentes"
                        description={
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {validation.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        }
                      />
                    ) : (
                      <Alert type="success" showIcon title="Tudo certo para confirmar a venda." />
                    )}
                  </Space>
                );
              }}
            </Form.Item>
          </div>

          <Divider />
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Button
              disabled={newSaleWizardStep === 0}
              onClick={() => setNewSaleWizardStep((prev) => Math.max(prev - 1, 0))}
            >
              Voltar
            </Button>
            {newSaleWizardStep < 4 ? (
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    if (newSaleWizardStep === 0) {
                      const useExisting = isUseExistingClient(newSaleWizardForm.getFieldValue("use_existing_client"));
                      if (useExisting) {
                        await newSaleWizardForm.validateFields(["existing_client_id"]);
                      } else {
                        await newSaleWizardForm.validateFields([
                          "name",
                          "cnpj",
                          "contact_name",
                          "financial_emails",
                        ]);
                      }
                    } else if (newSaleWizardStep === 1) {
                      await newSaleWizardForm.validateFields(["service_lines"]);
                      const lines = (newSaleWizardForm.getFieldValue("service_lines") as Array<Record<string, unknown>>) ?? [];
                      const selected = lines.filter((line) => String(line?.service ?? "").trim().length > 0);
                      if (selected.length === 0) {
                        apiMessage.error("Selecione ao menos um servico para continuar.");
                        return;
                      }
                    } else if (newSaleWizardStep === 2) {
                      await newSaleWizardForm.validateFields([
                        "emits_invoice",
                        "payment_method",
                        "has_iss_retention",
                        "has_inss_retention",
                      ]);
                      if (newSaleWizardForm.getFieldValue("payment_method") === "other") {
                        await newSaleWizardForm.validateFields(["payment_other"]);
                      }
                    } else if (newSaleWizardStep === 3) {
                      const lines = (newSaleWizardForm.getFieldValue("service_lines") as Array<Record<string, unknown>>) ?? [];
                      const invalidRecurring = lines.find((line) => {
                        if (String(line?.service_type ?? "") !== "recurring") return false;
                        return !String(line?.recurrence ?? "").trim() || !String(line?.starts_on ?? "").trim();
                      });
                      if (invalidRecurring) {
                        apiMessage.error("Preencha recorrencia e inicio de vigencia para todos os servicos recorrentes.");
                        return;
                      }
                    }
                    setNewSaleWizardStep((prev) => Math.min(prev + 1, 4));
                  } catch {
                    // validation errors already shown in form
                  }
                }}
              >
                Proxima etapa
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={async () => {
                  const values = {
                    ...newSaleWizardValuesRef.current,
                    ...newSaleWizardForm.getFieldsValue(true),
                  } as Record<string, unknown>;
                  const validation = buildNewSaleWizardValidation(values, clients, serviceCatalog);
                  if (!validation.ok) {
                    apiMessage.error(validation.errors.join(" "));
                    return;
                  }
                  newSaleWizardForm.submit();
                }}
              >
                Confirmar e criar venda
              </Button>
            )}
          </Space>
        </Form>
      </Modal>

      <Modal
        title="Novo projeto"
        open={createProjectOpen}
        onCancel={() => setCreateProjectOpen(false)}
        onOk={() => createProjectForm.submit()}
        okText="Criar"
        cancelText="Cancelar"
        afterOpenChange={(open) => {
          if (!open) return;
          createProjectForm.setFieldsValue({
            portfolio_id: selectedPortfolioId ?? undefined,
            client_id: undefined,
          });
        }}
      >
        <Form
          layout="vertical"
          form={createProjectForm}
          onFinish={async (values) => {
            const portfolioId = String(values.portfolio_id ?? selectedPortfolioId ?? "");
            const clientId = String(values.client_id ?? "");
            if (!portfolioId) {
              apiMessage.error("Selecione um portfolio.");
              return;
            }
            if (!clientId) {
              apiMessage.error("Selecione um cliente existente ou cadastre um em Administracao > Clientes.");
              return;
            }
            const response = await apiRequest<{ project: Record<string, unknown> }>("/projects", {
              method: "POST",
              token,
              body: {
                name: values.name,
                portfolio_id: portfolioId,
                client_id: clientId,
              },
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao criar projeto.");
              return;
            }
            const created = response.data?.project as { id?: string; portfolio_id?: string; client_id?: string } | undefined;
            apiMessage.success("Projeto criado.");
            await fetchCrudData();
            if (created?.portfolio_id) setSelectedPortfolioId(String(created.portfolio_id));
            if (created?.client_id) setSelectedClientId(String(created.client_id));
            if (created?.id) {
              setSelectedProjectId(String(created.id));
            }
            createProjectForm.resetFields();
            setCreateProjectOpen(false);
          }}
        >
          <Form.Item
            name="portfolio_id"
            label="Portfolio"
            rules={[{ required: true, message: "Selecione o portfolio." }]}
          >
            <Select
              placeholder="Escolha o portfolio"
              options={portfoliosForWorkspace(selectedWorkspaceId ?? "").map((portfolio) => ({
                value: String(portfolio.id),
                label: String(portfolio.name ?? "Portfolio"),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="client_id"
            label="Cliente (existente)"
            rules={[{ required: true, message: "Selecione um cliente." }]}
            extra={
              isAdmin ? (
                <Button type="link" size="small" onClick={() => setManageClientModal({ mode: "create" })} style={{ padding: 0 }}>
                  Cadastrar novo cliente
                </Button>
              ) : undefined
            }
          >
            <Select
              showSearch
              placeholder="Vincule um cliente ja cadastrado"
              filterOption={(input, option) =>
                String(option?.label ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              options={clients.map((client) => ({
                value: String(client.id),
                label: String(client.name ?? client.id),
              }))}
            />
          </Form.Item>
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
            title={`Area: ${String(selectedWorkspace?.name ?? "-")}`}
            description="Projetos ficam dentro do portfolio e vinculam o cliente escolhido."
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
            tooltip={HELP_TIPS.novoGrupo}
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
          <Form.Item
            name="name"
            label="Nome"
            tooltip="Nome da coluna onde as tarefas serao organizadas (ex.: Em andamento, Revisao)."
            rules={[{ required: true, message: "Informe o nome da lista." }]}
          >
            <Input placeholder="Ex.: Em andamento" />
          </Form.Item>
          <Form.Item
            name="wip_limit"
            label="Limite WIP"
            tooltip={HELP_TIPS.limiteWip}
            rules={[{ required: true }]}
          >
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
            const targetBoardId =
              composeBoardId ??
              (values.board_id ? String(values.board_id) : null) ??
              selectedBoardId;
            const targetBoard = boards.find((board) => board.id === targetBoardId) ?? null;
            if (!targetBoardId || !targetBoard?.project_id) {
              apiMessage.error("Selecione um grupo (board) valido.");
              return;
            }
            let groupId = String(values.group_id ?? "");
            if (!groupId) {
              const options = await ensureDefaultGroupForBoard(targetBoardId);
              groupId = options[0]?.value ?? "";
            }
            if (!groupId) {
              apiMessage.error("Nao foi possivel preparar o grupo para criar a tarefa.");
              return;
            }
            const ok = await createTask({
              ...values,
              group_id: groupId,
              effort_points: values.effort_points ?? 1,
              end_date: fromDatetimeLocalValue(values.end_date),
              project_id: targetBoard.project_id,
            });
            if (ok) {
              const createdView = boardViewModeByBoardId[targetBoardId] ?? "list";
              await fetchKanbanForBoard(targetBoardId, createdView).catch(() => undefined);
              if (isAdmin) await fetchAllTasks().catch(() => undefined);
              createTaskForm.resetFields();
              setCreateTaskOpen(false);
              setComposeBoardId(null);
            }
          }}
        >
          <Row gutter={[12, 0]}>
            {!composeBoardId ? (
              <Col xs={24}>
                <Form.Item
                  name="board_id"
                  label="Projeto / grupo (board)"
                  rules={[{ required: true, message: "Selecione o board da tarefa." }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Escolha onde criar a tarefa"
                    options={boards.map((board) => {
                      const project = projects.find((p) => String(p.id) === String(board.project_id));
                      const projectName = String(project?.name ?? board.project_id ?? "Projeto");
                      return {
                        value: board.id,
                        label: `${projectName} · ${board.name}`,
                      };
                    })}
                    onChange={async (boardId: string) => {
                      createTaskForm.setFieldsValue({ board_id: boardId, group_id: undefined });
                      const options = await ensureDefaultGroupForBoard(boardId);
                      if (options[0]) {
                        createTaskForm.setFieldsValue({ group_id: options[0].value });
                      }
                    }}
                  />
                </Form.Item>
              </Col>
            ) : null}
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
            <Form.Item name="group_id" hidden>
              <Input />
            </Form.Item>
            <Col xs={24} md={12}>
              <Form.Item name="priority" label="Prioridade">
                <Select
                  options={[
                    { value: "low", label: "Baixa" },
                    { value: "medium", label: "Média" },
                    { value: "high", label: "Alta" },
                    { value: "critical", label: "Crítica" },
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
                    const src = resolveMediaUrl(u.avatar_url ?? null);
                    return {
                      value: u.id,
                      label: (
                        <Space size={8}>
                          <Avatar size="small" src={src || undefined} style={src ? undefined : undefined}>
                            {src ? null : initial}
                          </Avatar>
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

      <Modal
        title={
          createSubtaskParent
            ? `Nova subtarefa em: ${createSubtaskParent.title}`
            : "Nova subtarefa"
        }
        open={createSubtaskOpen}
        confirmLoading={subtaskSaving}
        onCancel={() => {
          setCreateSubtaskOpen(false);
          setCreateSubtaskParent(null);
          createSubtaskForm.resetFields();
        }}
        onOk={() => createSubtaskForm.submit()}
        okText="Criar subtarefa"
        cancelText="Cancelar"
        width={640}
        destroyOnHidden={false}
      >
        <Form
          layout="vertical"
          form={createSubtaskForm}
          initialValues={{ priority: "medium", status: "todo", effort_points: 1 }}
          onFinish={(values) => void submitCreateSubtask(values)}
        >
          <Row gutter={[12, 0]}>
            <Col xs={24}>
              <Form.Item
                name="title"
                label="Titulo"
                rules={[{ required: true, message: "Informe o titulo." }, { min: 2 }]}
              >
                <Input placeholder="Ex.: page views e sessoes por usuario" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="description" label="Descricao">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="priority" label="Prioridade">
                <Select
                  options={[
                    { value: "low", label: "Baixa" },
                    { value: "medium", label: "Média" },
                    { value: "high", label: "Alta" },
                    { value: "critical", label: "Crítica" },
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
                    const initial = (u.name?.trim()?.[0] || u.email?.[0] || "?").toUpperCase();
                    return {
                      value: u.id,
                      label: u.name,
                      title: `${u.name} <${u.email}>`,
                      searchLabel: `${u.name} ${u.email}`,
                      children: (
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
              <Form.Item name="start_date" label="Prazo inicio">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="end_date" label="Prazo final">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={
          selectedTask
            ? selectedTask.parent_id
              ? `Subtarefa: ${selectedTask.title}`
              : `Tarefa: ${selectedTask.title}`
            : "Tarefa"
        }
        extra={
          selectedTask ? (
            <Button
              size="small"
              icon={<LinkOutlined />}
              onClick={() => void copyTaskDeepLink(selectedTask.id)}
            >
              Copiar link
            </Button>
          ) : null
        }
        open={Boolean(selectedTask)}
        onClose={() => {
          setSelectedTask(null);
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", `#${activeKey}`);
          }
        }}
        size="large"
        footer={
          selectedTask &&
          (isAdmin ||
            selectedTask.assignee_id == null ||
            (currentUserId !== null && selectedTask.assignee_id === currentUserId)) ? (
            <Button type="primary" block size="large" onClick={() => taskDetailsForm.submit()}>
              Salvar
            </Button>
          ) : null
        }
      >
        {selectedTask && (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Card
              size="small"
              title="Resumo"
              extra={
                <TipButton
                  tip={HELP_TIPS.seguirTarefa}
                  size="small"
                  type={watchedTaskIds.has(selectedTask.id) ? "primary" : "default"}
                  onClick={() => void toggleTaskWatch(selectedTask.id, watchedTaskIds.has(selectedTask.id))}
                >
                  {watchedTaskIds.has(selectedTask.id) ? "Seguindo" : "Seguir tarefa"}
                </TipButton>
              }
            >
              <Row gutter={[16, 14]}>
                <Col xs={12} sm={8}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                    Status
                  </Typography.Text>
                  {renderStatusTag(selectedTask.status)}
                </Col>
                <Col xs={12} sm={8}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                    Prioridade
                  </Typography.Text>
                  {renderPriorityTag(selectedTask.priority)}
                </Col>
                <Col xs={12} sm={8}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                    Esforco
                  </Typography.Text>
                  <Tag color="purple">{formatEffortHoursDisplay(selectedTask.effort_points)}</Tag>
                </Col>
                <Col xs={12} sm={8}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                    Responsavel
                  </Typography.Text>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {renderAssigneeAvatar(selectedTask.assignee_id, 24, {
                      name: selectedTask.assignee_name,
                      avatarUrl: selectedTask.assignee_avatar_url,
                    })}
                    <Typography.Text ellipsis style={{ maxWidth: 140 }}>
                      {(() => {
                        const sid = selectedTask.assignee_id;
                        if (sid == null) return "Sem responsavel";
                        if (String(selectedTask.assignee_name ?? "").trim()) return selectedTask.assignee_name;
                        const opt = taskAssigneePickList.find((u) => u.id === sid);
                        return opt ? opt.name : `Usuario ${sid}`;
                      })()}
                    </Typography.Text>
                  </span>
                </Col>
                <Col xs={24} sm={16}>
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                    Prazo
                  </Typography.Text>
                  <span
                    className="bb-monday-date-pill"
                    title={`${formatDateOnly(selectedTask.start_date)} → ${formatDateOnly(selectedTask.end_date)}`}
                  >
                    {formatMondayDateRange(selectedTask.start_date, selectedTask.end_date)}
                  </span>
                </Col>
              </Row>
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
                <TipButton
                  tip={HELP_TIPS.timerIniciar}
                  icon={<PlayCircleOutlined />}
                  type={activeTimeLog ? "default" : "primary"}
                  disabled={Boolean(activeTimeLog)}
                  onClick={() => taskAction(`/tasks/${selectedTask.id}/time/start`, "POST", {})}
                >
                  Iniciar
                </TipButton>
                <TipButton
                  tip={HELP_TIPS.timerPausar}
                  icon={<PauseCircleOutlined />}
                  disabled={!activeTimeLog}
                  onClick={() => taskAction(`/tasks/${selectedTask.id}/time/pause`, "POST", {})}
                >
                  Pausar
                </TipButton>
                <TipButton
                  tip={HELP_TIPS.timerRetomar}
                  icon={<PlayCircleOutlined />}
                  disabled={!pausedTimeLog}
                  onClick={() => taskAction(`/tasks/${selectedTask.id}/time/resume`, "POST", {})}
                >
                  Retomar
                </TipButton>
                <TipButton
                  tip={HELP_TIPS.timerConcluir}
                  icon={<CheckCircleOutlined />}
                  type="primary"
                  disabled={selectedTask.status === "done"}
                  onClick={() => taskAction(`/tasks/${selectedTask.id}/complete`, "POST", {})}
                >
                  Concluir
                </TipButton>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => {
                    manualTimeForm.resetFields();
                    setManualTimeModalOpen(true);
                  }}
                >
                  Tempo manual
                </Button>
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                Tempo manual: informe data/hora de inicio e fim de uma sessao ja trabalhada (aparece em vermelho nos registros).
              </Typography.Paragraph>
              <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0 }}>
                Sessao ativa: {activeTimeLog ? "sim" : "nao"}
                {activeTimeLog &&
                currentUserId != null &&
                Number(activeTimeLog.user_id) !== Number(currentUserId)
                  ? " (outro usuario)"
                  : ""}{" "}
                | Sessao pausada: {pausedTimeLog ? "sim" : "nao"}
                {pausedTimeLog &&
                currentUserId != null &&
                Number(pausedTimeLog.user_id) !== Number(currentUserId)
                  ? " (outro usuario)"
                  : ""}
              </Typography.Paragraph>
            </Card>

            <Card size="small" title="Editar tarefa">
                <Form
                  key={`task-edit-${selectedTask.id}-${selectedTask.updated_at ?? ""}`}
                  form={taskDetailsForm}
                  layout="vertical"
                  initialValues={{
                    title: selectedTask.title,
                    description: selectedTask.description ?? "",
                    status: selectedTask.status,
                    priority: selectedTask.priority,
                    effort_points: selectedTask.effort_points,
                    assignee_id: selectedTask.assignee_id ?? undefined,
                    start_date: toDateInputValue(selectedTask.start_date) || undefined,
                    end_date: toDateInputValue(selectedTask.end_date) || undefined,
                    is_recurring: Boolean(selectedTask.is_recurring),
                    recurrence_frequency: selectedTask.recurrence_frequency || undefined,
                  }}
                  onFinish={(values) => void saveTaskDrawerFields(values)}
                >
                  <Form.Item label="Titulo" name="title" rules={[{ required: true, message: "Informe o titulo." }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="Descricao" name="description">
                    <RichDescriptionField
                      key={`desc-${selectedTask.id}`}
                      placeholder="Descreva a tarefa... Digite @ para mencionar"
                      mentionOptions={mondayMentionOptions}
                      draftKey={descriptionDraftKey}
                      onUploadImage={uploadImageForComposer}
                    />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Status" name="status" rules={[{ required: true }]}>
                        <Select options={statusOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Responsavel" name="assignee_id">
                        <Select
                          allowClear
                          placeholder="Sem responsavel"
                          showSearch
                          filterOption={(input, option) => {
                            const id = Number(option?.value ?? NaN);
                            const row = taskAssigneePickList.find((u) => u.id === id);
                            const haystack = `${row?.name ?? ""} ${row?.email ?? ""} ${row?.username ?? ""}`.toLowerCase();
                            return haystack.includes(input.trim().toLowerCase());
                          }}
                          options={taskAssigneePickList.map((u) => {
                            const initial = u.name.trim().slice(0, 1).toUpperCase() || "?";
                            const src = resolveMediaUrl(u.avatar_url ?? null);
                            return {
                              value: u.id,
                              label: (
                                <Space size={8}>
                                  <Avatar size="small" src={src || undefined}>{src ? null : initial}</Avatar>
                                  <span>{u.name}</span>
                                </Space>
                              ),
                            };
                          })}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Prazo inicio" name="start_date">
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Prazo final" name="end_date">
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Prioridade" name="priority" rules={[{ required: true }]}>
                        <Select
                          options={[
                            { label: "Baixa", value: "low" },
                            { label: "Média", value: "medium" },
                            { label: "Alta", value: "high" },
                            { label: "Crítica", value: "critical" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Esforco previsto (h)" name="effort_points">
                        <InputNumber min={0} max={999} step={0.5} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Recorrente" name="is_recurring" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item shouldUpdate={(prev, curr) => prev.is_recurring !== curr.is_recurring} noStyle>
                        {({ getFieldValue }) =>
                          getFieldValue("is_recurring") ? (
                            <Form.Item label="Frequencia" name="recurrence_frequency">
                              <Select
                                placeholder="Selecione"
                                options={[
                                  { value: "daily", label: "Diaria" },
                                  { value: "weekly", label: "Semanal" },
                                  { value: "biweekly", label: "Quinzenal" },
                                  { value: "monthly", label: "Mensal" },
                                ]}
                              />
                            </Form.Item>
                          ) : null
                        }
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              </Card>

            {selectedTask.parent_id ? (
              <Alert
                type="info"
                showIcon
                title="Esta e uma subtarefa"
                description="Abra a tarefa pai para ver o conjunto completo de subtarefas."
              />
            ) : (
              <Card
                size="small"
                title={`Subtarefas (${taskSubtasks.length || selectedTask.subtasks_count || 0})`}
                extra={
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => openCreateSubtaskModal(selectedTask)}
                  >
                    Nova subtarefa
                  </Button>
                }
              >
                {taskSubtasks.length === 0 ? (
                  <Typography.Text type="secondary">
                    Nenhuma subtarefa ainda. Use o botao para adicionar, ou expanda a tarefa na tabela do grupo.
                  </Typography.Text>
                ) : (
                  <Table<TaskItem>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={taskSubtasks}
                    onRow={(subtask) => ({
                      onClick: () => void openTask(subtask),
                      style: { cursor: "pointer" },
                    })}
                    columns={[
                      { title: "Subtarefa", dataIndex: "title", ellipsis: true },
                      assigneeColumn,
                      {
                        title: "Status",
                        dataIndex: "status",
                        width: 110,
                        render: (value: string) => renderStatusTag(value),
                      },
                      {
                        title: "Prioridade",
                        dataIndex: "priority",
                        width: 110,
                        render: (value: string) => renderPriorityTag(value),
                      },
                    ]}
                  />
                )}
              </Card>
            )}


            <Tabs
              activeKey={taskDrawerTab}
              onChange={(key) => setTaskDrawerTab(key as TaskDrawerTab)}
              items={[
                {
                  key: "summary",
                  label: "Registros de tempo",
                  children: (
                    <div>
                      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }} wrap>
                        <Typography.Paragraph style={{ marginBottom: 0 }}>
                          Total acumulado: {secondsToText(liveTaskTotalSeconds)}
                        </Typography.Paragraph>
                        <Button
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => {
                            manualTimeForm.resetFields();
                            setManualTimeModalOpen(true);
                          }}
                        >
                          Adicionar sessao
                        </Button>
                      </Space>
                      <Space orientation="vertical" style={{ width: "100%" }} size={8}>
                        {taskSummary.logs.map((log) => (
                          <Card key={log.id} size="small">
                            <Space orientation="vertical" size={0}>
                              <Typography.Text style={log.is_manual ? { color: "#cf1322" } : undefined}>
                                {log.user_name ? `${log.user_name} · ` : ""}
                                {formatTimeLogStatus(log.status)} - {secondsToText(log.total_seconds)}
                                {log.is_manual ? " (manual)" : ""}
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
                      {taskActivity.length === 0 ? (
                        <Empty description="Nenhum evento no historico ainda." />
                      ) : (
                        taskActivity.map((item, index) => (
                          <Card key={`${item.event_type}-${item.created_at}-${index}`} size="small">
                            <Space orientation="vertical" size={2} style={{ width: "100%" }}>
                              <Typography.Text strong>{formatTaskActivityTitle(item.event_type)}</Typography.Text>
                              {humanizeTaskActivitySummary(item.summary) ? (
                                <Typography.Text type="secondary">
                                  {humanizeTaskActivitySummary(item.summary)}
                                </Typography.Text>
                              ) : null}
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {formatDate(item.created_at)}
                              </Typography.Text>
                            </Space>
                          </Card>
                        ))
                      )}
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
                          <MondayComposer
                            key={`comment-composer-${selectedTask.id}-${commentDraftKey ?? "x"}`}
                            mode="comment"
                            value={taskCommentDraft}
                            onChange={(html) => setTaskCommentDraft(html)}
                            mentionOptions={mondayMentionOptions}
                            onUploadImage={uploadImageForComposer}
                            onAttachFiles={(files) => {
                              const next: UploadFile[] = files.map((file, index) => ({
                                uid: `bb-doc-${Date.now()}-${index}-${file.name}`,
                                name: file.name,
                                status: "done",
                                originFileObj: file as UploadFile["originFileObj"],
                              }));
                              setTaskCommentFiles((prev) => [...prev, ...next]);
                            }}
                            draftKey={commentDraftKey}
                            placeholder="Escreva uma atualizacao... Digite @ para mencionar. Cole ou anexe imagens."
                            submitLabel="Atualizar"
                            onSubmit={(html) => createTaskComment(selectedTask.id, html)}
                          />
                          {taskCommentFiles.length > 0 ? (
                            <Upload
                              multiple
                              beforeUpload={() => false}
                              fileList={taskCommentFiles}
                              onChange={({ fileList }) => setTaskCommentFiles(fileList)}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,image/*"
                            />
                          ) : null}
                          <Button
                            size="small"
                            onClick={() => {
                              clearComposerDraft(commentDraftKey);
                              setTaskCommentDraft("");
                              setTaskCommentFiles([]);
                              setTaskCommentReplyTo(null);
                            }}
                          >
                            Limpar rascunho
                          </Button>
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
                                    <MondayComposer
                                      mode="comment"
                                      value={taskCommentEditingContent}
                                      onChange={(html) => setTaskCommentEditingContent(html)}
                                      mentionOptions={mondayMentionOptions}
                                      onUploadImage={uploadImageForComposer}
                                      placeholder="Edite a atualizacao... Digite @ para mencionar"
                                      submitLabel="Salvar"
                                      onSubmit={(html) =>
                                        updateTaskComment(selectedTask.id, rootComment.id, html)
                                      }
                                    />
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
                                ) : (
                                  <>
                                    <RichHtmlView html={root.cleanContent} />
                                    {renderCommentAttachments(rootComment.attachments)}
                                  </>
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
                                            <MondayComposer
                                              mode="comment"
                                              value={taskCommentEditingContent}
                                              onChange={(html) => setTaskCommentEditingContent(html)}
                                              mentionOptions={mondayMentionOptions}
                                              onUploadImage={uploadImageForComposer}
                                              placeholder="Edite a resposta... Digite @ para mencionar"
                                              submitLabel="Salvar"
                                              onSubmit={(html) =>
                                                updateTaskComment(selectedTask.id, reply.comment.id, html)
                                              }
                                            />
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
                                        ) : (
                                          <>
                                            <RichHtmlView html={reply.cleanContent} />
                                            {renderCommentAttachments(reply.comment.attachments)}
                                          </>
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

      <Modal
        title={
          hoursDetailCollaborator
            ? `Horas · ${String(hoursDetailCollaborator.name ?? "Colaborador")}`
            : "Detalhe do colaborador"
        }
        open={Boolean(hoursDetailCollaborator)}
        onCancel={() => setHoursDetailCollaborator(null)}
        footer={
          <Button onClick={() => setHoursDetailCollaborator(null)}>Fechar</Button>
        }
        width={860}
        destroyOnHidden
      >
        {hoursDetailCollaborator ? (
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Statistic
                  title="Horas"
                  value={decimalHoursToHmText(Number(hoursDetailCollaborator.consumed_hours ?? 0))}
                />
              </Col>
              <Col xs={24} sm={8}>
                <Statistic
                  title="Horas previstas"
                  value={formatEffortHoursDisplay(Number(hoursDetailCollaborator.effort_points_total ?? 0))}
                />
              </Col>
              <Col xs={24} sm={8}>
                <Statistic
                  title="Tarefas"
                  value={Number(
                    hoursDetailCollaborator.tasks_count ??
                      (Array.isArray(hoursDetailCollaborator.tasks)
                        ? hoursDetailCollaborator.tasks.length
                        : 0),
                  )}
                />
              </Col>
            </Row>
            {hoursDetailCollaborator.email ? (
              <Typography.Text type="secondary">{String(hoursDetailCollaborator.email)}</Typography.Text>
            ) : null}
            <Table
              size="small"
              pagination={false}
              scroll={{ y: 360 }}
              locale={{ emptyText: "Sem tarefas neste periodo." }}
              rowKey={(t) => String(t.task_id ?? t.task_title)}
              dataSource={
                Array.isArray(hoursDetailCollaborator.tasks)
                  ? (hoursDetailCollaborator.tasks as Array<Record<string, unknown>>)
                  : []
              }
              columns={[
                {
                  title: "Tarefa",
                  dataIndex: "task_title",
                  render: (value: string) => value || "—",
                },
                {
                  title: "Cliente",
                  dataIndex: "client_name",
                  width: 160,
                  render: (value: string) => value || "—",
                },
                {
                  title: "Projeto",
                  dataIndex: "project_name",
                  width: 160,
                  render: (value: string) => value || "—",
                },
                {
                  title: "Horas previstas",
                  dataIndex: "effort_points",
                  width: 130,
                  render: (value: number) => formatEffortHoursDisplay(Number(value ?? 0)),
                },
                {
                  title: "Horas",
                  dataIndex: "consumed_hours",
                  width: 100,
                  render: (value: number) => decimalHoursToHmText(value),
                },
              ]}
            />
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="Adicionar sessao"
        open={manualTimeModalOpen}
        onCancel={() => {
          setManualTimeModalOpen(false);
          manualTimeForm.resetFields();
        }}
        onOk={() => manualTimeForm.submit()}
        okText="Salvar sessao"
        cancelText="Cancelar"
        destroyOnHidden={false}
      >
        <Form layout="vertical" form={manualTimeForm} onFinish={(values) => void submitManualTimeLog(values)}>
          <Form.Item
            name="started_at"
            label="Inicio"
            rules={[{ required: true, message: "Informe o inicio." }]}
          >
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item
            name="ended_at"
            label="Fim"
            rules={[{ required: true, message: "Informe o fim." }]}
          >
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Detalhes do pedido"
        open={Boolean(viewRequestModal)}
        onCancel={() => setViewRequestModal(null)}
        footer={[
          <Button key="close" onClick={() => setViewRequestModal(null)}>
            Fechar
          </Button>,
          <Button
            key="convert"
            type="primary"
            disabled={String(viewRequestModal?.status ?? "") === "converted"}
            onClick={() => {
              if (!viewRequestModal) return;
              setViewRequestModal(null);
              void openConvertRequestModal(viewRequestModal);
            }}
          >
            Converter em tarefa
          </Button>,
        ]}
        width={640}
        destroyOnHidden={false}
      >
        {viewRequestModal ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <div>
              <Typography.Text type="secondary">Titulo</Typography.Text>
              <Typography.Paragraph strong style={{ marginBottom: 0 }}>
                {String(viewRequestModal.title ?? "-")}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text type="secondary">Cliente</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {String(viewRequestModal.client_name ?? "-")}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text type="secondary">Solicitante</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {[viewRequestModal.contact_name, viewRequestModal.contact_email, viewRequestModal.contact_phone]
                  .map((v) => String(v ?? "").trim())
                  .filter(Boolean)
                  .join(" · ") || "-"}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text type="secondary">Status</Typography.Text>
              <div>
                {renderClientRequestStatusTag(String(viewRequestModal.status ?? ""))}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">Criado em</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {formatDate(String(viewRequestModal.created_at ?? ""))}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text type="secondary">Descricao</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                {String(viewRequestModal.description ?? "").trim() || "Sem descricao."}
              </Typography.Paragraph>
            </div>
          </Space>
        ) : null}
      </Modal>

      <Modal
        title={`Converter pedido: ${String(convertRequestModal?.title ?? "")}`}
        open={Boolean(convertRequestModal)}
        onCancel={() => {
          setConvertRequestModal(null);
          convertRequestForm.resetFields();
          setConvertBoardOptions([]);
          setConvertGroupOptions([]);
        }}
        onOk={() => convertRequestForm.submit()}
        okText="Criar tarefa"
        cancelText="Cancelar"
        width={720}
        destroyOnHidden={false}
      >
        <Form
          layout="vertical"
          form={convertRequestForm}
          initialValues={{ priority: "medium", status: "todo", effort_points: 1 }}
          onFinish={async (values) => {
            if (!convertRequestModal) return;
            const requestId = String(convertRequestModal.id ?? "");
            if (!requestId) return;
            const body = {
              title: String(values.title ?? "").trim(),
              description: String(values.description ?? "").trim(),
              client_id: values.client_id ? String(values.client_id) : undefined,
              project_id: values.project_id ? String(values.project_id) : undefined,
              board_id: values.board_id ? String(values.board_id) : undefined,
              group_id: values.group_id ? String(values.group_id) : undefined,
              priority: values.priority,
              status: values.status,
              effort_points: values.effort_points ?? 1,
              assignee_id: values.assignee_id ?? null,
              start_date: fromDateInputValue(values.start_date),
              end_date: fromDateInputValue(values.end_date),
            };
            const response = await apiRequest(`/client-requests/${requestId}/convert`, {
              method: "POST",
              token,
              body,
            });
            if (!response.ok) {
              apiMessage.error(response.error?.message ?? "Falha ao converter pedido.");
              return;
            }
            apiMessage.success("Pedido convertido em tarefa.");
            setConvertRequestModal(null);
            convertRequestForm.resetFields();
            setConvertBoardOptions([]);
            setConvertGroupOptions([]);
            await fetchClientRequestsList();
            await fetchTasks();
            if (isAdmin) await fetchAllTasks().catch(() => undefined);
          }}
        >
          <Row gutter={[12, 0]}>
            <Col xs={24}>
              <Form.Item name="title" label="Titulo" rules={[{ required: true, message: "Informe o titulo." }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="description" label="Descricao">
                <Input.TextArea rows={4} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="client_id" label="Cliente">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Associar cliente"
                  options={clients.map((c) => ({
                    value: String(c.id),
                    label: String(c.name ?? c.id),
                  }))}
                  onChange={(clientId) => {
                    const pid = clientId
                      ? projects.find((p) => String(p.client_id ?? "") === String(clientId))
                      : undefined;
                    convertRequestForm.setFieldsValue({
                      project_id: pid ? String(pid.id) : undefined,
                      board_id: undefined,
                      group_id: undefined,
                    });
                    setConvertBoardOptions([]);
                    setConvertGroupOptions([]);
                    if (pid?.id) void loadConvertBoardsForProject(String(pid.id));
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item shouldUpdate={(prev, curr) => prev.client_id !== curr.client_id} noStyle>
                {({ getFieldValue }) => {
                  const clientId = getFieldValue("client_id");
                  const projectOptions = (
                    clientId
                      ? projects.filter((p) => String(p.client_id ?? "") === String(clientId))
                      : projects
                  ).map((p) => ({
                    value: String(p.id),
                    label: String(p.name ?? p.id),
                  }));
                  return (
                    <Form.Item name="project_id" label="Projeto" rules={[{ required: true, message: "Selecione o projeto." }]}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Selecione"
                        options={projectOptions}
                        onChange={(projectId) => {
                          void loadConvertBoardsForProject(String(projectId));
                        }}
                      />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="board_id" label="Quadro" rules={[{ required: true, message: "Selecione o quadro." }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Selecione"
                  options={convertBoardOptions}
                  onChange={(boardId) => void loadConvertGroupsForBoard(String(boardId))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="group_id" label="Grupo / lista" rules={[{ required: true, message: "Selecione o grupo." }]}>
                <Select showSearch optionFilterProp="label" placeholder="Selecione" options={convertGroupOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="priority" label="Prioridade">
                <Select
                  options={[
                    { value: "low", label: "Baixa" },
                    { value: "medium", label: "Média" },
                    { value: "high", label: "Alta" },
                    { value: "critical", label: "Crítica" },
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
              <Form.Item name="assignee_id" label="Responsavel">
                <Select
                  allowClear
                  showSearch
                  placeholder="Opcional"
                  filterOption={(input, option) => {
                    const id = Number(option?.value ?? NaN);
                    const row = taskAssigneePickList.find((u) => u.id === id);
                    const haystack = `${row?.name ?? ""} ${row?.email ?? ""}`.toLowerCase();
                    return haystack.includes(input.trim().toLowerCase());
                  }}
                  options={taskAssigneePickList.map((u) => ({
                    value: u.id,
                    label: u.name,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="effort_points" label="Esforco (h)">
                <InputNumber min={0} max={999} step={0.5} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="start_date" label="Prazo inicio">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="end_date" label="Prazo final">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <ReportProblemWidget
        token={token}
        workspaceId={selectedWorkspaceId}
        hidden={false}
      />
    </>
  );
}
