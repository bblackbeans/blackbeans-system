"use client";

import { AudioOutlined, StopOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Space, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useEffect, useRef, useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1500;
const ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,.mp3,.m4a,.webm,.ogg,.wav";

function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** WebM do MediaRecorder nao tem duration/cues — scrub do <audio> fica quebrado.
 * Decodifica e remonta como WAV so para o preview local. */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const samples = buffer.length;
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c += 1) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

async function makeSeekablePreviewUrl(blob: Blob): Promise<string> {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return URL.createObjectURL(blob);
  const ctx = new Ctx();
  try {
    const copy = blob.slice(0, blob.size, blob.type || "audio/webm");
    const decoded = await ctx.decodeAudioData(await copy.arrayBuffer());
    const wav = audioBufferToWavBlob(decoded);
    return URL.createObjectURL(wav);
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

export default function PedidoPublicoPage() {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [levelPct, setLevelPct] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Garante que gravacoes entram no FormData mesmo se o Upload perder originFileObj. */
  const recordedFilesRef = useRef<Map<string, File>>(new Map());
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  function clearPreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function stopMeter() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevelPct(0);
    analyserRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }

  function startMeter(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i] ?? 0;
        const avg = sum / Math.max(data.length, 1);
        setLevelPct(Math.min(100, Math.round((avg / 80) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      void ctx.resume();
    } catch {
      // medidor e opcional
    }
  }

  useEffect(() => {
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current);
      stopMeter();
      clearPreview();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
  }, []);

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      messageApi.error("Gravacao de audio nao suportada neste navegador.");
      return;
    }
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const liveTracks = stream.getAudioTracks().filter((t) => t.enabled && t.readyState === "live");
      if (liveTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        messageApi.error("Microfone indisponivel. Verifique se nao esta mudo no sistema.");
        return;
      }
      streamRef.current = stream;
      const mime = pickAudioMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        messageApi.error("Erro durante a gravacao de audio.");
        void finishRecording(true);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        stopMeter();
        const blobType = (recorder.mimeType || mime || "audio/webm").split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        stopResolveRef.current?.(blob);
        stopResolveRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      // timeslice garante chunks periodicos (Chrome/Firefox)
      recorder.start(200);
      startedAtRef.current = Date.now();
      setRecordingMs(0);
      if (tickRef.current != null) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => {
        setRecordingMs(Date.now() - startedAtRef.current);
      }, 200);
      startMeter(stream);
      setRecording(true);
      messageApi.info("Gravando… fale algo e clique em Parar quando terminar.");
    } catch {
      messageApi.error("Nao foi possivel acessar o microfone. Verifique a permissao do navegador.");
    }
  }

  async function finishRecording(silent = false) {
    const recorder = mediaRecorderRef.current;
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
    const elapsed = Date.now() - startedAtRef.current;
    setRecordingMs(0);
    if (!recorder) {
      stopMeter();
      return;
    }

    const blobPromise = new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      // timeout caso onstop nao dispare
      window.setTimeout(() => {
        if (stopResolveRef.current === resolve) {
          stopResolveRef.current = null;
          const blobType = (recorder.mimeType || "audio/webm").split(";")[0] || "audio/webm";
          resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: blobType }) : null);
        }
      }, 2500);
    });

    try {
      if (recorder.state === "recording") {
        try {
          recorder.requestData();
        } catch {
          // requestData nem sempre existe
        }
      }
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      if (!silent) messageApi.error("Falha ao finalizar gravacao.");
      mediaRecorderRef.current = null;
      stopMeter();
      return;
    }
    mediaRecorderRef.current = null;

    const blob = await blobPromise;
    if (!blob || blob.size < MIN_AUDIO_BYTES) {
      if (!silent) {
        messageApi.error(
          "Gravacao vazia ou muito curta. Fale perto do microfone, confira o nivel (barra) e tente de novo.",
        );
      }
      return;
    }
    if (elapsed < 800) {
      if (!silent) messageApi.warning("Grave pelo menos 1 segundo.");
      return;
    }

    const blobType = (blob.type || "audio/webm").split(";")[0] || "audio/webm";
    const ext = blobType.includes("ogg") ? "ogg" : blobType.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `gravacao-${Date.now()}.${ext}`, {
      type: blobType.startsWith("audio/") ? blobType : `audio/${ext}`,
    });
    if (file.size > MAX_FILE_BYTES) {
      messageApi.error("Audio gravado excede 10 MB.");
      return;
    }

    const uid = `rec-${Date.now()}`;
    recordedFilesRef.current.set(uid, file);
    clearPreview();
    try {
      const seekableUrl = await makeSeekablePreviewUrl(blob);
      setPreviewUrl(seekableUrl);
    } catch {
      // fallback: blob original (scrub pode falhar em webm)
      setPreviewUrl(URL.createObjectURL(file));
    }
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
    messageApi.success(`Audio gravado (${Math.max(1, Math.round(file.size / 1024))} KB). Ouça o preview abaixo.`);
  }

  function stopRecording(silent = false) {
    void finishRecording(silent);
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
            if (recording) {
              messageApi.warning("Pare a gravacao antes de enviar.");
              return;
            }
            setSubmitting(true);
            try {
              const body = new FormData();
              body.append("title", String(values.title ?? "").trim());
              body.append("description", String(values.description ?? "").trim());
              body.append("contact_name", String(values.contact_name ?? "").trim());
              body.append("contact_email", String(values.contact_email ?? "").trim());
              body.append("contact_phone", String(values.contact_phone ?? "").trim());
              body.append("client_name", String(values.client_name ?? "").trim());
              const seen = new Set<string>();
              for (const item of fileList) {
                const fromRef = recordedFilesRef.current.get(item.uid);
                const file = fromRef ?? (item.originFileObj as File | undefined);
                if (!file) continue;
                const key = `${file.name}:${file.size}:${file.lastModified}`;
                if (seen.has(key)) continue;
                seen.add(key);
                body.append("files", file);
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
              recordedFilesRef.current.clear();
              clearPreview();
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
                  recordedFilesRef.current.delete(file.uid);
                  if (previewUrl && file.name.startsWith("gravacao-")) clearPreview();
                  setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
                }}
              >
                <Button icon={<UploadOutlined />}>Imagem ou arquivo</Button>
              </Upload>
              <Space wrap align="center">
                {!recording ? (
                  <Button icon={<AudioOutlined />} onClick={() => void startRecording()}>
                    Gravar audio
                  </Button>
                ) : (
                  <Button danger icon={<StopOutlined />} onClick={() => stopRecording()}>
                    Parar gravacao ({formatMmSs(recordingMs)})
                  </Button>
                )}
                <Typography.Text type="secondary">Ate 10 MB por arquivo · max. 10 anexos</Typography.Text>
              </Space>
              {recording ? (
                <div style={{ width: "100%" }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Nivel do microfone
                  </Typography.Text>
                  <div
                    style={{
                      marginTop: 4,
                      height: 8,
                      borderRadius: 4,
                      background: "rgba(0,0,0,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${levelPct}%`,
                        background: levelPct < 8 ? "#cf1322" : levelPct < 25 ? "#faad14" : "#52c41a",
                        transition: "width 80ms linear",
                      }}
                    />
                  </div>
                  {levelPct < 8 ? (
                    <Typography.Text type="danger" style={{ fontSize: 12 }}>
                      Sem sinal — fale mais perto ou escolha outro microfone.
                    </Typography.Text>
                  ) : null}
                </div>
              ) : null}
              {previewUrl ? (
                <div style={{ width: "100%" }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Preview da gravacao
                  </Typography.Text>
                  <audio
                    key={previewUrl}
                    controls
                    preload="auto"
                    src={previewUrl}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  />
                </div>
              ) : null}
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
