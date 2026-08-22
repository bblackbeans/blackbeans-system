"use client";

import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "@/lib/api";

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
  contacts_count: number;
  contacts?: LeadListItem[];
  notes?: string;
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

/** Espelhamento da regra em leads/services.py — só para exibir na UI. */
const SCORE_BREAKDOWN = [
  { label: "CNPJ", points: 35 },
  { label: "Telefone", points: 25 },
  { label: "E-mail", points: 25 },
  { label: "Site", points: 10 },
  { label: "Endereço", points: 5 },
] as const;

const BEST_LEADS_THRESHOLD = 60;

function qualityLabel(score: number | undefined | null) {
  const value = Number(score ?? 0);
  if (value >= BEST_LEADS_THRESHOLD) return { text: "Melhor lead", color: "green" as const };
  if (value >= 35) return { text: "Média", color: "gold" as const };
  return { text: "Baixa", color: "default" as const };
}

function ScoreQualityInfo({
  score,
  hasCnpj,
  hasPhone,
  hasEmail,
}: {
  score?: number | null;
  hasCnpj?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
}) {
  const value = Number(score ?? 0);
  const quality = qualityLabel(value);
  return (
    <Card size="small" title="Score e qualidade (BlackBeans)">
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        <Space wrap>
          <Tag color={value >= BEST_LEADS_THRESHOLD ? "green" : "default"}>Score {value}/100</Tag>
          <Tag color={quality.color}>{quality.text}</Tag>
          <Space size={8}>
            <FlagIcon ok={Boolean(hasCnpj)} label="CNPJ" />
            <FlagIcon ok={Boolean(hasPhone)} label="Telefone" />
            <FlagIcon ok={Boolean(hasEmail)} label="E-mail" />
          </Space>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Nota calculada só com os dados da planilha/cadastro (sem APIs externas). Pontos:{" "}
          {SCORE_BREAKDOWN.map((item) => `${item.label} +${item.points}`).join(" · ")}. O filtro{" "}
          <strong>Melhores leads</strong> usa score ≥ {BEST_LEADS_THRESHOLD}. Campos como
          &quot;Classificação&quot; na planilha são da origem importada, não desta nota.
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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyNotesDraft, setCompanyNotesDraft] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

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

  const fetchCompanies = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        ordering: "-completeness_score",
        include_contacts: "true",
      });
      if (search.trim()) params.set("q", search.trim());
      if (origemFilter !== "all") params.set("origem", origemFilter);
      if (freshnessFilter !== "all") params.set("freshness", freshnessFilter);
      if (contactStatusFilter !== "all") params.set("contact_status", contactStatusFilter);
      if (hasCnpj) params.set("has_cnpj", "true");
      if (hasPhone) params.set("has_phone", "true");
      if (hasEmail) params.set("has_email", "true");
      if (bestOnly) params.set("quality", "best");

      const response = await apiRequest<{ companies: CompanyListItem[] }>(
        `/leads/companies?${params.toString()}`,
        { token },
      );

      if (seq !== fetchSeqRef.current) return;
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao carregar empresas.");
        return;
      }
      setCompanies(response.data?.companies ?? []);
      setTotal(Number(response.meta?.total ?? 0));
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [
    bestOnly,
    contactStatusFilter,
    freshnessFilter,
    hasCnpj,
    hasEmail,
    hasPhone,
    msg,
    origemFilter,
    page,
    search,
    token,
  ]);

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
    Modal.confirm({
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
    Modal.confirm({
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
    Modal.confirm({
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
        title: "Empresa",
        dataIndex: "name",
        ellipsis: true,
      },
      {
        title: "CNPJ",
        dataIndex: "cnpj",
        width: 160,
        render: (value: string) => formatCnpj(value),
      },
      {
        title: "Novo/Antigo",
        dataIndex: "freshness",
        width: 110,
        render: (value: string) => freshnessTag(value),
      },
      {
        title: "Origem",
        dataIndex: "origem",
        width: 140,
        ellipsis: true,
        render: (value: string) => (value ? <Tag>{value}</Tag> : "—"),
      },
      {
        title: "Contatos",
        dataIndex: "contacts_count",
        width: 90,
      },
      {
        title: "Score",
        dataIndex: "completeness_score",
        width: 120,
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
        title: "Qualidade",
        key: "quality",
        width: 110,
        render: (_: unknown, record: CompanyListItem) => (
          <Space size={8}>
            <FlagIcon ok={record.has_cnpj} label="CNPJ" />
            <FlagIcon ok={record.has_phone} label="Telefone" />
            <FlagIcon ok={record.has_email} label="E-mail" />
          </Space>
        ),
      },
      {
        title: "Ações",
        key: "actions",
        width: 100,
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
              danger
              icon={<DeleteOutlined />}
              title="Excluir"
              onClick={() => handleDeleteCompany(record)}
            />
          </Space>
        ),
      },
    ],
    [],
  );

  const contactColumns: ColumnsType<LeadListItem> = useMemo(
    () => [
      {
        title: "Contato",
        dataIndex: "display_name",
        ellipsis: true,
      },
      {
        title: "Novo/Antigo",
        dataIndex: "freshness",
        width: 110,
        render: (value: string) => freshnessTag(value),
      },
      {
        title: "Status",
        dataIndex: "contact_status",
        width: 130,
        render: (value: string) => (
          <Tag color={CONTACT_STATUS_COLORS[value] ?? "default"}>
            {CONTACT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value}
          </Tag>
        ),
      },
      {
        title: "E-mail",
        dataIndex: "email",
        ellipsis: true,
        render: (value: string) => value || "—",
      },
      {
        title: "Telefone",
        dataIndex: "phone",
        width: 120,
        render: (value: string) => value || "—",
      },
      {
        title: "Score",
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
          </Space>

          <Typography.Text type="secondary">
            Cada linha é uma empresa. Use a seta à esquerda para ver as pessoas (leads) agrupadas dentro.
          </Typography.Text>

          <Table<CompanyListItem>
            rowKey="id"
            loading={loading}
            dataSource={companies}
            columns={companyColumns}
            scroll={{ x: 1100 }}
            expandable={{
              columnWidth: 40,
              rowExpandable: (record) => (record.contacts_count ?? record.contacts?.length ?? 0) > 0,
              expandedRowRender: (record) => (
                <div onClick={(event) => event.stopPropagation()} style={{ margin: "4px 0 4px 24px" }}>
                  <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                    Pessoas / leads desta empresa
                  </Typography.Text>
                  <Table<LeadListItem>
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={record.contacts ?? []}
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
            />

            <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label="CNPJ">{formatCnpj(companyDetail.cnpj)}</Descriptions.Item>
              <Descriptions.Item label="Contatos">{companyDetail.contacts_count}</Descriptions.Item>
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
    </>
  );
}
