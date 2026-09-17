import type { UploadFile } from "antd/es/upload/interface";

export const PEDIDO_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PEDIDO_MIN_AUDIO_BYTES = 1500;
export const PEDIDO_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,.mp3,.m4a,.webm,.ogg,.wav";

export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** WebM do MediaRecorder nao tem duration/cues — scrub do <audio> fica quebrado. */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
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

export async function makeSeekablePreviewUrl(blob: Blob): Promise<string> {
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

export function appendPedidoFilesToFormData(
  body: FormData,
  fileList: UploadFile[],
  recordedFiles: Map<string, File>,
) {
  const seen = new Set<string>();
  for (const item of fileList) {
    const fromRef = recordedFiles.get(item.uid);
    const file = fromRef ?? (item.originFileObj as File | undefined);
    if (!file) continue;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    body.append("files", file);
  }
}
