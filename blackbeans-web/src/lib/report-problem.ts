"use client";

import html2canvas from "html2canvas";

export const DRAFT_STORAGE_KEY = "bb-report-problem-draft";

export const SCREENSHOT_MAX_DATA_URL_LENGTH = 115_000;
export const RECORDING_FPS = 30;
export const RECORDING_FALLBACK_MAX_FPS = 5;
export const RECORDING_SCALE_CAP = 1;
export const RECORDING_BITRATE = 8_000_000;
export const RECORDING_MAX_MS = 60_000;

const MAX_JS_ERRORS = 20;
const MAX_FAILED_REQUESTS = 30;
const AUTO_ERROR_DEDUPE_MS = 6 * 60 * 60 * 1000; // 6h
const AUTO_ERROR_DEDUPE_STORAGE_KEY = "bb_auto_error_fingerprints_v1";
const AUTH_TOKEN_STORAGE_KEY = "bb_access_token";
const AUTH_REFRESH_IN_FLIGHT_HINT = /\/auth\/(refresh|token|login)/i;

export type MediaPayload = {
  mime: string;
  data: string;
  duration_ms?: number;
};

export type JsErrorEntry = {
  message: string;
  source?: string;
  line?: number;
  col?: number;
  ts: string;
};

export type FailedRequestEntry = {
  url: string;
  method: string;
  status: number;
  ts: string;
  body_preview?: string;
};

export type TechnicalContext = {
  url: string;
  hash_route?: string;
  user_agent: string;
  viewport: { width: number; height: number };
  js_errors?: JsErrorEntry[];
  failed_requests?: FailedRequestEntry[];
  screenshot?: MediaPayload;
  screen_recording?: MediaPayload;
  auto_error?: boolean;
  fingerprint?: string;
};

export type ReportProblemDraft = {
  open?: boolean;
  title?: string;
  description?: string;
  steps?: string;
  includeContext?: boolean;
  screenshot?: MediaPayload | null;
  recording?: MediaPayload | null;
};

type PageRecordingSession = {
  stop: () => Promise<MediaPayload | null>;
  getElapsedMs: () => number;
};

type DisplayMediaConstraints = MediaStreamConstraints & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canUseDisplayMediaRecording(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

function requestVideoFrame(stream: MediaStream): void {
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  track.requestFrame?.();
}

let collectorsInstalled = false;
let jsErrors: JsErrorEntry[] = [];
let failedRequests: FailedRequestEntry[] = [];
let originalFetch: typeof fetch | null = null;
let activeRecordingSession: PageRecordingSession | null = null;
let recordingEndedHandler: ((result: MediaPayload | null) => void) | null = null;
let autoErrorFingerprints = new Map<string, number>();

function loadAutoErrorFingerprints(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(AUTO_ERROR_DEDUPE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    autoErrorFingerprints = new Map(
      Object.entries(parsed).filter(([, ts]) => typeof ts === "number" && now - ts < AUTO_ERROR_DEDUPE_MS),
    );
  } catch {
    autoErrorFingerprints = new Map();
  }
}

function persistAutoErrorFingerprints(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, number> = {};
    autoErrorFingerprints.forEach((ts, key) => {
      obj[key] = ts;
    });
    localStorage.setItem(AUTO_ERROR_DEDUPE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore quota
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function pushFifo<T>(list: T[], item: T, max: number): T[] {
  const next = [...list, item];
  if (next.length > max) {
    return next.slice(next.length - max);
  }
  return next;
}

function normalizeUrlFamily(url: string): string {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://local");
    // path sem query/hash/ids longos
    const path = u.pathname
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
      .replace(/\/\d{2,}/g, "/:id");
    return `${u.origin}${path}`;
  } catch {
    return url.split("?")[0]?.split("#")[0] ?? url;
  }
}

function stableHttpFingerprint(method: string, url: string, status: number): string {
  return `http|${status}|${method}|${normalizeUrlFamily(url)}`;
}

function stableNetFingerprint(method: string, url: string): string {
  return `net|${method}|${normalizeUrlFamily(url)}`;
}

function isNoiseJsMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("resizeobserver loop") ||
    m.includes("resizeobserver loop limit exceeded") ||
    m.includes("script error.") ||
    m.includes("script error")
  );
}

function isAuthRefreshNoise(url: string, status: number): boolean {
  if (status !== 401) return false;
  // 401 em qualquer chamada autenticada durante refresh de sessao e ruido comum
  return true;
}

function shouldSkipAutoError(fingerprint: string): boolean {
  const now = Date.now();
  for (const [key, ts] of autoErrorFingerprints) {
    if (now - ts > AUTO_ERROR_DEDUPE_MS) autoErrorFingerprints.delete(key);
  }
  const prev = autoErrorFingerprints.get(fingerprint);
  if (prev != null && now - prev < AUTO_ERROR_DEDUPE_MS) return true;
  autoErrorFingerprints.set(fingerprint, now);
  persistAutoErrorFingerprints();
  return false;
}

function isProblemReportEndpoint(url: string): boolean {
  return /\/problem-reports(\/|$|\?)/i.test(url);
}

async function autoCreateProblemReport(params: {
  title: string;
  description: string;
  fingerprint: string;
  failedRequest?: FailedRequestEntry;
  jsError?: JsErrorEntry;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (shouldSkipAutoError(params.fingerprint)) return;
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) return;
  const fetchImpl = originalFetch ?? window.fetch.bind(window);
  const context: TechnicalContext = {
    ...collectTechnicalContext(),
    auto_error: true,
    fingerprint: params.fingerprint,
  };
  if (params.failedRequest) {
    context.failed_requests = [params.failedRequest];
  }
  if (params.jsError) {
    context.js_errors = [params.jsError];
  }
  try {
    await fetchImpl("/api/v1/problem-reports/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        titulo: params.title.slice(0, 200),
        descricao: params.description.slice(0, 8000),
        passos: "",
        contexto: context,
      }),
      cache: "no-store",
    });
  } catch {
    // Nao propagar: coleta automatica e best-effort.
  }
}

function onWindowError(event: ErrorEvent) {
  const entry: JsErrorEntry = {
    message: event.message || "Unknown error",
    source: event.filename,
    line: event.lineno,
    col: event.colno,
    ts: nowIso(),
  };
  jsErrors = pushFifo(jsErrors, entry, MAX_JS_ERRORS);
  if (isNoiseJsMessage(entry.message)) return;
  void autoCreateProblemReport({
    title: `Erro JS: ${(entry.message || "desconhecido").slice(0, 120)}`,
    description: [
      entry.message,
      entry.source ? `Arquivo: ${entry.source}` : null,
      entry.line != null ? `Linha: ${entry.line}` : null,
      entry.col != null ? `Coluna: ${entry.col}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    fingerprint: `js|${(entry.message || "").slice(0, 160)}`,
    jsError: entry,
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  const reason = event.reason;
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : JSON.stringify(reason);
  const entry: JsErrorEntry = {
    message: `Unhandled rejection: ${message}`,
    ts: nowIso(),
  };
  jsErrors = pushFifo(jsErrors, entry, MAX_JS_ERRORS);
  if (isNoiseJsMessage(message)) return;
  void autoCreateProblemReport({
    title: `Promise rejeitada: ${message.slice(0, 100)}`,
    description: entry.message,
    fingerprint: `rejection|${message.slice(0, 160)}`,
    jsError: entry,
  });
}

async function wrappedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const fetchImpl = originalFetch ?? fetch;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  try {
    const response = await fetchImpl(input, init);
    if (response.status >= 400 && !isProblemReportEndpoint(url)) {
      let bodyPreview = "";
      try {
        const clone = response.clone();
        const text = await clone.text();
        bodyPreview = text.slice(0, 300);
      } catch {
        bodyPreview = "";
      }
      const entry: FailedRequestEntry = {
        url,
        method,
        status: response.status,
        ts: nowIso(),
        body_preview: bodyPreview,
      };
      failedRequests = pushFifo(failedRequests, entry, MAX_FAILED_REQUESTS);
      // Ignorar 401 (sessao/refresh) e endpoints de auth.
      if (isAuthRefreshNoise(url, response.status) || AUTH_REFRESH_IN_FLIGHT_HINT.test(url)) {
        return response;
      }
      void autoCreateProblemReport({
        title: `Falha ${response.status} ${method}`,
        description: `${method} ${url}\nStatus: ${response.status}\n${bodyPreview}`.slice(0, 8000),
        fingerprint: stableHttpFingerprint(method, url, response.status),
        failedRequest: entry,
      });
    }
    return response;
  } catch (error) {
    if (!isProblemReportEndpoint(url)) {
      const entry: FailedRequestEntry = {
        url,
        method,
        status: 0,
        body_preview: error instanceof Error ? error.message : String(error),
        ts: nowIso(),
      };
      failedRequests = pushFifo(failedRequests, entry, MAX_FAILED_REQUESTS);
      void autoCreateProblemReport({
        title: `Rede: ${method} falhou`,
        description: `${method} ${url}\n${entry.body_preview ?? ""}`.slice(0, 8000),
        fingerprint: stableNetFingerprint(method, url),
        failedRequest: entry,
      });
    }
    throw error;
  }
}

export function installReportProblemCollectors(): void {
  if (collectorsInstalled || typeof window === "undefined") return;
  collectorsInstalled = true;
  loadAutoErrorFingerprints();
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  if (!originalFetch) {
    originalFetch = window.fetch.bind(window);
    window.fetch = wrappedFetch as typeof fetch;
  }
}

export function collectTechnicalContext(): TechnicalContext {
  return {
    url: window.location.href,
    hash_route: window.location.hash || undefined,
    user_agent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    js_errors: jsErrors.length ? [...jsErrors] : undefined,
    failed_requests: failedRequests.length ? [...failedRequests] : undefined,
  };
}

function shouldIgnoreElement(el: Element): boolean {
  // Soh a UI do proprio reporte fica de fora; modais/drawers do sistema entram na captura.
  return Boolean(el.closest("[data-report-problem-ui]"));
}

function captureScreenshotTarget(): HTMLElement {
  return document.documentElement;
}

function viewportSize(): { width: number; height: number } {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
}

export async function capturePageCanvas(forRecording = false): Promise<HTMLCanvasElement> {
  const scale = forRecording
    ? Math.min(window.devicePixelRatio || 1, RECORDING_SCALE_CAP)
    : Math.min(window.devicePixelRatio || 1, 1.1);

  if (forRecording) {
    const { width, height } = viewportSize();
    return html2canvas(document.documentElement, {
      ignoreElements: shouldIgnoreElement,
      useCORS: true,
      logging: false,
      scale,
      backgroundColor: "#ffffff",
      width,
      height,
      x: window.scrollX,
      y: window.scrollY,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      windowWidth: width,
      windowHeight: height,
    });
  }

  const target = captureScreenshotTarget();
  return html2canvas(target, {
    ignoreElements: shouldIgnoreElement,
    useCORS: true,
    logging: false,
    scale,
    backgroundColor: "#ffffff",
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
  });
}

function paintFrameOnCanvas(
  paintCtx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number,
): void {
  paintCtx.fillStyle = "#ffffff";
  paintCtx.fillRect(0, 0, canvasWidth, canvasHeight);
  paintCtx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, canvasWidth, canvasHeight);
}

async function startDisplayMediaRecording(onTick?: (elapsedMs: number) => void): Promise<PageRecordingSession> {
  const startedAt = Date.now();
  let stopped = false;

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: RECORDING_FPS, max: RECORDING_FPS },
      width: { ideal: window.screen.width },
      height: { ideal: window.screen.height },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    systemAudio: "exclude",
  } as DisplayMediaConstraints);

  const [videoTrack] = stream.getVideoTracks();
  if (!videoTrack) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Nenhuma trilha de video disponivel para gravacao.");
  }

  const { recorder, mime } = createMediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(250);

  const tickId = window.setInterval(() => {
    if (!stopped) onTick?.(Date.now() - startedAt);
  }, 200);

  let stopImpl: () => Promise<MediaPayload | null>;

  const stopOnBrowserShareEnd = () => {
    if (!stopped) {
      void stopImpl().then((result) => {
        if (activeRecordingSession) activeRecordingSession = null;
        const handler = recordingEndedHandler;
        recordingEndedHandler = null;
        handler?.(result);
      });
    }
  };
  videoTrack.addEventListener("ended", stopOnBrowserShareEnd);

  stopImpl = async (): Promise<MediaPayload | null> => {
    if (stopped) return null;
    stopped = true;
    window.clearInterval(tickId);
    videoTrack.removeEventListener("ended", stopOnBrowserShareEnd);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      if (recorder.state !== "inactive") recorder.stop();
      else resolve();
    });

    stream.getTracks().forEach((track) => track.stop());

    if (!chunks.length) return null;
    const blob = new Blob(chunks, { type: mime });
    const data = await blobToDataUrl(blob);
    return {
      mime,
      data,
      duration_ms: Date.now() - startedAt,
    };
  };

  return {
    getElapsedMs: () => Date.now() - startedAt,
    stop: stopImpl,
  };
}

function compressCanvasToJpeg(source: HTMLCanvasElement): MediaPayload {
  const qualities = [0.72, 0.58, 0.45, 0.34, 0.26, 0.18];
  const maxWidths = [source.width, 1600, 1280, 1024, 800, 640, 480];

  for (const maxWidth of maxWidths) {
    const scale = source.width > maxWidth ? maxWidth / source.width : 1;
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    for (const quality of qualities) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= SCREENSHOT_MAX_DATA_URL_LENGTH) {
        return { mime: "image/jpeg", data };
      }
    }
  }

  const tiny = document.createElement("canvas");
  tiny.width = 480;
  tiny.height = Math.max(1, Math.round((source.height / source.width) * 480));
  const tinyCtx = tiny.getContext("2d");
  if (tinyCtx) {
    tinyCtx.fillStyle = "#ffffff";
    tinyCtx.fillRect(0, 0, tiny.width, tiny.height);
    tinyCtx.drawImage(source, 0, 0, tiny.width, tiny.height);
    const data = tiny.toDataURL("image/jpeg", 0.15);
    return { mime: "image/jpeg", data };
  }

  return { mime: "image/jpeg", data: source.toDataURL("image/jpeg", 0.12) };
}

export async function captureScreenshot(): Promise<MediaPayload> {
  const canvas = await capturePageCanvas(false);
  const payload = compressCanvasToJpeg(canvas);
  if (payload.data.length > SCREENSHOT_MAX_DATA_URL_LENGTH) {
    throw new Error("Screenshot ainda grande demais apos compressao.");
  }
  return payload;
}

function createMediaRecorder(stream: MediaStream): { recorder: MediaRecorder; mime: string } {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return {
        recorder: new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: RECORDING_BITRATE }),
        mime: mime.split(";")[0] ?? "video/webm",
      };
    }
  }
  return {
    recorder: new MediaRecorder(stream),
    mime: "video/webm",
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function startPageRecording(onTick?: (elapsedMs: number) => void): PageRecordingSession {
  const startedAt = Date.now();
  let stopped = false;
  const { width: viewportWidth, height: viewportHeight } = viewportSize();
  const canvas = document.createElement("canvas");
  canvas.width = viewportWidth;
  canvas.height = viewportHeight;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("Canvas 2D indisponivel para gravacao.");
  }
  const paintCtx = ctx;
  paintCtx.fillStyle = "#ffffff";
  paintCtx.fillRect(0, 0, canvas.width, canvas.height);

  const stream = canvas.captureStream(0);
  const { recorder, mime } = createMediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(250);

  const minFrameDelayMs = Math.round(1000 / RECORDING_FALLBACK_MAX_FPS);

  const captureLoop = async () => {
    while (!stopped) {
      const frameStartedAt = Date.now();
      onTick?.(Date.now() - startedAt);
      try {
        const frame = await capturePageCanvas(true);
        if (frame.width !== canvas.width || frame.height !== canvas.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
        }
        paintFrameOnCanvas(paintCtx, frame, canvas.width, canvas.height);
        requestVideoFrame(stream);
      } catch {
        // ignora frame com falha e segue gravando
      }
      const elapsed = Date.now() - frameStartedAt;
      if (elapsed < minFrameDelayMs) {
        await sleep(minFrameDelayMs - elapsed);
      }
    }
  };

  void captureLoop();

  const stopImpl = async (): Promise<MediaPayload | null> => {
    if (stopped) return null;
    stopped = true;

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      if (recorder.state !== "inactive") recorder.stop();
      else resolve();
    });

    stream.getTracks().forEach((track) => track.stop());

    if (!chunks.length) return null;
    const blob = new Blob(chunks, { type: mime });
    const data = await blobToDataUrl(blob);
    return {
      mime,
      data,
      duration_ms: Date.now() - startedAt,
    };
  };

  return {
    getElapsedMs: () => Date.now() - startedAt,
    stop: stopImpl,
  };
}

export async function beginGlobalPageRecording(
  onTick?: (elapsedMs: number) => void,
  onEnded?: (result: MediaPayload | null) => void,
): Promise<void> {
  if (activeRecordingSession) return;
  recordingEndedHandler = onEnded ?? null;

  if (canUseDisplayMediaRecording()) {
    try {
      activeRecordingSession = await startDisplayMediaRecording(onTick);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        recordingEndedHandler = null;
        throw error;
      }
    }
  }

  activeRecordingSession = startPageRecording(onTick);
}

export async function endGlobalPageRecording(): Promise<MediaPayload | null> {
  const session = activeRecordingSession;
  activeRecordingSession = null;
  recordingEndedHandler = null;
  if (!session) return null;
  return session.stop();
}

export function isPageRecordingActive(): boolean {
  return activeRecordingSession !== null;
}

export function getPageRecordingElapsedMs(): number {
  return activeRecordingSession?.getElapsedMs() ?? 0;
}

export function saveReportDraft(draft: ReportProblemDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota errors for draft
  }
}

export function loadReportDraft(): ReportProblemDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReportProblemDraft;
  } catch {
    return null;
  }
}

export function clearReportDraft(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function waitForUiSettled(ms = 450): Promise<void> {
  await waitForNextPaint();
  await new Promise((resolve) => setTimeout(resolve, ms));
}
