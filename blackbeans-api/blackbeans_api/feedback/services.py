from __future__ import annotations

import json
import time
import uuid
from typing import Any

from django.conf import settings
from django.core.cache import cache
from rest_framework import status

SCREENSHOT_MAX_CHARS = 120_000
VIDEO_MAX_CHARS = 7_000_000
VIDEO_MAX_DURATION_MS = 120_000
CONTEXTO_MAX_CHARS = 65_536
RATE_LIMIT_WINDOW_SECONDS = 3600


class FeedbackValidationError(Exception):
    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class FeedbackDisabledError(Exception):
    pass


class FeedbackRateLimitError(Exception):
    def __init__(self, limit: int) -> None:
        self.limit = limit
        super().__init__(f"Limite de {limit} reportes por hora")


def assert_feedback_enabled() -> None:
    if not getattr(settings, "PROBLEM_REPORTS_FEEDBACK_ENABLED", True):
        raise FeedbackDisabledError()


def check_rate_limit(user_id: int) -> None:
    limit = int(getattr(settings, "PROBLEM_REPORTS_RATE_LIMIT_PER_HOUR", 10))
    cache_key = f"problem_report_rate:{user_id}"
    now = time.time()
    hits = cache.get(cache_key) or []
    hits = [t for t in hits if now - float(t) < RATE_LIMIT_WINDOW_SECONDS]
    if len(hits) >= limit:
        raise FeedbackRateLimitError(limit)
    hits.append(now)
    cache.set(cache_key, hits, timeout=RATE_LIMIT_WINDOW_SECONDS)


def _validate_screenshot(data: dict[str, Any]) -> None:
    raw = str(data.get("data", ""))
    if not raw.startswith("data:image/"):
        raise FeedbackValidationError(
            "Screenshot invalido: deve ser data URL de imagem.",
            {"screenshot": ["Formato invalido."]},
        )
    if len(raw) > SCREENSHOT_MAX_CHARS:
        raise FeedbackValidationError(
            "Screenshot muito grande.",
            {"screenshot": [f"Maximo {SCREENSHOT_MAX_CHARS} caracteres."]},
        )


def _validate_recording(data: dict[str, Any]) -> None:
    mime = str(data.get("mime", "")).lower()
    if mime not in {"video/webm", "video/mp4"}:
        raise FeedbackValidationError(
            "Gravacao invalida.",
            {"screen_recording": ["MIME deve ser video/webm ou video/mp4."]},
        )
    raw = str(data.get("data", ""))
    if len(raw) > VIDEO_MAX_CHARS:
        raise FeedbackValidationError(
            "Gravacao muito grande.",
            {"screen_recording": [f"Maximo {VIDEO_MAX_CHARS} caracteres."]},
        )
    duration_ms = int(data.get("duration_ms") or 0)
    if duration_ms > VIDEO_MAX_DURATION_MS:
        raise FeedbackValidationError(
            "Gravacao muito longa.",
            {"screen_recording": [f"Maximo {VIDEO_MAX_DURATION_MS}ms."]},
        )


def validate_context_payload(contexto: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(contexto, dict):
        raise FeedbackValidationError(
            "Contexto invalido.",
            {"contexto": ["Deve ser um objeto JSON."]},
        )

    screenshot = contexto.get("screenshot")
    if screenshot is not None:
        if not isinstance(screenshot, dict):
            raise FeedbackValidationError("Screenshot invalido.", {"screenshot": ["Objeto esperado."]})
        _validate_screenshot(screenshot)

    recording = contexto.get("screen_recording")
    if recording is not None:
        if not isinstance(recording, dict):
            raise FeedbackValidationError("Gravacao invalida.", {"screen_recording": ["Objeto esperado."]})
        _validate_recording(recording)

    context_without_media = {k: v for k, v in contexto.items() if k not in {"screenshot", "screen_recording"}}
    serialized = json.dumps(context_without_media, ensure_ascii=False, default=str)
    if len(serialized) > CONTEXTO_MAX_CHARS:
        raise FeedbackValidationError(
            "Contexto tecnico muito grande.",
            {"contexto": [f"Maximo {CONTEXTO_MAX_CHARS} caracteres sem midia."]},
        )

    return contexto


def new_correlation_id() -> str:
    return str(uuid.uuid4())


def strip_media_from_context(context_json: dict[str, Any]) -> dict[str, Any]:
    if not context_json:
        return {}
    result = dict(context_json)
    has_screenshot = bool(result.get("screenshot"))
    has_recording = bool(result.get("screen_recording"))

    if "screenshot" in result:
        screenshot = result["screenshot"]
        if isinstance(screenshot, dict):
            result["screenshot"] = {
                "mime": screenshot.get("mime"),
                "has_data": bool(screenshot.get("data")),
            }
        else:
            result["screenshot"] = {"has_data": True}

    if "screen_recording" in result:
        recording = result["screen_recording"]
        if isinstance(recording, dict):
            result["screen_recording"] = {
                "mime": recording.get("mime"),
                "duration_ms": recording.get("duration_ms"),
                "has_data": bool(recording.get("data")),
            }
        else:
            result["screen_recording"] = {"has_data": True}

    result["has_screenshot"] = has_screenshot
    result["has_recording"] = has_recording
    return result


def feedback_disabled_http_status() -> int:
    return status.HTTP_503_SERVICE_UNAVAILABLE
