from __future__ import annotations

import json
import logging
import re
import unicodedata
import zipfile
from io import BytesIO
from typing import Any
from xml.etree import ElementTree

from django.contrib.auth import get_user_model
from django.db.models import Q

from blackbeans_api.clients.models import Client
from blackbeans_api.governance.llm_client import complete_text
from blackbeans_api.governance.llm_client import is_llm_enabled

logger = logging.getLogger(__name__)

User = get_user_model()

ALLOWED_INTAKE_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md"}
MAX_EXTRACT_CHARS = 24_000
MAX_DRAFTS = 40

INTAKE_SYSTEM = (
    "Voce extrai TAREFAS e ACOES de uma ata de reuniao. Responda APENAS JSON valido, sem markdown:\n"
    '{"client_name": "cliente padrao se um so for citado ou null",'
    ' "tasks": [{"title": "titulo curto", "description": "contexto da acao",'
    ' "assignee_hint": "nome da pessoa ou null", "client_name": "cliente desta tarefa ou null"}]}\n'
    "Regras:\n"
    "- Extraia SOMENTE acoes, entregas, pendencias e proximos passos (uma task por acao).\n"
    "- Em atas do Gemini, use o bloco 'Proximas etapas' no formato [Pessoa] Titulo: descricao.\n"
    "- NAO crie tarefa a partir de: titulo da reuniao, data, convidados, resumo, secao Detalhes"
    " (notas da conversa), rodape do Gemini, nem palavras isoladas do PDF.\n"
    "- Cada task precisa de um titulo com sentido (frase, nao uma palavra so).\n"
    "- Nao invente clientes. Titulos curtos em PT-BR.\n"
    "- Se nao houver acao clara, devolva tasks: []."
)

_ACTION_HEADING = re.compile(
    r"^(a[cç][oõ]es(?:\s+acordadas)?|action items?|pr[oó]ximas?\s+etapas|"
    r"pr[oó]ximos?\s+passos|next steps?|follow[- ]?ups?|compromissos)\s*:?\s*$",
    re.IGNORECASE,
)
_STOP_HEADING = re.compile(
    r"^(detalhes|resumo|summary|convidad[oa]s?|participantes?|guests?|anexos?|"
    r"transcri[cç][aã]o)\s*:?\s*$",
    re.IGNORECASE,
)
_SKIP_HEADING = re.compile(
    r"^(resumo|summary|convidad[oa]s?|participantes?|guests?|anexos?|ata|"
    r"sprint di[aá]ria|sprint semanal|data|date|transcri[cç][aã]o|detalhes)\b",
    re.IGNORECASE,
)
_BULLET = re.compile(r"^\s*(?:[-*•●–—]|\d+[.)]|\[\s?[xX ]?\s?\])\s+")
_GEMINI_ITEM = re.compile(
    r"\[([^\[\]]{1,80})\]\s+([^:]{3,160}?):\s+",
)
_HEADING_SPLIT = re.compile(
    r"(?i)(?<!\n)\b(Resumo|Ações|Acoes|Action items?|Próximas etapas|Proximas etapas|"
    r"Próximos passos|Proximos passos|Pendências|Pendencias|Convidados|"
    r"Participantes|Anexos|Detalhes)\b",
)
_GEMINI_FOOTER = re.compile(
    r"Revise as anota[cç][oõ]es do Gemini.*$",
    re.IGNORECASE | re.DOTALL,
)


def extract_text_from_bytes(filename: str, payload: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith((".txt", ".md")):
        return payload.decode("utf-8", errors="replace")
    if name.endswith(".docx"):
        return _extract_docx(payload)
    if name.endswith(".pdf"):
        return _extract_pdf(payload)
    if name.endswith(".doc"):
        return payload.decode("latin-1", errors="replace")
    return payload.decode("utf-8", errors="replace")


def _extract_docx(payload: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            xml_bytes = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile, OSError):
        return ""
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return ""
    texts: list[str] = []
    for node in root.iter():
        if node.tag.endswith("}t") and node.text:
            texts.append(node.text)
    return "\n".join(texts)


def _extract_pdf(payload: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore[import-not-found]
    except ImportError:
        PdfReader = None  # type: ignore[misc, assignment]
    if PdfReader is not None:
        try:
            reader = PdfReader(BytesIO(payload))
            parts = [(page.extract_text() or "") for page in reader.pages]
            text = "\n".join(parts).strip()
            if text:
                return text
        except Exception:  # noqa: BLE001
            logger.warning("intake.pdf.pypdf_failed", exc_info=True)
    return _extract_pdf_strings(payload)


def _extract_pdf_strings(payload: bytes) -> str:
    raw = payload.decode("latin-1", errors="ignore")
    chunks = re.findall(r"\((?:\\.|[^\\)]){3,}\)", raw)
    cleaned: list[str] = []
    for chunk in chunks:
        inner = chunk[1:-1]
        inner = inner.replace("\\n", "\n").replace("\\r", " ").replace("\\t", " ")
        inner = re.sub(r"\\[()\\]", lambda m: m.group(0)[-1], inner)
        if re.search(r"[A-Za-zÀ-ÿ]{3,}", inner):
            cleaned.append(inner)
    return "\n".join(cleaned)


def normalize_ata_text(text: str) -> str:
    out = unicodedata.normalize("NFKC", text or "")
    out = out.replace("\r\n", "\n").replace("\r", "\n")
    # pypdf em atas Gemini: cada palavra vira uma linha ("marketing\\n \\nde").
    out = re.sub(r"\n[ \t]+\n", " ", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = _GEMINI_FOOTER.sub("", out)
    out = _HEADING_SPLIT.sub(r"\n\1", out)
    out = re.sub(r"[ \t]+\n", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def parse_llm_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            return {"client_name": None, "tasks": []}
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {"client_name": None, "tasks": []}
    if not isinstance(data, dict):
        return {"client_name": None, "tasks": []}
    return data


def _normalize_task_item(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    title = re.sub(r"\s+", " ", str(item.get("title") or "")).strip()
    if not _is_plausible_title(title):
        return None
    client_name = str(item.get("client_name") or "").strip()
    return {
        "title": title[:255],
        "description": re.sub(r"\s+", " ", str(item.get("description") or "")).strip(),
        "assignee_hint": str(item.get("assignee_hint") or "").strip(),
        "client_name": client_name or None,
    }


def _is_plausible_title(title: str) -> bool:
    cleaned = re.sub(r"\s+", " ", title or "").strip(" .,:;|-")
    if len(cleaned) < 12:
        return False
    words = [part for part in re.split(r"\s+", cleaned) if part]
    if len(words) < 2:
        return False
    if _SKIP_HEADING.match(cleaned) or _ACTION_HEADING.match(cleaned):
        return False
    return True


def _action_window(text: str) -> str:
    start_match = re.search(
        r"(pr[oó]ximas?\s+etapas|pr[oó]ximos?\s+passos|action items?|a[cç][oõ]es)\s*:?",
        text,
        flags=re.IGNORECASE,
    )
    if not start_match:
        return text
    start = start_match.end()
    end_match = re.search(
        r"(?:\n\s*)?Detalhes\s*(?:[●•]|$)",
        text[start:],
        flags=re.IGNORECASE,
    )
    end = start + end_match.start() if end_match else len(text)
    return text[start:end]


def extract_gemini_actions(text: str) -> list[dict[str, Any]]:
    window = _action_window(normalize_ata_text(text))
    tasks: list[dict[str, Any]] = []
    seen: set[str] = set()
    matches = list(_GEMINI_ITEM.finditer(window))
    for index, match in enumerate(matches):
        assignee_raw = re.sub(r"\s+", " ", match.group(1)).strip()
        title = re.sub(r"\s+", " ", match.group(2)).strip()
        desc_end = matches[index + 1].start() if index + 1 < len(matches) else len(window)
        description = re.sub(r"\s+", " ", window[match.end() : desc_end]).strip(" .")
        description = re.split(r"\bDetalhes\b", description, maxsplit=1)[0].strip(" .")
        if not _is_plausible_title(title):
            continue
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        first_person = assignee_raw.split(",")[0].strip()
        assignee_hint = "" if first_person.casefold() in {"o grupo", "grupo", "todos", "a equipe"} else first_person
        tasks.append(
            {
                "title": title[:255],
                "description": (description or title)[:4000],
                "assignee_hint": assignee_hint,
                "client_name": None,
            }
        )
        if len(tasks) >= MAX_DRAFTS:
            break
    return tasks


def extract_tasks_heuristic(text: str) -> list[dict[str, Any]]:
    gemini = extract_gemini_actions(text)
    if gemini:
        return gemini

    normalized = normalize_ata_text(text)
    if not normalized:
        return []

    lines: list[str] = []
    for raw_line in normalized.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if line:
            lines.append(line)

    section_start: int | None = None
    section_end = len(lines)
    for index, line in enumerate(lines):
        if _ACTION_HEADING.match(line) and section_start is None:
            section_start = index + 1
        elif section_start is not None and _STOP_HEADING.match(line):
            section_end = index
            break

    pool = lines[section_start:section_end] if section_start is not None else lines
    tasks: list[dict[str, Any]] = []
    seen: set[str] = set()

    for line in pool:
        if _ACTION_HEADING.match(line) or _SKIP_HEADING.match(line) or _STOP_HEADING.match(line):
            continue
        is_bullet = bool(_BULLET.match(line))
        cleaned = _BULLET.sub("", line).strip()
        if not is_bullet and section_start is None:
            continue
        if not is_bullet:
            continue
        assignee_hint = ""
        named = re.match(
            r"^([A-ZÁÉÍÓÚÂÊÔÃÕÀ][\wÁ-ÿ'.\- ]{1,40})\s*[:\-–]\s+(.+)$",
            cleaned,
        )
        if named:
            assignee_hint = named.group(1).strip()
            cleaned = named.group(2).strip()
        if not _is_plausible_title(cleaned):
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        tasks.append(
            {
                "title": cleaned[:255],
                "description": cleaned,
                "assignee_hint": assignee_hint,
                "client_name": None,
            }
        )
        if len(tasks) >= MAX_DRAFTS:
            break
    return tasks


def suggest_tasks_from_ata(*, filename: str, text: str) -> dict[str, Any]:
    clipped = normalize_ata_text(text)[:MAX_EXTRACT_CHARS]
    if not clipped:
        return {"client_name": None, "tasks": []}

    if is_llm_enabled():
        raw = complete_text(
            system=INTAKE_SYSTEM,
            user=f"Arquivo: {filename}\n\nAta:\n{clipped}",
            timeout_seconds=45.0,
        )
        if raw:
            parsed = parse_llm_json(raw)
            tasks = parsed.get("tasks") if isinstance(parsed.get("tasks"), list) else []
            normalized = [item for item in (_normalize_task_item(row) for row in tasks) if item]
            if normalized:
                client_name = parsed.get("client_name")
                return {
                    "client_name": str(client_name).strip() if client_name else None,
                    "tasks": normalized[:MAX_DRAFTS],
                }

    gemini = extract_gemini_actions(clipped)
    if gemini:
        return {"client_name": None, "tasks": gemini}

    return {"client_name": None, "tasks": extract_tasks_heuristic(clipped)}


def match_client(name: str | None) -> Client | None:
    query = (name or "").strip()
    if not query:
        return None
    exact = Client.objects.filter(name__iexact=query).first()
    if exact:
        return exact
    return Client.objects.filter(name__icontains=query).order_by("name").first()


def match_assignee(hint: str | None):
    query = (hint or "").strip()
    if not query:
        return None
    qs = User.objects.filter(is_active=True).filter(
        Q(name__icontains=query) | Q(username__icontains=query) | Q(email__icontains=query)
    )
    return qs.order_by("name", "id").first()
