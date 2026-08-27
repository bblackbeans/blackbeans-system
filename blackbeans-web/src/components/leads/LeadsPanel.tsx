"use client";

import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  SyncOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  RD_STATUS_OPTIONS,
  RdConfigModal,
  RdHistoryDrawer,
  RdPreviewModal,
  rdStatusTag,
  type RdCustomField,
  type RdJob,
  type RdOption,
  type RdPreview,
  type RdSettings,
  type RdStatusPayload,
} from "@/components/leads/RdStationModals";
import { apiRequest } from "@/lib/api";

type ScoreBreakdownItem = {
  label: string;
  points: number;
};

type LeadListItem = {
  id: string;
  import_id: string | null;
  company_id?: string | null;
  company_name?: string | null;
  origem: string;
  freshness: "novo" | "antigo" | string;
  filename?: string;
  column_keys?: string[];
  display_name: string;
  email?: string;
  phone?: string;
  cnpj?: string;
  has_cnpj?: boolean;
  has_phone?: boolean;
  has_email?: boolean;
  completeness_score?: number;
  email_is_generic?: boolean;
  email_is_shared?: boolean;
  phone_is_shared?: boolean;
  contact_is_person?: boolean;
  contact_is_decision_maker?: boolean;
  job_title?: string;
  linkedin_url?: string;
  score_breakdown?: ScoreBreakdownItem[];
  contact_status: string;
  notes?: string;
  payload_preview?: Record<string, string | null>;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadDetail = LeadListItem & {
  payload: Record<string, unknown>;
  notes: string;
};

type CompanyListItem = {
  id: string;
  name: string;
  cnpj: string;
  origem: string;
  freshness: string;
  has_cnpj: boolean;
  has_phone: boolean;
  has_email: boolean;
  completeness_score: number;
  email_is_generic?: boolean;
  email_is_shared?: boolean;
  phone_is_shared?: boolean;
  contact_is_person?: boolean;
  contact_is_decision_maker?: boolean;
  score_breakdown?: ScoreBreakdownItem[];
  contacts_count: number;
  contacts?: LeadListItem[];
  notes?: string;
  website_domain?: string;
  rd_status?: string;
  rd_remote_id?: string;
  rd_url?: string;
  rd_last_synced_at?: string | null;
  rd_last_error?: string;
  rd_deal?: {
    remote_id?: string;
    url?: string;
    pipeline_name?: string;
    stage_name?: string;
    owner_name?: string;
    deal_status?: string;
  } | null;
  created_at?: string | null;
};

type CompanyDetail = CompanyListItem & {
  contacts?: LeadListItem[];
};

type LeadImportItem = {
  id: string;
  origem: string;
  freshness: string;
  filename: string;
  column_keys: string[];
  row_count: number;
  created_at?: string | null;
};

type PreviewData = {
  filename: string;
  column_keys: string[];
  row_count: number;
  preview_rows: Record<string, string>[];
};

const CONTACT_STATUS_OPTIONS = [
  { value: "nao_contatado", label: "Não contatado" },
  { value: "em_contato", label: "Em contato" },
  { value: "contatado", label: "Contatado" },
  { value: "sem_interesse", label: "Sem interesse" },
];

const CONTACT_STATUS_COLORS: Record<string, string> = {
  nao_contatado: "default",
  em_contato: "processing",
  contatado: "success",
  sem_interesse: "error",
};

const FRESHNESS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "antigo", label: "Antigo" },
];

const BEST_LEADS_THRESHOLD = 60;
const RD_POLL_MS = 4000;

function qualityLabel(score: number | undefined | null) {
  const value = Number(score ?? 0);
  if (value >= BEST_LEADS_THRESHOLD) return { text: "Melhor lead", color: "green" as const };
  if (value >= 35) return { text: "Média", color: "gold" as const };
  return { text: "Baixa", color: "default" as const };
}

function formatScorePoints(points: number) {
  if (points > 0) return `+${points}`;
  return String(points);
}

function ScoreQualityInfo({
  score,
  hasCnpj,
  hasPhone,
  hasEmail,
  breakdown,
  flags,
}: {
  score?: number | null;
  hasCnpj?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
  breakdown?: ScoreBreakdownItem[];
  flags?: {
    email_is_generic?: boolean;
    email_is_shared?: boolean;
    phone_is_shared?: boolean;
    contact_is_decision_maker?: boolean;
    contact_is_person?: boolean;
  };
}) {
  const value = Number(score ?? 0);
  const quality = qualityLabel(value);
  return (
    <Card size="small" title="Score de prospecção">
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        <Space wrap>
          <Tag color={value >= BEST_LEADS_THRESHOLD ? "green" : "default"}>Score {value}/100</Tag>
          <Tag color={quality.color}>{quality.text}</Tag>
          <Space size={8}>
            <FlagIcon ok={Boolean(hasCnpj)} label="CNPJ válido" />
            <FlagIcon ok={Boolean(hasPhone)} label="Telefone útil" />
            <FlagIcon ok={Boolean(hasEmail)} label="E-mail útil" />
          </Space>
        </Space>
        <Space wrap size={4}>
          {flags?.contact_is_decision_maker ? <Tag color="blue">Decisor</Tag> : null}
          {flags?.contact_is_person && !flags.contact_is_decision_maker ? <Tag>Pessoa</Tag> : null}
          {flags?.email_is_generic ? <Tag color="orange">E-mail genérico</Tag> : null}
          {flags?.email_is_shared ? <Tag color="volcano">E-mail compartilhado</Tag> : null}
          {flags?.phone_is_shared ? <Tag color="volcano">Telefone repetido</Tag> : null}
        </Space>
        {breakdown && breakdown.length > 0 ? (
          <Space orientation="vertical" size={2} style={{ width: "100%" }}>
            {breakdown.map((item) => (
              <Typography.Text
                key={`${item.label}-${item.points}`}
                type={item.points < 0 ? "danger" : "secondary"}
                style={{ fontSize: 12 }}
              >
                {formatScorePoints(item.points)} · {item.label}
              </Typography.Text>
            ))}
          </Space>
        ) : null}
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Prioriza contato direto (e-mail nominativo, celular único, decisor) e rebaixa caixa genérica
          (contato@) e telefone/e-mail repetidos. O filtro <strong>Melhores leads</strong> usa score ≥{" "}
          {BEST_LEADS_THRESHOLD}. O envio ao RD Station usa empresa, contatos e, se ligado, um deal.
        </Typography.Paragraph>
      </Space>
    </Card>
  );
}

function FlagIcon({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <CheckCircleOutlined style={{ color: "#389e0d" }} title={label} />
  ) : (
    <CloseCircleOutlined style={{ color: "#bfbfbf" }} title={`Sem ${label.toLowerCase()}`} />
  );
}

function formatCnpj(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length !== 14) return value || "—";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function nowrapHeader(label: string) {
  return <span style={{ whiteSpace: "nowrap" }}>{label}</span>;
}

function freshnessTag(value: string | null | undefined) {
  const isNovo = value === "novo";
  return <Tag color={isNovo ? "green" : "default"}>{isNovo ? "Novo" : "Antigo"}</Tag>;
}

function renderPayloadValue(value: unknown) {
  if (value == null || value === "") {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  const text = String(value);
  const lower = text.toLowerCase();
  if (/^https?:\/\//i.test(text)) {
    return (
      <Typography.Link href={text} target="_blank" rel="noreferrer">
        {text}
      </Typography.Link>
    );
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
    return <Typography.Link href={`mailto:${text}`}>{text}</Typography.Link>;
  }
  if (lower.startsWith("tel:") || /^\+?\d[\d\s().-]{7,}$/.test(text.replace(/^tel:/i, ""))) {
    const href = text.toLowerCase().startsWith("tel:") ? text : `tel:${text.replace(/\D/g, "")}`;
    return <Typography.Link href={href}>{text}</Typography.Link>;
  }
  return <Typography.Text style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</Typography.Text>;
}

type LeadsPanelProps = {
  token: string;
};

export function LeadsPanel({ token }: LeadsPanelProps) {
  const { modal } = App.useApp();
  const [msg, msgHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const fetchSeqRef = useRef(0);

  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [imports, setImports] = useState<LeadImportItem[]>([]);

  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [freshnessFilter, setFreshnessFilter] = useState<string>("all");
  const [contactStatusFilter, setContactStatusFilter] = useState<string>("all");
  const [hasCnpj, setHasCnpj] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [bestOnly, setBestOnly] = useState(false);
  const [decisionMakersOnly, setDecisionMakersOnly] = useState(false);
  const [hideGenericEmail, setHideGenericEmail] = useState(false);
  const [hideSharedPhone, setHideSharedPhone] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [contactsByCompany, setContactsByCompany] = useState<Record<string, LeadListItem[]>>({});
  const [contactsLoading, setContactsLoading] = useState<Record<string, boolean>>({});
  const [expandedRowKeys, setExpandedRowKeys] = useState<Key[]>([]);
  const contactsByCompanyRef = useRef<Record<string, LeadListItem[]>>({});
  const contactsLoadingRef = useRef<Record<string, boolean>>({});
  const expandedRowKeysRef = useRef<Key[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyNotesDraft, setCompanyNotesDraft] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [rdStatusFilter, setRdStatusFilter] = useState<string>("all");
  const [rdStatus, setRdStatus] = useState<RdStatusPayload | null>(null);
  const [rdSettings, setRdSettings] = useState<RdSettings | null>(null);
  const [rdConfigOpen, setRdConfigOpen] = useState(false);
  const [rdSaving, setRdSaving] = useState(false);
  const [rdConnecting, setRdConnecting] = useState(false);
  const [rdPreviewOpen, setRdPreviewOpen] = useState(false);
  const [rdPreview, setRdPreview] = useState<RdPreview | null>(null);
  const [rdPreviewLoading, setRdPreviewLoading] = useState(false);
  const [rdSending, setRdSending] = useState(false);
  const [rdJob, setRdJob] = useState<RdJob | null>(null);
  const [rdPipelines, setRdPipelines] = useState<RdOption[]>([]);
  const [rdStages, setRdStages] = useState<RdOption[]>([]);
  const [rdOwners, setRdOwners] = useState<RdOption[]>([]);
  const [rdSources, setRdSources] = useState<RdOption[]>([]);
  const [rdCustomFields, setRdCustomFields] = useState<RdCustomField[]>([]);
  const [rdOptionsError, setRdOptionsError] = useState<string | null>(null);
  const [rdHistoryOpen, setRdHistoryOpen] = useState(false);
  const [rdHistoryLoading, setRdHistoryLoading] = useState(false);
  const [rdHistory, setRdHistory] = useState<
    Array<{ id: string; action: string; success: boolean; message: string; created_at?: string | null }>
  >([]);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
  const [leadLoading, setLeadLoading] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [statusDraft, setStatusDraft] = useState("nao_contatado");
  const [notesDraft, setNotesDraft] = useState("");

  const [companyCreateOpen, setCompanyCreateOpen] = useState(false);
  const [contactCreateOpen, setContactCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [companyForm] = Form.useForm();
  const [contactForm] = Form.useForm();

  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOrigem, setImportOrigem] = useState("");
  const [importFreshness, setImportFreshness] = useState<"novo" | "antigo">("novo");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [manageImportsOpen, setManageImportsOpen] = useState(false);

  const fetchOrigens = useCallback(async () => {
    const response = await apiRequest<{ origens: string[] }>("/leads/origens", { token });
    if (response.ok) {
      setOrigens(response.data?.origens ?? []);
    }
  }, [token]);

  const fetchImports = useCallback(async () => {
    const response = await apiRequest<{ imports: LeadImportItem[] }>("/leads/imports?page_size=100", {
      token,
    });
    if (response.ok) {
      setImports(response.data?.imports ?? []);
    }
  }, [token]);

  const loadCompanyContacts = useCallback(
    async (companyId: string, force = false) => {
      if (
        !force &&
        (companyId in contactsByCompanyRef.current || contactsLoadingRef.current[companyId])
      ) {
        return;
      }
      contactsLoadingRef.current = { ...contactsLoadingRef.current, [companyId]: true };
      setContactsLoading((prev) => ({ ...prev, [companyId]: true }));
      try {
        const response = await apiRequest<{ company: CompanyDetail }>(`/leads/companies/${companyId}`, {
          token,
        });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao carregar contatos.");
          return;
        }
        const contacts = response.data?.company?.contacts ?? [];
        contactsByCompanyRef.current = { ...contactsByCompanyRef.current, [companyId]: contacts };
        setContactsByCompany((prev) => ({ ...prev, [companyId]: contacts }));
      } finally {
        contactsLoadingRef.current = { ...contactsLoadingRef.current, [companyId]: false };
        setContactsLoading((prev) => ({ ...prev, [companyId]: false }));
      }
    },
    [msg, token],
  );

  const buildLeadQuery = useCallback(
    (withPagination: boolean) => {
      const params = new URLSearchParams({
        ordering: "-completeness_score",
      });
      if (withPagination) {
        params.set("page", String(page));
        params.set("page_size", "20");
      }
      if (search.trim()) params.set("q", search.trim());
      if (origemFilter !== "all") params.set("origem", origemFilter);
      if (freshnessFilter !== "all") params.set("freshness", freshnessFilter);
      if (contactStatusFilter !== "all") params.set("contact_status", contactStatusFilter);
      if (hasCnpj) params.set("has_cnpj", "true");
      if (hasPhone) params.set("has_phone", "true");
      if (hasEmail) params.set("has_email", "true");
      if (bestOnly) params.set("quality", "best");
      if (decisionMakersOnly) params.set("decision_makers", "true");
      if (hideGenericEmail) params.set("hide_generic_email", "true");
      if (hideSharedPhone) params.set("hide_shared_phone", "true");
      if (rdStatusFilter !== "all") params.set("rd_status", rdStatusFilter);
      return params;
    },
    [
      bestOnly,
      contactStatusFilter,
      decisionMakersOnly,
      freshnessFilter,
      hasCnpj,
      hasEmail,
      hasPhone,
      hideGenericEmail,
      hideSharedPhone,
      origemFilter,
      page,
      rdStatusFilter,
      search,
    ],
  );

  const fetchCompanies = useCallback(async (options?: { silent?: boolean }) => {
    const seq = ++fetchSeqRef.current;
    const silent = Boolean(options?.silent);
    if (!silent) setLoading(true);
    try {
      const params = buildLeadQuery(true);
      const response = await apiRequest<{ companies: CompanyListItem[] }>(
        `/leads/companies?${params.toString()}`,
        { token },
      );

      if (seq !== fetchSeqRef.current) return;
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao carregar empresas.");
        return;
      }
      const rows = response.data?.companies ?? [];
      setCompanies(rows);
      setTotal(Number(response.meta?.total ?? 0));
      const ids = new Set(rows.map((row) => row.id));
      setContactsByCompany((prev) => {
        const next: Record<string, LeadListItem[]> = {};
        for (const [id, contacts] of Object.entries(prev)) {
          if (ids.has(id)) next[id] = contacts;
        }
        contactsByCompanyRef.current = next;
        return next;
      });
      for (const key of expandedRowKeysRef.current) {
        const id = String(key);
        if (ids.has(id)) void loadCompanyContacts(id, true);
      }
    } finally {
      if (!silent && seq === fetchSeqRef.current) setLoading(false);
    }
  }, [buildLeadQuery, loadCompanyContacts, msg, token]);

  const fetchCompanyDetail = useCallback(
    async (companyId: string) => {
      setCompanyLoading(true);
      try {
        const response = await apiRequest<{ company: CompanyDetail }>(`/leads/companies/${companyId}`, {
          token,
        });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao carregar empresa.");
          return;
        }
        const row = response.data?.company ?? null;
        setCompanyDetail(row);
        setCompanyNotesDraft(row?.notes ?? "");
        if (row?.contacts) {
          contactsByCompanyRef.current = { ...contactsByCompanyRef.current, [companyId]: row.contacts };
          setContactsByCompany((prev) => ({ ...prev, [companyId]: row.contacts ?? [] }));
        }
      } finally {
        setCompanyLoading(false);
      }
    },
    [msg, token],
  );

  const fetchLeadDetail = useCallback(
    async (leadId: string) => {
      setLeadLoading(true);
      try {
        const response = await apiRequest<{ lead: LeadDetail }>(`/leads/${leadId}`, { token });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao carregar contato.");
          return;
        }
        const row = response.data?.lead ?? null;
        setLeadDetail(row);
        if (row) {
          setStatusDraft(row.contact_status);
          setNotesDraft(row.notes ?? "");
        }
      } finally {
        setLeadLoading(false);
      }
    },
    [msg, token],
  );

  useEffect(() => {
    void fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    void fetchOrigens();
    void fetchImports();
  }, [fetchImports, fetchOrigens]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyDetail(null);
      return;
    }
    void fetchCompanyDetail(selectedCompanyId);
  }, [fetchCompanyDetail, selectedCompanyId]);

  useEffect(() => {
    if (!selectedLeadId) {
      setLeadDetail(null);
      return;
    }
    void fetchLeadDetail(selectedLeadId);
  }, [fetchLeadDetail, selectedLeadId]);

  useEffect(() => {
    if (!rdJob || rdJob.status === "done" || rdJob.status === "failed") return;
    let cancelled = false;
    const poll = async () => {
      const response = await apiRequest<{ job: RdJob }>(`/integrations/rdstation/sync/${rdJob.id}`, {
        token,
      });
      if (cancelled || !response.ok || !response.data?.job) return;
      setRdJob(response.data.job);
      await fetchCompanies({ silent: true });
      if (selectedCompanyId) await fetchCompanyDetail(selectedCompanyId);
      if (response.data.job.status === "done" || response.data.job.status === "failed") {
        msg.success(
          `Envio RD: ${response.data.job.success} ok, ${response.data.job.error} erro(s), ${response.data.job.skipped} ignorada(s).`,
        );
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, RD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchCompanies, fetchCompanyDetail, msg, rdJob, selectedCompanyId, token]);

  const fetchRdStatus = useCallback(async () => {
    const response = await apiRequest<RdStatusPayload>("/integrations/rdstation/status", { token });
    if (!response.ok) return;
    setRdStatus(response.data ?? null);
    if (response.data?.settings) setRdSettings(response.data.settings);
  }, [token]);

  const fetchRdOptions = useCallback(async () => {
    const response = await apiRequest<{
      pipelines: RdOption[];
      stages: RdOption[];
      owners: RdOption[];
      sources: RdOption[];
      custom_fields?: RdCustomField[];
      errors?: Record<string, string>;
    }>("/integrations/rdstation/options", { token });
    if (!response.ok) {
      setRdOptionsError(response.error?.message ?? "Falha ao carregar funis e responsáveis.");
      return;
    }
    setRdPipelines(response.data?.pipelines ?? []);
    setRdStages(response.data?.stages ?? []);
    setRdOwners(response.data?.owners ?? []);
    setRdSources(response.data?.sources ?? []);
    setRdCustomFields(response.data?.custom_fields ?? []);
    const errors = Object.values(response.data?.errors ?? {});
    setRdOptionsError(errors[0] ?? null);
  }, [token]);

  useEffect(() => {
    void fetchRdStatus();
    const params = new URLSearchParams(window.location.search);
    const rd = params.get("rd");
    if (rd === "connected") {
      msg.success("RD Station CRM conectado.");
    }
    if (rd === "oauth_error") {
      msg.error("Falha ao conectar o RD Station CRM.");
    }
    if (rd === "connected" || rd === "oauth_error") {
      params.delete("rd");
      const query = params.toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    }
  }, [fetchRdStatus, msg]);

  const resetImportWizard = () => {
    setImportStep(1);
    setImportFile(null);
    setImportOrigem("");
    setImportFreshness("novo");
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!importFile) {
      msg.warning("Selecione um arquivo CSV ou XLSX.");
      return;
    }
    if (!importOrigem.trim()) {
      msg.warning("Informe a origem dos leads.");
      return;
    }
    setPreviewLoading(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const response = await apiRequest<PreviewData>("/leads/imports/preview", {
        method: "POST",
        token,
        body: form,
      });
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao ler a planilha.");
        return;
      }
      setPreview(response.data ?? null);
      setImportStep(2);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile || !importOrigem.trim()) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      form.append("origem", importOrigem.trim());
      form.append("freshness", importFreshness);
      const response = await apiRequest<{ created_count?: number }>("/leads/imports", {
        method: "POST",
        token,
        body: form,
      });
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao importar.");
        return;
      }
      msg.success(`${response.data?.created_count ?? 0} contato(s) importado(s).`);
      setImportOpen(false);
      resetImportWizard();
      setPage(1);
      await Promise.all([fetchCompanies(), fetchOrigens(), fetchImports()]);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveCompanyNotes = async () => {
    if (!selectedCompanyId) return;
    setSavingCompany(true);
    try {
      const response = await apiRequest<{ company: CompanyDetail }>(
        `/leads/companies/${selectedCompanyId}`,
        {
          method: "PATCH",
          token,
          body: { notes: companyNotesDraft },
        },
      );
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao salvar.");
        return;
      }
      msg.success("Empresa atualizada.");
      setCompanyDetail(response.data?.company ?? null);
      await fetchCompanies();
    } finally {
      setSavingCompany(false);
    }
  };

  const openRdConfig = async () => {
    setRdConfigOpen(true);
    await fetchRdStatus();
    await fetchRdOptions();
  };

  const handleRdConnect = async () => {
    setRdConnecting(true);
    try {
      const response = await apiRequest<{ authorization_url: string }>(
        "/integrations/rdstation/oauth/start",
        { method: "POST", token, body: {} },
      );
      if (!response.ok || !response.data?.authorization_url) {
        msg.error(response.error?.message ?? "Não foi possível iniciar o OAuth.");
        return;
      }
      window.location.href = response.data.authorization_url;
    } finally {
      setRdConnecting(false);
    }
  };

  const handleRdDisconnect = async () => {
    const response = await apiRequest("/integrations/rdstation/oauth/disconnect", {
      method: "POST",
      token,
      body: {},
    });
    if (!response.ok) {
      msg.error(response.error?.message ?? "Falha ao desconectar.");
      return;
    }
    msg.success("RD Station desconectado.");
    await fetchRdStatus();
  };

  const handleRdSaveSettings = async (values: Partial<RdSettings>) => {
    setRdSaving(true);
    try {
      const response = await apiRequest<{ settings: RdSettings }>("/integrations/rdstation/settings", {
        method: "PATCH",
        token,
        body: values,
      });
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao salvar configuração.");
        return;
      }
      setRdSettings(response.data?.settings ?? null);
      msg.success("Configuração salva.");
      setRdConfigOpen(false);
    } finally {
      setRdSaving(false);
    }
  };

  const openRdPreview = async () => {
    if (!selectAllMatching && selectedRowKeys.length < 1) {
      msg.warning("Selecione empresas ou marque todos os filtrados.");
      return;
    }
    setRdPreviewOpen(true);
    setRdPreviewLoading(true);
    try {
      const filters = buildLeadQuery(false);
      if (!selectAllMatching) {
        filters.set("company_ids", selectedRowKeys.map(String).join(","));
      }
      const response = await apiRequest<RdPreview>(
        `/integrations/rdstation/sync/preview?${filters.toString()}`,
        { token },
      );
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao calcular o lote.");
        setRdPreviewOpen(false);
        return;
      }
      setRdPreview(response.data ?? null);
    } finally {
      setRdPreviewLoading(false);
    }
  };

  const handleRdSend = async (options?: { companyId?: string; force?: boolean }) => {
    setRdSending(true);
    try {
      const filters = buildLeadQuery(false);
      const body: Record<string, unknown> = {
        force_resync: Boolean(options?.force),
      };
      if (options?.companyId) {
        body.company_ids = [options.companyId];
        body.select_all_matching = false;
      } else if (selectAllMatching) {
        body.select_all_matching = true;
      } else {
        body.company_ids = selectedRowKeys.map(String);
      }
      const response = await apiRequest<{ job: RdJob }>(
        `/integrations/rdstation/sync?${filters.toString()}`,
        { method: "POST", token, body },
      );
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao enfileirar o envio.");
        return;
      }
      const job = response.data?.job ?? null;
      setRdJob(job);
      setRdPreviewOpen(false);
      if (!job || job.total < 1) {
        msg.info("Nenhuma empresa elegível para enviar.");
        return;
      }
      msg.success(`Envio em fila: ${job.total} empresa(s).`);
    } finally {
      setRdSending(false);
    }
  };

  const openRdHistory = async (companyId: string) => {
    setRdHistoryOpen(true);
    setRdHistoryLoading(true);
    try {
      const response = await apiRequest<{
        logs: Array<{
          id: string;
          action: string;
          success: boolean;
          message: string;
          created_at?: string | null;
        }>;
      }>(`/integrations/rdstation/history?company_id=${companyId}`, { token });
      setRdHistory(response.data?.logs ?? []);
    } finally {
      setRdHistoryLoading(false);
    }
  };

  const handleSaveLead = async () => {
    if (!selectedLeadId) return;
    setSavingLead(true);
    try {
      const response = await apiRequest<{ lead: LeadDetail }>(`/leads/${selectedLeadId}`, {
        method: "PATCH",
        token,
        body: {
          contact_status: statusDraft,
          notes: notesDraft,
        },
      });
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao salvar.");
        return;
      }
      msg.success("Contato atualizado.");
      setLeadDetail(response.data?.lead ?? null);
      if (selectedCompanyId) await fetchCompanyDetail(selectedCompanyId);
      await fetchCompanies();
    } finally {
      setSavingLead(false);
    }
  };

  const handleDeleteImport = (batch: LeadImportItem) => {
    modal.confirm({
      title: "Excluir esta importação?",
      content: `Removerá ${batch.row_count} contato(s) de "${batch.origem}" (${batch.filename || "arquivo"}).`,
      okText: "Excluir",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        const response = await apiRequest(`/leads/imports/${batch.id}`, {
          method: "DELETE",
          token,
        });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao excluir.");
          throw new Error("delete_failed");
        }
        msg.success("Importação removida.");
        await Promise.all([fetchCompanies(), fetchOrigens(), fetchImports()]);
      },
    });
  };

  const handleDeleteCompany = (company: { id: string; name: string; contacts_count?: number }) => {
    modal.confirm({
      title: "Excluir esta empresa?",
      content: `"${company.name}" e ${company.contacts_count ?? 0} contato(s) serão removidos.`,
      okText: "Excluir",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        const response = await apiRequest(`/leads/companies/${company.id}`, {
          method: "DELETE",
          token,
        });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao excluir empresa.");
          throw new Error("delete_failed");
        }
        msg.success("Empresa excluída.");
        if (selectedCompanyId === company.id) setSelectedCompanyId(null);
        await fetchCompanies();
      },
    });
  };

  const handleDeleteLead = (lead: { id: string; display_name: string }) => {
    modal.confirm({
      title: "Excluir este contato?",
      content: `"${lead.display_name}" será removido permanentemente.`,
      okText: "Excluir",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: async () => {
        const response = await apiRequest(`/leads/${lead.id}`, {
          method: "DELETE",
          token,
        });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao excluir contato.");
          throw new Error("delete_failed");
        }
        msg.success("Contato excluído.");
        if (selectedLeadId === lead.id) setSelectedLeadId(null);
        if (selectedCompanyId) await fetchCompanyDetail(selectedCompanyId);
        await fetchCompanies();
      },
    });
  };

  const handleCreateCompany = async () => {
    try {
      const values = await companyForm.validateFields();
      setCreating(true);
      const response = await apiRequest<{ company: CompanyListItem }>("/leads/companies", {
        method: "POST",
        token,
        body: {
          name: values.name,
          cnpj: values.cnpj || "",
          origem: values.origem || "",
          freshness: values.freshness || "novo",
          notes: values.notes || "",
        },
      });
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao criar empresa.");
        return;
      }
      msg.success("Empresa criada.");
      setCompanyCreateOpen(false);
      companyForm.resetFields();
      setPage(1);
      await Promise.all([fetchCompanies(), fetchOrigens()]);
      if (response.data?.company?.id) setSelectedCompanyId(response.data.company.id);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateContact = async () => {
    try {
      const values = await contactForm.validateFields();
      setCreating(true);
      const body: Record<string, unknown> = {
        display_name: values.display_name,
        email: values.email || "",
        phone: values.phone || "",
        cnpj: values.cnpj || "",
        notes: values.notes || "",
        contact_status: values.contact_status || "nao_contatado",
        origem: values.origem || "",
        freshness: values.freshness || "novo",
      };
      if (values.company_id) {
        body.company_id = values.company_id;
      } else {
        body.company_name = values.company_name;
        body.company_cnpj = values.company_cnpj || values.cnpj || "";
      }
      const response = await apiRequest<{ lead: LeadDetail }>("/leads", {
        method: "POST",
        token,
        body,
      });
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao criar contato.");
        return;
      }
      msg.success("Contato criado.");
      setContactCreateOpen(false);
      contactForm.resetFields();
      await Promise.all([fetchCompanies(), fetchOrigens()]);
      const companyId = response.data?.lead?.company_id;
      if (companyId) setSelectedCompanyId(companyId);
    } finally {
      setCreating(false);
    }
  };

  const companyColumns: ColumnsType<CompanyListItem> = useMemo(
    () => [
      {
        title: nowrapHeader("Empresa"),
        dataIndex: "name",
        ellipsis: true,
      },
      {
        title: nowrapHeader("CNPJ"),
        dataIndex: "cnpj",
        width: 160,
        render: (value: string) => formatCnpj(value),
      },
      {
        title: nowrapHeader("Novo/Antigo"),
        dataIndex: "freshness",
        width: 132,
        render: (value: string) => freshnessTag(value),
      },
      {
        title: nowrapHeader("Origem"),
        dataIndex: "origem",
        width: 140,
        ellipsis: true,
        render: (value: string) => (value ? <Tag>{value}</Tag> : "—"),
      },
      {
        title: nowrapHeader("Contatos"),
        dataIndex: "contacts_count",
        width: 108,
      },
      {
        title: nowrapHeader("Prospecção"),
        dataIndex: "completeness_score",
        width: 128,
        render: (value: number) => {
          const quality = qualityLabel(value);
          return (
            <Space size={4} wrap>
              <Tag color={value >= BEST_LEADS_THRESHOLD ? "green" : value >= 35 ? "gold" : "default"}>
                {value}
              </Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {quality.text}
              </Typography.Text>
            </Space>
          );
        },
      },
      {
        title: nowrapHeader("RD CRM"),
        key: "rd",
        width: 140,
        render: (_: unknown, record: CompanyListItem) => (
          <Space size={4} wrap>
            {rdStatusTag(record.rd_status)}
            {record.rd_deal?.stage_name ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {record.rd_deal.stage_name}
              </Typography.Text>
            ) : null}
          </Space>
        ),
      },
      {
        title: nowrapHeader("Qualidade"),
        key: "quality",
        width: 110,
        render: (_: unknown, record: CompanyListItem) => (
          <Space size={8}>
            <FlagIcon ok={record.has_cnpj} label="CNPJ válido" />
            <FlagIcon ok={record.has_phone} label="Telefone útil" />
            <FlagIcon ok={record.has_email} label="E-mail útil" />
          </Space>
        ),
      },
      {
        title: nowrapHeader("Ações"),
        key: "actions",
        width: 168,
        render: (_: unknown, record: CompanyListItem) => (
          <Space size={4} onClick={(event) => event.stopPropagation()}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              title="Abrir"
              onClick={() => setSelectedCompanyId(record.id)}
            />
            <Button
              size="small"
              icon={<SendOutlined />}
              title="Enviar ao RD"
              onClick={() => void handleRdSend({ companyId: record.id })}
            />
            {record.rd_url ? (
              <Button
                size="small"
                title="Ver no RD"
                onClick={() => window.open(record.rd_url, "_blank", "noreferrer")}
              >
                RD
              </Button>
            ) : null}
            {record.rd_status && record.rd_status !== "not_sent" ? (
              <Button
                size="small"
                icon={<SyncOutlined />}
                title="Ressincronizar"
                onClick={() => void handleRdSend({ companyId: record.id, force: true })}
              />
            ) : null}
            <Button
              size="small"
              icon={<HistoryOutlined />}
              title="Histórico RD"
              onClick={() => void openRdHistory(record.id)}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              title="Excluir"
              onClick={() => handleDeleteCompany(record)}
            />
          </Space>
        ),
      },
    ],
    [handleDeleteCompany, handleRdSend, openRdHistory],
  );

  const contactColumns: ColumnsType<LeadListItem> = useMemo(
    () => [
      {
        title: nowrapHeader("Contato"),
        dataIndex: "display_name",
        ellipsis: true,
        render: (value: string, record: LeadListItem) => (
          <Space size={4} wrap>
            <span>{value}</span>
            {record.contact_is_decision_maker ? <Tag color="blue">Decisor</Tag> : null}
            {record.email_is_generic ? <Tag color="orange">Genérico</Tag> : null}
            {record.email_is_shared ? <Tag color="volcano">E-mail compartilhado</Tag> : null}
            {record.phone_is_shared ? <Tag color="volcano">Tel. repetido</Tag> : null}
          </Space>
        ),
      },
      {
        title: nowrapHeader("Novo/Antigo"),
        dataIndex: "freshness",
        width: 132,
        render: (value: string) => freshnessTag(value),
      },
      {
        title: nowrapHeader("Status"),
        dataIndex: "contact_status",
        width: 130,
        render: (value: string) => (
          <Tag color={CONTACT_STATUS_COLORS[value] ?? "default"}>
            {CONTACT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value}
          </Tag>
        ),
      },
      {
        title: nowrapHeader("Cargo"),
        dataIndex: "job_title",
        ellipsis: true,
        width: 140,
        render: (value: string) => value || "—",
      },
      {
        title: nowrapHeader("E-mail"),
        dataIndex: "email",
        ellipsis: true,
        render: (value: string) => value || "—",
      },
      {
        title: nowrapHeader("Telefone"),
        dataIndex: "phone",
        width: 120,
        render: (value: string) => value || "—",
      },
      {
        title: nowrapHeader("Score"),
        dataIndex: "completeness_score",
        width: 70,
      },
      {
        title: "",
        key: "actions",
        width: 90,
        render: (_: unknown, record: LeadListItem) => (
          <Space size={4} onClick={(event) => event.stopPropagation()}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedLeadId(record.id)} />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteLead(record)}
            />
          </Space>
        ),
      },
    ],
    [],
  );

  const origemOptions = useMemo(
    () => [
      { value: "all", label: "Todas as origens" },
      ...origens.map((o) => ({ value: o, label: o })),
    ],
    [origens],
  );

  const companySelectOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );

  const detailPayloadItems = useMemo(() => {
    if (!leadDetail) return [];
    const keys = leadDetail.column_keys?.length
      ? leadDetail.column_keys
      : Object.keys(leadDetail.payload ?? {});
    return keys.map((key) => ({
      key,
      label: key,
      children: renderPayloadValue(leadDetail.payload?.[key]),
    }));
  }, [leadDetail]);

  return (
    <>
      {msgHolder}
      <Card
        title="Banco de leads"
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchCompanies()} loading={loading}>
              Atualizar
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => void openRdConfig()}>
              RD Station
            </Button>
            <Button
              icon={<SendOutlined />}
              disabled={total < 1 || (!selectAllMatching && selectedRowKeys.length < 1)}
              loading={rdSending}
              onClick={() => void openRdPreview()}
            >
              Enviar ao RD
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                companyForm.resetFields();
                companyForm.setFieldsValue({ freshness: "novo" });
                setCompanyCreateOpen(true);
              }}
            >
              Nova empresa
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                contactForm.resetFields();
                contactForm.setFieldsValue({
                  freshness: "novo",
                  contact_status: "nao_contatado",
                  company_id: selectedCompanyId || undefined,
                });
                setContactCreateOpen(true);
              }}
            >
              Novo contato
            </Button>
            <Button onClick={() => setManageImportsOpen(true)}>Importações</Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => {
                resetImportWizard();
                setImportOpen(true);
              }}
            >
              Importar planilha
            </Button>
          </Space>
        }
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap style={{ width: "100%" }}>
            <Input.Search
              allowClear
              placeholder="Buscar empresa, CNPJ, contato..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onSearch={(value) => {
                setPage(1);
                setSearch(value);
              }}
              style={{ width: 280 }}
            />
            <Select
              style={{ minWidth: 180 }}
              value={origemFilter}
              options={origemOptions}
              onChange={(value) => {
                setPage(1);
                setOrigemFilter(value);
              }}
              showSearch
              optionFilterProp="label"
            />
            <Select
              style={{ minWidth: 140 }}
              value={freshnessFilter}
              options={[{ value: "all", label: "Novo e antigo" }, ...FRESHNESS_OPTIONS]}
              onChange={(value) => {
                setPage(1);
                setFreshnessFilter(value);
              }}
            />
            <Select
              style={{ minWidth: 180 }}
              value={contactStatusFilter}
              options={[{ value: "all", label: "Todos os status" }, ...CONTACT_STATUS_OPTIONS]}
              onChange={(value) => {
                setPage(1);
                setContactStatusFilter(value);
              }}
            />
            <Checkbox
              checked={hasCnpj}
              onChange={(e) => {
                setPage(1);
                setHasCnpj(e.target.checked);
              }}
            >
              Com CNPJ
            </Checkbox>
            <Checkbox
              checked={hasPhone}
              onChange={(e) => {
                setPage(1);
                setHasPhone(e.target.checked);
              }}
            >
              Com telefone
            </Checkbox>
            <Checkbox
              checked={hasEmail}
              onChange={(e) => {
                setPage(1);
                setHasEmail(e.target.checked);
              }}
            >
              Com e-mail
            </Checkbox>
            <Checkbox
              checked={bestOnly}
              onChange={(e) => {
                setPage(1);
                setBestOnly(e.target.checked);
              }}
            >
              Melhores leads
            </Checkbox>
            <Checkbox
              checked={decisionMakersOnly}
              onChange={(e) => {
                setPage(1);
                setDecisionMakersOnly(e.target.checked);
              }}
            >
              Só decisores
            </Checkbox>
            <Checkbox
              checked={hideGenericEmail}
              onChange={(e) => {
                setPage(1);
                setHideGenericEmail(e.target.checked);
              }}
            >
              Esconder e-mail genérico
            </Checkbox>
            <Checkbox
              checked={hideSharedPhone}
              onChange={(e) => {
                setPage(1);
                setHideSharedPhone(e.target.checked);
              }}
            >
              Esconder telefone repetido
            </Checkbox>
            <Select
              style={{ minWidth: 160 }}
              value={rdStatusFilter}
              options={RD_STATUS_OPTIONS}
              onChange={(value) => {
                setPage(1);
                setRdStatusFilter(value);
              }}
            />
            <Checkbox
              checked={selectAllMatching}
              onChange={(e) => {
                setSelectAllMatching(e.target.checked);
                if (e.target.checked) {
                  setSelectedRowKeys(companies.map((row) => row.id));
                } else {
                  setSelectedRowKeys([]);
                }
              }}
            >
              Todos os filtrados ({total})
            </Checkbox>
          </Space>

          <Typography.Text type="secondary">
            Cada linha é uma empresa. Score de prospecção prioriza contato nominativo e
            decisor; e-mail genérico e telefone repetido perdem pontos. Use a seta à
            esquerda para ver as pessoas. Enviar ao RD usa a lista filtrada (todas as
            páginas) quando “Todos os filtrados” está marcado.
          </Typography.Text>

          {rdJob && rdJob.status !== "done" && rdJob.status !== "failed" ? (
            <Alert
              showIcon
              type="info"
              title="Enviando para o RD Station CRM"
              description={`${rdJob.done} de ${rdJob.total} empresa(s). ${rdJob.success} ok, ${rdJob.error} erro(s). Pode sair desta página; o worker continua.`}
            />
          ) : null}

          {rdJob && (rdJob.status === "done" || rdJob.status === "failed") ? (
            <Alert
              showIcon
              closable
              onClose={() => setRdJob(null)}
              type={rdJob.error > 0 ? "warning" : "success"}
              title="Envio RD concluído"
              description={`${rdJob.success} enviada(s), ${rdJob.error} com erro, ${rdJob.skipped} ignorada(s).`}
            />
          ) : null}

          <Table<CompanyListItem>
            rowKey="id"
            loading={loading}
            dataSource={companies}
            columns={companyColumns}
            scroll={{ x: 1380 }}
            rowSelection={{
              selectedRowKeys: selectAllMatching ? companies.map((row) => row.id) : selectedRowKeys,
              onChange: (keys) => {
                setSelectAllMatching(false);
                setSelectedRowKeys(keys);
              },
            }}
            expandable={{
              columnWidth: 40,
              expandedRowKeys,
              onExpandedRowsChange: (keys) => {
                expandedRowKeysRef.current = [...keys];
                setExpandedRowKeys([...keys]);
              },
              rowExpandable: (record) => (record.contacts_count ?? 0) > 0,
              onExpand: (expanded, record) => {
                if (expanded) void loadCompanyContacts(record.id);
              },
              expandedRowRender: (record) => (
                <div onClick={(event) => event.stopPropagation()} style={{ margin: "4px 0 4px 24px" }}>
                  <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                    Pessoas / leads desta empresa
                  </Typography.Text>
                  <Table<LeadListItem>
                    size="small"
                    rowKey="id"
                    pagination={false}
                    loading={Boolean(contactsLoading[record.id]) && !contactsByCompany[record.id]}
                    dataSource={contactsByCompany[record.id] ?? []}
                    columns={contactColumns}
                    onRow={(contact) => ({
                      onClick: () => setSelectedLeadId(contact.id),
                      style: { cursor: "pointer" },
                    })}
                    locale={{ emptyText: "Nenhum contato nesta empresa." }}
                  />
                </div>
              ),
            }}
            onRow={(record) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest(".ant-table-row-expand-icon-cell, .ant-table-row-expand-icon")) {
                  return;
                }
                setSelectedCompanyId(record.id);
              },
              style: { cursor: "pointer" },
            })}
            pagination={{
              current: page,
              pageSize: 20,
              total,
              showSizeChanger: false,
              onChange: (next) => setPage(next),
              showTotal: (t) => `${t} empresa(s)`,
            }}
            locale={{
              emptyText:
                "Nenhuma empresa ainda. Importe uma planilha ou cadastre uma empresa manualmente.",
            }}
          />
        </Space>
      </Card>

      <Drawer
        title={companyDetail?.name ?? "Empresa"}
        open={Boolean(selectedCompanyId)}
        onClose={() => setSelectedCompanyId(null)}
        size={720}
        destroyOnHidden
        styles={{
          body: { paddingBottom: 40 },
          footer: { paddingBottom: 20 },
        }}
        extra={
          <Space>
            <Button
              icon={<SendOutlined />}
              loading={rdSending}
              onClick={() => {
                if (!selectedCompanyId) return;
                void handleRdSend({ companyId: selectedCompanyId });
              }}
            >
              Enviar ao RD
            </Button>
            {companyDetail?.rd_url ? (
              <Button onClick={() => window.open(companyDetail.rd_url, "_blank", "noreferrer")}>
                Ver no RD
              </Button>
            ) : null}
            {companyDetail?.rd_status && companyDetail.rd_status !== "not_sent" ? (
              <Button
                icon={<SyncOutlined />}
                onClick={() => {
                  if (!selectedCompanyId) return;
                  void handleRdSend({ companyId: selectedCompanyId, force: true });
                }}
              >
                Ressincronizar
              </Button>
            ) : null}
            <Button
              onClick={() => {
                if (!selectedCompanyId) return;
                void openRdHistory(selectedCompanyId);
              }}
            >
              Histórico RD
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                if (!companyDetail) return;
                handleDeleteCompany(companyDetail);
              }}
            >
              Excluir
            </Button>
            <Button type="primary" loading={savingCompany} onClick={() => void handleSaveCompanyNotes()}>
              Salvar notas
            </Button>
          </Space>
        }
      >
        {companyLoading && !companyDetail ? (
          <Typography.Text type="secondary">Carregando...</Typography.Text>
        ) : companyDetail ? (
          <Space orientation="vertical" size={16} style={{ width: "100%", paddingBottom: 16 }}>
            <Space wrap>
              {companyDetail.origem ? <Tag>{companyDetail.origem}</Tag> : null}
              {freshnessTag(companyDetail.freshness)}
            </Space>

            <ScoreQualityInfo
              score={companyDetail.completeness_score}
              hasCnpj={companyDetail.has_cnpj}
              hasPhone={companyDetail.has_phone}
              hasEmail={companyDetail.has_email}
              breakdown={companyDetail.score_breakdown}
              flags={{
                email_is_generic: companyDetail.email_is_generic,
                email_is_shared: companyDetail.email_is_shared,
                phone_is_shared: companyDetail.phone_is_shared,
                contact_is_decision_maker: companyDetail.contact_is_decision_maker,
                contact_is_person: companyDetail.contact_is_person,
              }}
            />

            <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label="CNPJ">{formatCnpj(companyDetail.cnpj)}</Descriptions.Item>
              <Descriptions.Item label="Contatos">{companyDetail.contacts_count}</Descriptions.Item>
              <Descriptions.Item label="Domínio">{companyDetail.website_domain || "—"}</Descriptions.Item>
              <Descriptions.Item label="RD CRM">
                <Space wrap>
                  {rdStatusTag(companyDetail.rd_status)}
                  {companyDetail.rd_deal?.stage_name ? (
                    <Typography.Text type="secondary">{companyDetail.rd_deal.stage_name}</Typography.Text>
                  ) : null}
                  {companyDetail.rd_last_error ? (
                    <Typography.Text type="danger">{companyDetail.rd_last_error}</Typography.Text>
                  ) : null}
                </Space>
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Text type="secondary">Notas da empresa</Typography.Text>
              <Input.TextArea
                style={{ marginTop: 4 }}
                rows={3}
                value={companyNotesDraft}
                onChange={(e) => setCompanyNotesDraft(e.target.value)}
                placeholder="Observações sobre a conta..."
              />
            </div>

            <div>
              <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  Contatos
                </Typography.Title>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    contactForm.resetFields();
                    contactForm.setFieldsValue({
                      company_id: companyDetail.id,
                      freshness: "novo",
                      contact_status: "nao_contatado",
                    });
                    setContactCreateOpen(true);
                  }}
                >
                  Novo contato
                </Button>
              </Space>
              <Table<LeadListItem>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={companyDetail.contacts ?? []}
                columns={contactColumns}
                locale={{ emptyText: "Nenhum contato nesta empresa." }}
              />
            </div>
          </Space>
        ) : (
          <Typography.Text type="secondary">Empresa nao encontrada.</Typography.Text>
        )}
      </Drawer>

      <Modal
        title={leadDetail?.display_name ?? "Contato"}
        open={Boolean(selectedLeadId)}
        onCancel={() => setSelectedLeadId(null)}
        width={760}
        destroyOnHidden
        styles={{
          body: { paddingBottom: 12, maxHeight: "70vh", overflowY: "auto" },
          footer: { paddingTop: 16, paddingBottom: 20, marginTop: 0 },
        }}
        footer={[
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              if (!leadDetail) return;
              handleDeleteLead(leadDetail);
            }}
          >
            Excluir
          </Button>,
          <Button key="close" onClick={() => setSelectedLeadId(null)}>
            Fechar
          </Button>,
          <Button key="save" type="primary" loading={savingLead} onClick={() => void handleSaveLead()}>
            Salvar
          </Button>,
        ]}
      >
        {leadLoading && !leadDetail ? (
          <Typography.Text type="secondary">Carregando...</Typography.Text>
        ) : leadDetail ? (
          <Space orientation="vertical" size={16} style={{ width: "100%", paddingBottom: 8 }}>
            <Space wrap>
              {leadDetail.company_name ? <Tag color="blue">{leadDetail.company_name}</Tag> : null}
              {leadDetail.origem ? <Tag>{leadDetail.origem}</Tag> : null}
              {freshnessTag(leadDetail.freshness)}
            </Space>

            <ScoreQualityInfo
              score={leadDetail.completeness_score}
              hasCnpj={leadDetail.has_cnpj}
              hasPhone={leadDetail.has_phone}
              hasEmail={leadDetail.has_email}
              breakdown={leadDetail.score_breakdown}
              flags={{
                email_is_generic: leadDetail.email_is_generic,
                email_is_shared: leadDetail.email_is_shared,
                phone_is_shared: leadDetail.phone_is_shared,
                contact_is_decision_maker: leadDetail.contact_is_decision_maker,
                contact_is_person: leadDetail.contact_is_person,
              }}
            />

            <Card size="small" title="Contato">
              <Row gutter={12}>
                <Col xs={24} md={10}>
                  <Typography.Text type="secondary">Status de contato</Typography.Text>
                  <Select
                    style={{ width: "100%", marginTop: 4 }}
                    value={statusDraft}
                    options={CONTACT_STATUS_OPTIONS}
                    onChange={setStatusDraft}
                  />
                </Col>
                <Col xs={24} md={14}>
                  <Typography.Text type="secondary">Descrição / retorno</Typography.Text>
                  <Input.TextArea
                    style={{ marginTop: 4 }}
                    rows={3}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Anote o retorno do contato, observações, próximos passos..."
                  />
                </Col>
              </Row>
            </Card>

            <Card size="small" title="Dados da planilha">
              <Descriptions
                size="small"
                column={1}
                bordered
                styles={{
                  label: { width: 200, whiteSpace: "nowrap" },
                  content: { minWidth: 0, wordBreak: "break-word" },
                }}
                items={detailPayloadItems}
              />
            </Card>
          </Space>
        ) : (
          <Typography.Text type="secondary">Contato nao encontrado.</Typography.Text>
        )}
      </Modal>

      <Modal
        title="Nova empresa"
        open={companyCreateOpen}
        onCancel={() => setCompanyCreateOpen(false)}
        onOk={() => void handleCreateCompany()}
        confirmLoading={creating}
        okText="Criar"
        width={640}
        destroyOnHidden={false}
      >
        {companyCreateOpen ? (
          <Form form={companyForm} layout="vertical">
            <Row gutter={12}>
              <Col xs={24} md={14}>
                <Form.Item
                  name="name"
                  label="Nome"
                  rules={[{ required: true, message: "Informe o nome." }]}
                >
                  <Input placeholder="Razão social / nome fantasia" />
                </Form.Item>
              </Col>
              <Col xs={24} md={10}>
                <Form.Item name="cnpj" label="CNPJ">
                  <Input placeholder="Somente números ou formatado" />
                </Form.Item>
              </Col>
              <Col xs={24} md={14}>
                <Form.Item name="origem" label="Origem">
                  <AutoComplete
                    options={origens.map((o) => ({ value: o }))}
                    placeholder="Ex.: Manual, Scrapper..."
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={10}>
                <Form.Item name="freshness" label="Novo ou antigo">
                  <Select options={FRESHNESS_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="notes" label="Notas" style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        ) : null}
      </Modal>

      <Modal
        title="Novo contato"
        open={contactCreateOpen}
        onCancel={() => setContactCreateOpen(false)}
        onOk={() => void handleCreateContact()}
        confirmLoading={creating}
        okText="Criar"
        width={720}
        destroyOnHidden={false}
      >
        {contactCreateOpen ? (
          <Form form={contactForm} layout="vertical">
            <Row gutter={12}>
              <Col span={24}>
                <Form.Item name="company_id" label="Empresa existente">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={companySelectOptions}
                    placeholder="Selecione ou deixe vazio para criar nova"
                  />
                </Form.Item>
              </Col>
              <Form.Item noStyle shouldUpdate={(prev, next) => prev.company_id !== next.company_id}>
                {() =>
                  contactForm.getFieldValue("company_id") ? null : (
                    <>
                      <Col xs={24} md={14}>
                        <Form.Item
                          name="company_name"
                          label="Nova empresa"
                          rules={[{ required: true, message: "Informe a empresa." }]}
                        >
                          <Input placeholder="Nome da empresa" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={10}>
                        <Form.Item name="company_cnpj" label="CNPJ da empresa">
                          <Input />
                        </Form.Item>
                      </Col>
                    </>
                  )
                }
              </Form.Item>
              <Col span={24}>
                <Form.Item
                  name="display_name"
                  label="Nome do contato"
                  rules={[{ required: true, message: "Informe o contato." }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="email" label="E-mail">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="phone" label="Telefone">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="cnpj" label="CNPJ (contato)">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="contact_status" label="Status">
                  <Select options={CONTACT_STATUS_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="freshness" label="Novo ou antigo">
                  <Select options={FRESHNESS_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="origem" label="Origem">
                  <AutoComplete options={origens.map((o) => ({ value: o }))} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="notes" label="Notas" style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        ) : null}
      </Modal>

      <Modal
        title="Importar planilha"
        open={importOpen}
        onCancel={() => {
          setImportOpen(false);
          resetImportWizard();
        }}
        width={720}
        destroyOnHidden
        footer={
          importStep === 1
            ? [
                <Button
                  key="cancel"
                  onClick={() => {
                    setImportOpen(false);
                    resetImportWizard();
                  }}
                >
                  Cancelar
                </Button>,
                <Button
                  key="next"
                  type="primary"
                  loading={previewLoading}
                  onClick={() => void handlePreview()}
                >
                  Continuar
                </Button>,
              ]
            : [
                <Button key="back" onClick={() => setImportStep(1)}>
                  Voltar
                </Button>,
                <Button
                  key="confirm"
                  type="primary"
                  loading={importing}
                  onClick={() => void handleConfirmImport()}
                >
                  Confirmar importação
                </Button>,
              ]
        }
      >
        {importStep === 1 ? (
          <Space orientation="vertical" size={14} style={{ width: "100%" }}>
            <div>
              <Typography.Text type="secondary">Arquivo (CSV ou XLSX)</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Upload
                  accept=".csv,.txt,.xlsx,.xlsm"
                  maxCount={1}
                  beforeUpload={(file) => {
                    setImportFile(file);
                    return false;
                  }}
                  onRemove={() => setImportFile(null)}
                  fileList={
                    importFile
                      ? [
                          {
                            uid: "-1",
                            name: importFile.name,
                            status: "done",
                          },
                        ]
                      : []
                  }
                >
                  <Button icon={<UploadOutlined />}>Selecionar arquivo</Button>
                </Upload>
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">Origem</Typography.Text>
              <AutoComplete
                style={{ width: "100%", marginTop: 4 }}
                options={origens.map((o) => ({ value: o }))}
                value={importOrigem}
                onChange={setImportOrigem}
                placeholder="Ex.: Scrapper Construtoras, INTEXFY, Lista Leads2b"
                filterOption={(input, option) =>
                  String(option?.value ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </div>
            <div>
              <Typography.Text type="secondary">Novo ou antigo</Typography.Text>
              <Select
                style={{ width: "100%", marginTop: 4 }}
                value={importFreshness}
                options={FRESHNESS_OPTIONS}
                onChange={(value) => setImportFreshness(value)}
              />
            </div>
          </Space>
        ) : (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              <strong>{preview?.filename}</strong> — {preview?.row_count ?? 0} linha(s),{" "}
              {preview?.column_keys?.length ?? 0} coluna(s). Origem: <Tag>{importOrigem}</Tag>{" "}
              <Tag color={importFreshness === "novo" ? "green" : "default"}>
                {importFreshness === "novo" ? "Novo" : "Antigo"}
              </Tag>
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey="__key"
              pagination={false}
              scroll={{ x: true }}
              dataSource={(preview?.preview_rows ?? []).map((row, i) => ({
                ...row,
                __key: `preview-${i}`,
              }))}
              columns={(preview?.column_keys ?? []).slice(0, 8).map((key) => ({
                title: key,
                dataIndex: key,
                ellipsis: true,
                width: 140,
                render: (value: string | undefined) => value || "—",
              }))}
            />
            <Typography.Text type="secondary">
              Contatos serão agrupados por CNPJ ou nome da empresa automaticamente.
            </Typography.Text>
          </Space>
        )}
      </Modal>

      <Modal
        title="Importações"
        open={manageImportsOpen}
        onCancel={() => setManageImportsOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Table<LeadImportItem>
          rowKey="id"
          size="small"
          dataSource={imports}
          pagination={false}
          columns={[
            { title: "Origem", dataIndex: "origem", ellipsis: true },
            {
              title: "Tipo",
              dataIndex: "freshness",
              width: 100,
              render: (v: string) => (v === "novo" ? "Novo" : "Antigo"),
            },
            { title: "Arquivo", dataIndex: "filename", ellipsis: true },
            { title: "Leads", dataIndex: "row_count", width: 80 },
            {
              title: "Data",
              dataIndex: "created_at",
              width: 160,
              render: (v: string | null | undefined) =>
                v ? new Date(v).toLocaleString("pt-BR") : "—",
            },
            {
              title: "",
              width: 64,
              render: (_: unknown, record: LeadImportItem) => (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteImport(record)}
                />
              ),
            },
          ]}
          locale={{ emptyText: "Nenhuma importação." }}
        />
      </Modal>

      <RdConfigModal
        open={rdConfigOpen}
        saving={rdSaving}
        connecting={rdConnecting}
        status={rdStatus}
        settings={rdSettings}
        pipelines={rdPipelines}
        stages={rdStages}
        owners={rdOwners}
        sources={rdSources}
        customFields={rdCustomFields}
        optionsError={rdOptionsError}
        onClose={() => setRdConfigOpen(false)}
        onConnect={() => void handleRdConnect()}
        onDisconnect={() => void handleRdDisconnect()}
        onSave={(values) => void handleRdSaveSettings(values)}
      />
      <RdPreviewModal
        open={rdPreviewOpen}
        loading={rdPreviewLoading}
        sending={rdSending}
        preview={rdPreview}
        selectAll={selectAllMatching}
        selectedCount={selectedRowKeys.length}
        onClose={() => setRdPreviewOpen(false)}
        onConfirm={() => void handleRdSend()}
      />
      <RdHistoryDrawer
        open={rdHistoryOpen}
        loading={rdHistoryLoading}
        logs={rdHistory}
        onClose={() => setRdHistoryOpen(false)}
      />
    </>
  );
}
