"use client";

import { LinkOutlined, SettingOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";

export type RdDealInfo = {
  remote_id?: string;
  url?: string;
  pipeline_name?: string;
  stage_name?: string;
  owner_name?: string;
  deal_status?: string;
};

export type RdCompanyFields = {
  rd_status?: string;
  rd_remote_id?: string;
  rd_url?: string;
  rd_last_synced_at?: string | null;
  rd_last_error?: string;
  rd_deal?: RdDealInfo | null;
};

export type RdSettings = {
  create_deals: boolean;
  pipeline_id: string;
  stage_id: string;
  owner_id: string;
  source_id: string;
  min_score_for_deal: number;
  only_contacts_with_email_or_phone: boolean;
  cnpj_custom_field_slug: string;
  legal_bases: Array<Record<string, string>>;
  webhook_registered: boolean;
};

export type RdStatusPayload = {
  connected: boolean;
  oauth_configured: boolean;
  connected_at?: string | null;
  settings?: RdSettings;
};

export type RdPreview = {
  found: number;
  eligible: number;
  already_synced: number;
  not_sent: number;
  error: number;
  syncing: number;
  pending_update: number;
  contacts: number;
  deals_would_create: number;
  create_deals: boolean;
  connected?: boolean;
};

export type RdJob = {
  id: string;
  status: string;
  total: number;
  done: number;
  success: number;
  error: number;
  skipped: number;
};

export type RdOption = { id: string; name: string; pipeline_id?: string };

export type RdCustomField = { slug: string; name: string };

export const RD_STATUS_OPTIONS = [
  { value: "all", label: "Todos no RD" },
  { value: "not_sent", label: "Não enviados" },
  { value: "syncing", label: "Enviando" },
  { value: "synced", label: "No CRM" },
  { value: "pending_update", label: "Atualizar" },
  { value: "error", label: "Com erro" },
];

export function rdStatusTag(status: string | null | undefined) {
  if (status === "synced") return <Tag color="green">No CRM</Tag>;
  if (status === "syncing") return <Tag color="processing">Enviando</Tag>;
  if (status === "pending_update") return <Tag color="gold">Atualizar</Tag>;
  if (status === "error") return <Tag color="red">Erro RD</Tag>;
  return <Tag>Não enviado</Tag>;
}

type ConfigModalProps = {
  open: boolean;
  saving: boolean;
  connecting: boolean;
  status: RdStatusPayload | null;
  settings: RdSettings | null;
  pipelines: RdOption[];
  stages: RdOption[];
  owners: RdOption[];
  sources: RdOption[];
  customFields: RdCustomField[];
  optionsError?: string | null;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSave: (values: Partial<RdSettings>) => void;
};

export function RdConfigModal({
  open,
  saving,
  connecting,
  status,
  settings,
  pipelines,
  stages,
  owners,
  sources,
  customFields,
  optionsError,
  onClose,
  onConnect,
  onDisconnect,
  onSave,
}: ConfigModalProps) {
  const [form] = Form.useForm();
  const createDeals = Form.useWatch("create_deals", form);
  const pipelineId = Form.useWatch("pipeline_id", form);

  const stageOptions = stages.filter((stage) => !pipelineId || stage.pipeline_id === pipelineId);

  return (
    <Modal
      title="RD Station CRM"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={640}
      afterOpenChange={(visible) => {
        if (visible && settings) form.setFieldsValue(settings);
      }}
      footer={
        <Space>
          <Button onClick={onClose}>Fechar</Button>
          <Button type="primary" loading={saving} onClick={() => void form.submit()}>
            Salvar
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          showIcon
          type={status?.connected ? "success" : status?.oauth_configured ? "info" : "warning"}
          title={status?.connected ? "Conta conectada" : "Conta não conectada"}
          description={
            status?.oauth_configured
              ? "O envio usa OAuth no servidor. Tokens não aparecem nesta tela. Se funil e responsáveis estiverem vazios, clique em Reconectar."
              : "Configure RDSTATION_CRM_CLIENT_ID e CLIENT_SECRET no ambiente da API."
          }
        />
        {optionsError ? (
          <Alert showIcon type="warning" title="Não deu para carregar funis e responsáveis" description={optionsError} />
        ) : null}
        <Space>
          <Button
            type="primary"
            icon={<LinkOutlined />}
            loading={connecting}
            disabled={!status?.oauth_configured}
            onClick={onConnect}
          >
            {status?.connected ? "Reconectar" : "Conectar"}
          </Button>
          <Button danger disabled={!status?.connected} onClick={onDisconnect}>
            Desconectar
          </Button>
        </Space>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => onSave(values as Partial<RdSettings>)}
        >
          <Form.Item
            name="create_deals"
            label="Criar negociação automaticamente"
            valuePropName="checked"
            extra="Se ligado, cada empresa enviada ganha um deal no funil escolhido, só se ainda não houver deal mapeado. O Banco de Leads continua sendo a prospecção; o funil vive no RD."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="owner_id"
            label="Responsável no RD"
            extra="O RD exige um dono na empresa. Sem isso o envio falha com 422, mesmo sem criar negociação."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={owners.map((item) => ({ value: item.id, label: item.name }))}
              placeholder={owners.length ? "Dono da empresa no CRM" : "Nenhum responsável carregado"}
            />
          </Form.Item>
          {createDeals ? (
            <>
              <Form.Item name="pipeline_id" label="Funil (pipeline)">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={pipelines.map((item) => ({ value: item.id, label: item.name }))}
                  placeholder={pipelines.length ? "Selecione o funil" : "Nenhum funil carregado"}
                  notFoundContent="Lista vazia. Reconecte a conta RD."
                />
              </Form.Item>
              <Form.Item name="stage_id" label="Etapa inicial">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={stageOptions.map((item) => ({ value: item.id, label: item.name }))}
                  placeholder={stageOptions.length ? "Etapa do funil" : "Escolha o funil primeiro"}
                />
              </Form.Item>
              <Form.Item name="source_id" label="Fonte">
                <Select
                  allowClear
                  options={sources.map((item) => ({ value: item.id, label: item.name }))}
                  placeholder="Fonte (opcional)"
                />
              </Form.Item>
              <Form.Item
                name="min_score_for_deal"
                label="Score mínimo para criar deal"
                extra="0 = todas as empresas enviadas."
              >
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </>
          ) : null}
          <Form.Item
            name="only_contacts_with_email_or_phone"
            label="Enviar só contato com e-mail ou telefone útil"
            valuePropName="checked"
            extra="Ao criar contato no RD, o sistema envia base legal LGPD (interesse legítimo / comunicações). Ajuste fino fica no backend."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="cnpj_custom_field_slug"
            label="Campo de CNPJ no RD"
            extra="O RD não tem CNPJ nativo. Crie um campo personalizado em Configurações → Configurar campos → Empresas. O slug é o identificador técnico (quase sempre `cnpj`). Se a lista abaixo aparecer, escolha o campo CNPJ."
          >
            {customFields.length > 0 ? (
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                options={customFields.map((field) => ({
                  value: field.slug,
                  label: `${field.name} (${field.slug})`,
                }))}
                placeholder="Campo CNPJ da empresa"
              />
            ) : (
              <Input placeholder="cnpj" />
            )}
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
}

type PreviewModalProps = {
  open: boolean;
  loading: boolean;
  sending: boolean;
  preview: RdPreview | null;
  selectAll: boolean;
  selectedCount: number;
  onClose: () => void;
  onConfirm: () => void;
};

export function RdPreviewModal({
  open,
  loading,
  sending,
  preview,
  selectAll,
  selectedCount,
  onClose,
  onConfirm,
}: PreviewModalProps) {
  const target = selectAll ? preview?.found ?? 0 : selectedCount;
  return (
    <Modal
      title="Enviar para o RD Station CRM"
      open={open}
      onCancel={onClose}
      okText="Enviar"
      cancelText="Cancelar"
      confirmLoading={sending}
      okButtonProps={{ disabled: !preview || (preview.eligible < 1 && target < 1) }}
      onOk={onConfirm}
    >
      {loading || !preview ? (
        <Typography.Text type="secondary">Calculando o lote…</Typography.Text>
      ) : (
        <Space orientation="vertical" size={8}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {selectAll
              ? `Todos os filtrados: ${preview.found} empresa(s) nas páginas da lista atual.`
              : `${selectedCount} empresa(s) marcada(s) nesta página.`}
          </Typography.Paragraph>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            Elegíveis agora (não enviadas ou com erro): <strong>{preview.eligible}</strong>. Já no
            CRM: {preview.already_synced}. Contatos que vão junto: {preview.contacts}.
          </Typography.Paragraph>
          {preview.create_deals ? (
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              Negociações novas (configuração atual): {preview.deals_would_create}.
            </Typography.Paragraph>
          ) : (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Criação de deal está desligada. Só empresa e contatos serão enviados.
            </Typography.Paragraph>
          )}
          {!preview.connected ? (
            <Alert type="warning" showIcon title="Conecte o RD Station na configuração antes de enviar." />
          ) : null}
        </Space>
      )}
    </Modal>
  );
}

type HistoryDrawerProps = {
  open: boolean;
  loading: boolean;
  logs: Array<{
    id: string;
    action: string;
    success: boolean;
    message: string;
    created_at?: string | null;
  }>;
  onClose: () => void;
};

export function RdHistoryDrawer({ open, loading, logs, onClose }: HistoryDrawerProps) {
  return (
    <Drawer title="Histórico RD Station" open={open} onClose={onClose} size={480}>
      {loading ? (
        <Typography.Text type="secondary">Carregando…</Typography.Text>
      ) : logs.length === 0 ? (
        <Typography.Text type="secondary">Nenhum evento ainda.</Typography.Text>
      ) : (
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          {logs.map((log) => (
            <div key={log.id}>
              <Space>
                <Tag color={log.success ? "green" : "red"}>{log.action}</Tag>
                <Typography.Text type="secondary">{log.created_at || ""}</Typography.Text>
              </Space>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{log.message || "—"}</Typography.Paragraph>
            </div>
          ))}
        </Space>
      )}
    </Drawer>
  );
}

export function RdToolbarButton(props: { onClick: () => void }) {
  return (
    <Button icon={<SettingOutlined />} onClick={props.onClick}>
      RD Station
    </Button>
  );
}
