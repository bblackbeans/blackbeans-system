"use client";

import {
  BugOutlined,
  CameraOutlined,
  CloseOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  Space,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import { ImageLightbox } from "@/components/report-problem/ImageLightbox";
import { apiRequest } from "@/lib/api";
import {
  RECORDING_MAX_MS,
  beginGlobalPageRecording,
  captureScreenshot,
  clearReportDraft,
  collectTechnicalContext,
  endGlobalPageRecording,
  getPageRecordingElapsedMs,
  isPageRecordingActive,
  loadReportDraft,
  saveReportDraft,
  waitForUiSettled,
  type MediaPayload,
  type ReportProblemDraft,
  type TechnicalContext,
} from "@/lib/report-problem";

type ReportProblemWidgetProps = {
  token: string;
  workspaceId?: string | null;
  hidden?: boolean;
};

export function ReportProblemWidget({ token, workspaceId, hidden = false }: ReportProblemWidgetProps) {
  const [msg, msgHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [screenshot, setScreenshot] = useState<MediaPayload | null>(null);
  const [recording, setRecording] = useState<MediaPayload | null>(null);
  const [includeContext, setIncludeContext] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [form] = Form.useForm();

  const persistDraft = useCallback(
    (patch: Partial<ReportProblemDraft> = {}) => {
      if (!open && !patch.open) return;
      const values = form.getFieldsValue();
      saveReportDraft({
        open,
        title: values.title,
        description: values.description,
        steps: values.steps,
        includeContext,
        screenshot,
        recording,
        ...patch,
      });
    },
    [form, includeContext, open, recording, screenshot],
  );

  useEffect(() => {
    const draft = loadReportDraft();
    if (!draft) return;
    form.setFieldsValue({
      title: draft.title ?? "",
      description: draft.description ?? "",
      steps: draft.steps ?? "",
    });
    if (typeof draft.includeContext === "boolean") setIncludeContext(draft.includeContext);
    if (draft.screenshot) setScreenshot(draft.screenshot);
    if (draft.recording) setRecording(draft.recording);
    if (draft.open) setOpen(true);
  }, [form]);

  useEffect(() => {
    if (!recordingActive) return;
    const id = setInterval(() => {
      if (!isPageRecordingActive()) {
        setRecordingActive(false);
        setRecordingElapsedMs(0);
        return;
      }
      const elapsed = getPageRecordingElapsedMs();
      setRecordingElapsedMs(elapsed);
      if (elapsed >= RECORDING_MAX_MS) {
        void handleStopRecording();
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingActive]);

  const closeDrawer = useCallback(() => {
    if (recordingActive || isPageRecordingActive()) return;
    setOpen(false);
    saveReportDraft({
      open: false,
      title: form.getFieldValue("title"),
      description: form.getFieldValue("description"),
      steps: form.getFieldValue("steps"),
      includeContext,
      screenshot,
      recording,
    });
  }, [form, includeContext, recording, recordingActive, screenshot]);

  const handleCapture = async () => {
    setCapturing(true);
    try {
      saveReportDraft({
        open: false,
        title: form.getFieldValue("title"),
        description: form.getFieldValue("description"),
        steps: form.getFieldValue("steps"),
        includeContext,
        screenshot,
        recording,
      });
      setOpen(false);
      await waitForUiSettled();
      const shot = await captureScreenshot();
      setScreenshot(shot);
      setOpen(true);
      form.setFieldsValue({
        title: form.getFieldValue("title"),
        description: form.getFieldValue("description"),
        steps: form.getFieldValue("steps"),
      });
      saveReportDraft({
        open: true,
        title: form.getFieldValue("title"),
        description: form.getFieldValue("description"),
        steps: form.getFieldValue("steps"),
        includeContext,
        screenshot: shot,
        recording,
      });
      msg.success("Screenshot capturado.");
    } catch {
      msg.error("Falha ao capturar a pagina.");
      setOpen(true);
    } finally {
      setCapturing(false);
    }
  };

  const applyRecordingResult = useCallback(
    (result: MediaPayload | null) => {
      setRecordingActive(false);
      setRecordingElapsedMs(0);
      if (result) {
        setRecording(result);
        msg.success("Gravacao finalizada.");
      } else {
        msg.warning("Nenhum frame foi gravado.");
      }
      setOpen(true);
      saveReportDraft({
        open: true,
        title: form.getFieldValue("title"),
        description: form.getFieldValue("description"),
        steps: form.getFieldValue("steps"),
        includeContext,
        screenshot,
        recording: result,
      });
    },
    [form, includeContext, msg, screenshot],
  );

  const handleStartRecording = async () => {
    if (isPageRecordingActive()) return;
    saveReportDraft({
      open: false,
      title: form.getFieldValue("title"),
      description: form.getFieldValue("description"),
      steps: form.getFieldValue("steps"),
      includeContext,
      screenshot,
      recording,
    });
    try {
      await beginGlobalPageRecording(
        (elapsed) => setRecordingElapsedMs(elapsed),
        (result) => applyRecordingResult(result),
      );
      setRecordingActive(true);
      setOpen(false);
      msg.info("Gravando esta aba. Navegue livremente e clique em Parar gravacao.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        msg.warning("Gravacao cancelada. Permita compartilhar esta aba no navegador.");
        return;
      }
      msg.error("Nao foi possivel iniciar a gravacao.");
    }
  };

  const handleStopRecording = async () => {
    if (!isPageRecordingActive()) return;
    try {
      const result = await endGlobalPageRecording();
      applyRecordingResult(result);
    } catch {
      msg.error("Falha ao finalizar gravacao.");
      setOpen(true);
    }
  };

  const handleSubmit = async (values: { title: string; description: string; steps?: string }) => {
    setSubmitting(true);
    try {
      const contexto: TechnicalContext = includeContext
        ? collectTechnicalContext()
        : {
            url: window.location.href,
            hash_route: window.location.hash || undefined,
            user_agent: navigator.userAgent,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          };
      if (screenshot) contexto.screenshot = screenshot;
      if (recording) contexto.screen_recording = recording;

      const response = await apiRequest<{ id: string; correlation_id: string }>(
        "/problem-reports/feedback",
        {
          method: "POST",
          token,
          body: {
            titulo: values.title,
            descricao: values.description,
            passos: values.steps ?? "",
            workspace_id: workspaceId ?? null,
            contexto,
          },
        },
      );

      if (!response.ok) {
        msg.error(response.error?.message ?? "Falha ao enviar reporte.");
        return;
      }

      msg.success(`Problema enviado. ID: ${response.data?.correlation_id ?? response.data?.id ?? ""}`);
      form.resetFields();
      setScreenshot(null);
      setRecording(null);
      clearReportDraft();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const isRecording = recordingActive || isPageRecordingActive();

  return (
    <>
      {msgHolder}
      {!open && !hidden ? (
        <div data-report-problem-ui style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1100 }}>
          {isRecording ? (
            <Button
              danger
              type="primary"
              size="large"
              icon={<VideoCameraOutlined />}
              onClick={() => void handleStopRecording()}
            >
              Parar gravacao ({Math.round(recordingElapsedMs / 1000)}s)
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              icon={<BugOutlined />}
              onClick={() => setOpen(true)}
            >
              Relatar problema
            </Button>
          )}
        </div>
      ) : null}

      <Drawer
        title={
          <Space>
            <BugOutlined />
            <span>Relatar problema</span>
          </Space>
        }
        placement="right"
        size={480}
        open={open}
        onClose={closeDrawer}
        destroyOnClose={false}
        forceRender
        mask={{ closable: !isRecording }}
        keyboard={!isRecording}
        data-report-problem-ui
        styles={{
          body: { paddingBottom: 24 },
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          Reporte um bug, sugira uma melhoria ou peca um ajuste no sistema.
        </Typography.Paragraph>

        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="title"
            label="Titulo"
            rules={[{ required: true, message: "Informe um titulo." }]}
          >
            <Input maxLength={200} placeholder="Ex.: Botao salvar nao responde" />
          </Form.Item>
          <Form.Item
            name="description"
            label="Descricao"
            rules={[{ required: true, message: "Descreva o problema." }]}
          >
            <Input.TextArea rows={4} maxLength={8000} placeholder="O que aconteceu?" />
          </Form.Item>
          <Form.Item name="steps" label="Passos para reproduzir (opcional)">
            <Input.TextArea rows={3} maxLength={8000} placeholder="1) Abri o portal...\n2) Cliquei em..." />
          </Form.Item>

          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            Dica: screenshot captura a pagina atual. A gravacao usa a aba do navegador (o Chrome pode pedir
            permissao) e continua ao navegar no sistema ate clicar em Parar gravacao.
          </Typography.Paragraph>

          <Space wrap style={{ marginBottom: 16 }}>
            <Button icon={<CameraOutlined />} loading={capturing} onClick={() => void handleCapture()}>
              Capturar pagina
            </Button>
            <Button
              icon={<VideoCameraOutlined />}
              disabled={isRecording}
              onClick={() => void handleStartRecording()}
            >
              Gravar pagina
            </Button>
          </Space>

          {screenshot ? (
            <Card
              size="small"
              style={{ marginBottom: 16 }}
              title="Screenshot da pagina anexado"
              extra={
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<CloseOutlined />}
                  aria-label="Remover screenshot"
                  onClick={() => {
                    setScreenshot(null);
                    saveReportDraft({
                      open: true,
                      title: form.getFieldValue("title"),
                      description: form.getFieldValue("description"),
                      steps: form.getFieldValue("steps"),
                      includeContext,
                      screenshot: null,
                      recording,
                    });
                  }}
                />
              }
            >
              <img
                src={screenshot.data}
                alt="Preview do screenshot"
                style={{
                  width: "100%",
                  maxHeight: 220,
                  objectFit: "contain",
                  borderRadius: 8,
                  border: "1px solid #f0f0f0",
                  cursor: "pointer",
                  background: "#fafafa",
                }}
                onClick={() => setLightboxSrc(screenshot.data)}
              />
              <Button
                type="link"
                danger
                size="small"
                style={{ paddingLeft: 0, marginTop: 4 }}
                onClick={() => {
                  setScreenshot(null);
                  saveReportDraft({
                    open: true,
                    title: form.getFieldValue("title"),
                    description: form.getFieldValue("description"),
                    steps: form.getFieldValue("steps"),
                    includeContext,
                    screenshot: null,
                    recording,
                  });
                }}
              >
                Remover screenshot
              </Button>
            </Card>
          ) : null}

          {recording ? (
            <Card
              size="small"
              style={{ marginBottom: 16 }}
              title={`Gravacao de tela (${Math.round((recording.duration_ms ?? 0) / 1000)}s)`}
              extra={
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<CloseOutlined />}
                  aria-label="Remover gravacao"
                  onClick={() => {
                    setRecording(null);
                    saveReportDraft({
                      open: true,
                      title: form.getFieldValue("title"),
                      description: form.getFieldValue("description"),
                      steps: form.getFieldValue("steps"),
                      includeContext,
                      screenshot,
                      recording: null,
                    });
                  }}
                />
              }
            >
              <video
                controls
                src={recording.data}
                style={{
                  width: "100%",
                  maxHeight: 220,
                  borderRadius: 8,
                  background: "#000",
                  objectFit: "contain",
                }}
              />
              <Button
                type="link"
                danger
                size="small"
                style={{ paddingLeft: 0, marginTop: 4 }}
                onClick={() => {
                  setRecording(null);
                  saveReportDraft({
                    open: true,
                    title: form.getFieldValue("title"),
                    description: form.getFieldValue("description"),
                    steps: form.getFieldValue("steps"),
                    includeContext,
                    screenshot,
                    recording: null,
                  });
                }}
              >
                Remover gravacao
              </Button>
            </Card>
          ) : null}

          <Checkbox
            checked={includeContext}
            onChange={(event) => {
              setIncludeContext(event.target.checked);
            }}
          >
            Incluir contexto tecnico (erros JS, requisicoes falhas, navegador)
          </Checkbox>

          {isRecording ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              title="Gravacao em andamento"
              description="O painel foi fechado para nao aparecer na gravacao. Use o botao vermelho flutuante para parar."
            />
          ) : null}

          <Space style={{ marginTop: 20, width: "100%", justifyContent: "flex-end" }}>
            <Button onClick={closeDrawer}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Enviar
            </Button>
          </Space>
        </Form>
      </Drawer>

      {lightboxSrc ? <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} /> : null}
    </>
  );
}
