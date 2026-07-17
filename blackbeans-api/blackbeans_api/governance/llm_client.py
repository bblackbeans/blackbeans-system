from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


def is_llm_enabled() -> bool:
    if not bool(getattr(settings, "AGENT_LLM_ENABLED", True)):
        return False
    return bool((getattr(settings, "OPENAI_API_KEY", "") or "").strip())


def complete_text(
    *,
    system: str,
    user: str,
    timeout_seconds: float = 45.0,
) -> str | None:
    """Chama OpenAI Chat Completions. Retorna None se desabilitado ou em falha."""
    if not is_llm_enabled():
        return None

    api_key = str(settings.OPENAI_API_KEY).strip()
    model = str(getattr(settings, "OPENAI_MODEL", "gpt-4o-mini") or "gpt-4o-mini")
    base = str(getattr(settings, "OPENAI_API_BASE", "https://api.openai.com/v1") or "").rstrip("/")
    url = f"{base}/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("llm.complete_text.failed error=%s", exc)
        return None
    except Exception:  # noqa: BLE001
        logger.exception("llm.complete_text.unexpected")
        return None

    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        logger.warning("llm.complete_text.bad_payload keys=%s", list(body.keys()) if isinstance(body, dict) else type(body))
        return None
    text = str(content or "").strip()
    return text or None
