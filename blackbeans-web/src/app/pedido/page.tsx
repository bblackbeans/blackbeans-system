"use client";

import { AudioOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Space, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useRef, useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,.mp3,.m4a,.webm,.ogg,.wav";

export default function PedidoPublicoPage() {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      messageApi.error("Gravacao de audio nao suportada neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ext = (recorder.mimeType || "").includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, {
          type: blob.type || `audio/${ext}`,
        });
        if (file.size > MAX_FILE_BYTES) {
          messageApi.error("Audio gravado excede 10 MB.");
          return;
        }
        const uid = `rec-${Date.now()}`;
        setFileList((prev) => [
          ...prev,
          {
            uid,
            name: file.name,
            status: "done",
            size: file.size,
            type: file.type,
            originFileObj: file as UploadFile["originFileObj"],
          },
        ]);
        messageApi.success("Audio gravado e anexado.");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      messageApi.error("Nao foi possivel acessar o microfone.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") recorder.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {contextHolder}
      <Card title="Enviar pedido" style={{ width: "100%", maxWidth: 560 }}>
        <Typography.Paragraph type="secondary">
          Preencha o formulario abaixo. Nossa equipe recebera seu pedido e entrara em contato. Voce pode anexar
          imagens, arquivos (PDF etc.) e audio (upload ou gravacao).
        </Typography.Paragraph>
        <Form
          layout="vertical"
          form={form}
          onFinish={async (values) => {
            setSubmitting(true);
            try {
              const body = new FormData();
              body.append("title", String(values.title ?? "").trim());
              body.append("description", String(values.description ?? "").trim());
              body.append("contact_name", String(values.contact_name ?? "").trim());
              body.append("contact_email", String(values.contact_email ?? "").trim());
              body.append("contact_phone", String(values.contact_phone ?? "").trim());
              body.append("client_name", String(values.client_name ?? "").trim());
              for (const item of fileList) {
                const file = item.originFileObj;
                if (file) body.append("files", file as File);
              }
              const response = await fetch("/api/v1/client-requests/public", {
                method: "POST",
                body,
              });
              const payload = (await response.json().catch(() => ({}))) as {
                error?: { message?: string };
              };
              if (!response.ok) {
                messageApi.error(payload.error?.message ?? "Falha ao enviar pedido.");
                return;
              }
              messageApi.success("Pedido enviado com sucesso.");
              form.resetFields();
              setFileList([]);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Form.Item name="title" label="Titulo" rules={[{ required: true, message: "Informe o titulo." }]}>
            <Input placeholder="Resumo do pedido" />
          </Form.Item>
          <Form.Item name="description" label="Descricao">
            <Input.TextArea rows={4} placeholder="Detalhes do que voce precisa" />
          </Form.Item>
          <Form.Item
            name="client_name"
            label="Empresa / Cliente"
            rules={[{ required: true, message: "Informe a empresa ou cliente." }]}
          >
            <Input placeholder="Nome da empresa" />
          </Form.Item>
          <Form.Item
            name="contact_name"
            label="Seu nome"
            rules={[{ required: true, message: "Informe seu nome." }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="contact_email"
            label="E-mail de contato"
            rules={[
              { required: true, message: "Informe o e-mail." },
              { type: "email", message: "E-mail invalido." },
            ]}
          >
            <Input type="email" />
          </Form.Item>
          <Form.Item name="contact_phone" label="Telefone">
            <Input placeholder="(11) 99999-9999" />
          </Form.Item>
          <Form.Item label="Anexos">
            <Space orientation="vertical" style={{ width: "100%" }} size={8}>
              <Upload
                multiple
                accept={ACCEPT}
                fileList={fileList}
                beforeUpload={(file) => {
                  if (file.size > MAX_FILE_BYTES) {
                    messageApi.error(`${file.name} excede 10 MB.`);
                    return Upload.LIST_IGNORE;
                  }
                  if (fileList.length >= 10) {
                    messageApi.error("No maximo 10 anexos.");
                    return Upload.LIST_IGNORE;
                  }
                  return false;
                }}
                onChange={({ fileList: next }) => setFileList(next.slice(0, 10))}
                onRemove={(file) => {
                  setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
                }}
              >
                <Button icon={<UploadOutlined />}>Imagem ou arquivo</Button>
              </Upload>
              <Space>
                {!recording ? (
                  <Button icon={<AudioOutlined />} onClick={() => void startRecording()}>
                    Gravar audio
                  </Button>
                ) : (
                  <Button danger icon={<DeleteOutlined />} onClick={stopRecording}>
                    Parar gravacao
                  </Button>
                )}
                <Typography.Text type="secondary">Ate 10 MB por arquivo · max. 10 anexos</Typography.Text>
              </Space>
            </Space>
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Enviar pedido
          </Button>
        </Form>
      </Card>
    </div>
  );
}
