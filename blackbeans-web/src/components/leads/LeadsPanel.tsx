"use client";

import {
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  AutoComplete,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
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
  import_id: string;
  origem: string;
  freshness: "novo" | "antigo" | string;
  filename?: string;
  column_keys?: string[];
  display_name: string;
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
  return <Typography.Text style={{ whiteSpace: "pre-wrap" }}>{text}</Typography.Text>;
}

type LeadsPanelProps = {
  token: string;
};

export function LeadsPanel({ token }: LeadsPanelProps) {
  const [msg, msgHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const fetchSeqRef = useRef(0);

  const [items, setItems] = useState<LeadListItem[]>([]);
  const [extraColumnKeys, setExtraColumnKeys] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [imports, setImports] = useState<LeadImportItem[]>([]);

  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [freshnessFilter, setFreshnessFilter] = useState<string>("all");
  const [contactFilter, setContactFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState("nao_contatado");
  const [notesDraft, setNotesDraft] = useState("");

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

  const fetchList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (search.trim()) params.set("q", search.trim());
      if (origemFilter !== "all") params.set("origem", origemFilter);
      if (freshnessFilter !== "all") params.set("freshness", freshnessFilter);
      if (contactFilter !== "all") params.set("contact_status", contactFilter);

      const response = await apiRequest<{
        leads: LeadListItem[];
        extra_column_keys?: string[];
      }>(`/leads?${params.toString()}`, { token });

      if (seq !== fetchSeqRef.current) return;
      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao carregar leads.");
        return;
      }
      setItems(response.data?.leads ?? []);
      setExtraColumnKeys(response.data?.extra_column_keys ?? []);
      setTotal(Number(response.meta?.total ?? 0));
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [contactFilter, freshnessFilter, msg, origemFilter, page, search, token]);

  const fetchDetail = useCallback(
    async (leadId: string) => {
      setDetailLoading(true);
      try {
        const response = await apiRequest<{ lead: LeadDetail }>(`/leads/${leadId}`, { token });
        if (!response.ok) {
          msg.error(response.error?.message ?? "Falha ao carregar lead.");
          return;
        }
        const row = response.data?.lead ?? null;
        setDetail(row);
        if (row) {
          setStatusDraft(row.contact_status);
          setNotesDraft(row.notes ?? "");
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [msg, token],
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void fetchOrigens();
    void fetchImports();
  }, [fetchImports, fetchOrigens]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void fetchDetail(selectedId);
  }, [fetchDetail, selectedId]);

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
      msg.success(`${response.data?.created_count ?? 0} lead(s) importado(s).`);
      setImportOpen(false);
      resetImportWizard();
      setPage(1);
      await Promise.all([fetchList(), fetchOrigens(), fetchImports()]);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveDetail = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const response = await apiRequest<{ lead: LeadDetail }>(`/leads/${selectedId}`, {
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
      msg.success("Lead atualizado.");
      setDetail(response.data?.lead ?? null);
      await fetchList();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteImport = (batch: LeadImportItem) => {
    Modal.confirm({
      title: "Excluir esta importação?",
      content: `Removerá ${batch.row_count} lead(s) de "${batch.origem}" (${batch.filename || "arquivo"}).`,
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
        await Promise.all([fetchList(), fetchOrigens(), fetchImports()]);
      },
    });
  };

  const handleDeleteLead = (lead: { id: string; display_name: string }) => {
    Modal.confirm({
      title: "Excluir este lead?",
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
          msg.error(response.error?.message ?? "Falha ao excluir lead.");
          throw new Error("delete_failed");
        }
        msg.success("Lead excluído.");
        if (selectedId === lead.id) setSelectedId(null);
        await Promise.all([fetchList(), fetchImports()]);
      },
    });
  };

  const columns: ColumnsType<LeadListItem> = useMemo(() => {
    const base: ColumnsType<LeadListItem> = [
      {
        title: "Origem",
        dataIndex: "origem",
        width: 160,
        ellipsis: true,
        render: (value: string) => <Tag>{value}</Tag>,
      },
      {
        title: "Novo/Antigo",
        dataIndex: "freshness",
        width: 120,
        render: (value: string) => (
          <Tag color={value === "novo" ? "green" : "default"}>
            {value === "novo" ? "Novo" : value === "antigo" ? "Antigo" : value}
          </Tag>
        ),
      },
      {
        title: "Status contato",
        dataIndex: "contact_status",
        width: 140,
        render: (value: string) => (
          <Tag color={CONTACT_STATUS_COLORS[value] ?? "default"}>
            {CONTACT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value}
          </Tag>
        ),
      },
      {
        title: "Nome",
        dataIndex: "display_name",
        ellipsis: true,
      },
    ];

    for (const key of extraColumnKeys) {
      base.push({
        title: key,
        key: `extra-${key}`,
        ellipsis: true,
        width: 140,
        render: (_: unknown, record: LeadListItem) => {
          const value = record.payload_preview?.[key];
          return value ? (
            <Typography.Text ellipsis style={{ maxWidth: 140 }}>
              {value}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          );
        },
      });
    }

    base.push({
      title: "Ações",
      key: "actions",
      width: 100,
      render: (_: unknown, record: LeadListItem) => (
        <Space size={4} onClick={(event) => event.stopPropagation()}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            title="Abrir"
            onClick={() => setSelectedId(record.id)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            title="Excluir"
            onClick={() => handleDeleteLead(record)}
          />
        </Space>
      ),
    });

    return base;
  }, [extraColumnKeys, handleDeleteLead]);

  const origemOptions = useMemo(
    () => [
      { value: "all", label: "Todas as origens" },
      ...origens.map((o) => ({ value: o, label: o })),
    ],
    [origens],
  );

  const detailPayloadItems = useMemo(() => {
    if (!detail) return [];
    const keys = detail.column_keys?.length
      ? detail.column_keys
      : Object.keys(detail.payload ?? {});
    return keys.map((key) => ({
      key,
      label: key,
      children: renderPayloadValue(detail.payload?.[key]),
    }));
  }, [detail]);

  return (
    <>
      {msgHolder}
      <Card
        title="Banco de leads"
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchList()} loading={loading}>
              Atualizar
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
              placeholder="Buscar em todos os campos..."
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
              style={{ minWidth: 160 }}
              value={contactFilter}
              options={[{ value: "all", label: "Todos os status" }, ...CONTACT_STATUS_OPTIONS]}
              onChange={(value) => {
                setPage(1);
                setContactFilter(value);
              }}
            />
          </Space>

          <Table<LeadListItem>
            rowKey="id"
            loading={loading}
            dataSource={items}
            columns={columns}
            scroll={{ x: 900 }}
            onRow={(record) => ({
              onClick: () => setSelectedId(record.id),
              style: { cursor: "pointer" },
            })}
            pagination={{
              current: page,
              pageSize: 20,
              total,
              showSizeChanger: false,
              onChange: (next) => setPage(next),
              showTotal: (t) => `${t} lead(s)`,
            }}
            locale={{ emptyText: "Nenhum lead ainda. Importe uma planilha para começar." }}
          />
        </Space>
      </Card>

      <Modal
        title={detail?.display_name ?? "Lead"}
        open={Boolean(selectedId)}
        onCancel={() => setSelectedId(null)}
        width={760}
        destroyOnHidden
        footer={[
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              if (!detail) return;
              handleDeleteLead(detail);
            }}
          >
            Excluir
          </Button>,
          <Button key="close" onClick={() => setSelectedId(null)}>
            Fechar
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => void handleSaveDetail()}>
            Salvar
          </Button>,
        ]}
      >
        {detailLoading && !detail ? (
          <Typography.Text type="secondary">Carregando...</Typography.Text>
        ) : detail ? (
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Space wrap>
              <Tag>{detail.origem}</Tag>
              <Tag color={detail.freshness === "novo" ? "green" : "default"}>
                {detail.freshness === "novo" ? "Novo" : "Antigo"}
              </Tag>
              {detail.filename ? (
                <Typography.Text type="secondary">{detail.filename}</Typography.Text>
              ) : null}
            </Space>

            <Card size="small" title="Contato">
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                <div>
                  <Typography.Text type="secondary">Status de contato</Typography.Text>
                  <Select
                    style={{ width: "100%", marginTop: 4 }}
                    value={statusDraft}
                    options={CONTACT_STATUS_OPTIONS}
                    onChange={setStatusDraft}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Descrição / retorno</Typography.Text>
                  <Input.TextArea
                    style={{ marginTop: 4 }}
                    rows={4}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Anote o retorno do contato, observações, próximos passos..."
                  />
                </div>
              </Space>
            </Card>

            <Card size="small" title="Dados da planilha">
              <Descriptions
                size="small"
                column={1}
                bordered
                items={detailPayloadItems}
              />
            </Card>
          </Space>
        ) : (
          <Typography.Text type="secondary">Lead nao encontrado.</Typography.Text>
        )}
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
              Amostra das primeiras linhas. Ao confirmar, todos os campos da planilha ficam
              disponíveis no detalhe de cada lead.
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
