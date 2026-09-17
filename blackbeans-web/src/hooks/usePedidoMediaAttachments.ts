"use client";

import type { UploadFile } from "antd/es/upload/interface";
import { useEffect, useRef, useState } from "react";

import {
  PEDIDO_MAX_FILE_BYTES,
  PEDIDO_MIN_AUDIO_BYTES,
  formatMmSs,
  makeSeekablePreviewUrl,
  pickAudioMime,
} from "@/lib/pedido-media";

type MessageApi = {
  error: (content: string) => void;
  warning: (content: string) => void;
  info: (content: string) => void;
  success: (content: string) => void;
};

export function usePedidoMediaAttachments(messageApi: MessageApi) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
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
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    if (!blob || blob.size < PEDIDO_MIN_AUDIO_BYTES) {
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
    if (file.size > PEDIDO_MAX_FILE_BYTES) {
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

  function resetAttachments() {
    if (recording) stopRecording(true);
    recordedFilesRef.current.clear();
    clearPreview();
    setFileList([]);
  }

  return {
    fileList,
    setFileList,
    recording,
    recordingMs,
    levelPct,
    previewUrl,
    recordedFilesRef,
    startRecording,
    stopRecording,
    resetAttachments,
    formatMmSs,
    clearPreview,
  };
}
