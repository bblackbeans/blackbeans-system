from __future__ import annotations

import csv
import io
import re
import unicodedata
from typing import Any

DISPLAY_NAME_KEYS = (
    "nome",
    "nome da empresa",
    "nome empresa",
    "cliente",
    "razao_social_rf",
    "razao social",
    "razão social",
    "contato",
    "nome contato",
    "nome responsavel",
    "nome responsável",
    "company",
    "name",
)

COMPANY_NAME_KEYS = (
    "nome da empresa",
    "nome empresa",
    "razao_social_rf",
    "razao social",
    "razão social",
    "razao_social",
    "cliente",
    "company",
    "empresa",
    "construtora",
    "incorporadora",
)

CONTACT_NAME_KEYS = (
    "nome contato",
    "nome do contato",
    "nome responsavel",
    "nome responsável",
    "contato",
    "nome",
    "name",
)

CNPJ_KEY_HINTS = ("cnpj",)
EMAIL_KEY_HINTS = ("email", "e-mail", "mail")
PHONE_KEY_HINTS = ("telefone", "phone", "celular", "whatsapp", "tel", "fone")
SITE_KEY_HINTS = ("site", "website", "url", "web")
ADDRESS_KEY_HINTS = ("endereco", "endereço", "logradouro", "rua", "bairro", "cidade", "cep")

QUALITY_BEST_THRESHOLD = 60

_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
_CNPJ_DIGITS_RE = re.compile(r"\D+")


class LeadParseError(Exception):
    """Arquivo invalido ou sem dados utilizaveis."""


def _cell_to_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float):
        if value.is_integer():
            text = str(int(value))
        else:
            text = str(value)
    else:
        text = str(value).strip()
    if not text or text.lower() in {"none", "null", "nan"}:
        return None
    return text


def _normalize_header(raw: Any, index: int) -> str:
    text = _cell_to_str(raw)
    if not text:
        return f"coluna_{index + 1}"
    return text


def normalize_company_name(name: str | None) -> str:
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text.lower())
    text = re.sub(r"\s+", " ", text).strip()
    return text[:512]


def normalize_cnpj(value: str | None) -> str | None:
    if not value:
        return None
    digits = _CNPJ_DIGITS_RE.sub("", value)
    if len(digits) != 14:
        return None
    return digits


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    if text.lower().startswith("tel:"):
        text = text[4:]
    digits = re.sub(r"\D", "", text)
    if len(digits) < 8:
        return None
    return digits[:20]


def normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    match = _EMAIL_RE.search(value.strip())
    if not match:
        return None
    return match.group(0).lower()[:255]


def _key_map(payload: dict[str, Any]) -> dict[str, str]:
    return {str(k).strip().lower(): k for k in payload}


def _first_by_keys(payload: dict[str, Any], candidates: tuple[str, ...]) -> str | None:
    key_map = _key_map(payload)
    for candidate in candidates:
        real = key_map.get(candidate)
        if real is None:
            continue
        value = _cell_to_str(payload.get(real))
        if value:
            return value
    return None


def _first_by_hint(payload: dict[str, Any], hints: tuple[str, ...]) -> str | None:
    for key, raw in payload.items():
        low = str(key).strip().lower()
        if any(h in low for h in hints):
            value = _cell_to_str(raw)
            if value:
                return value
    return None


def derive_display_name(payload: dict[str, Any], column_keys: list[str]) -> str:
    key_map = _key_map(payload)
    for candidate in DISPLAY_NAME_KEYS:
        real = key_map.get(candidate)
        if real is None:
            continue
        value = _cell_to_str(payload.get(real))
        if value:
            return value[:512]
    for key in column_keys:
        value = _cell_to_str(payload.get(key))
        if value:
            return value[:512]
    for value in payload.values():
        text = _cell_to_str(value)
        if text:
            return text[:512]
    return "Lead sem nome"


def derive_company_name(payload: dict[str, Any], *, fallback: str | None = None) -> str:
    value = _first_by_keys(payload, COMPANY_NAME_KEYS)
    if value:
        return value[:512]
    if fallback:
        return fallback[:512]
    return "Empresa sem nome"


def derive_contact_name(payload: dict[str, Any], *, fallback: str | None = None) -> str:
    value = _first_by_keys(payload, CONTACT_NAME_KEYS)
    if value:
        return value[:512]
    if fallback:
        return fallback[:512]
    return "Contato sem nome"


def extract_structured_fields(payload: dict[str, Any]) -> dict[str, Any]:
    cnpj_raw = _first_by_hint(payload, CNPJ_KEY_HINTS) or _first_by_keys(payload, ("cnpj",))
    email_raw = _first_by_hint(payload, EMAIL_KEY_HINTS)
    phone_raw = _first_by_hint(payload, PHONE_KEY_HINTS)
    return {
        "cnpj": normalize_cnpj(cnpj_raw),
        "email": normalize_email(email_raw),
        "phone": normalize_phone(phone_raw),
        "has_site": bool(_first_by_hint(payload, SITE_KEY_HINTS)),
        "has_address": bool(_first_by_hint(payload, ADDRESS_KEY_HINTS)),
    }


def compute_completeness_score(
    *,
    has_cnpj: bool,
    has_phone: bool,
    has_email: bool,
    has_site: bool = False,
    has_address: bool = False,
) -> int:
    score = 0
    if has_cnpj:
        score += 35
    if has_phone:
        score += 25
    if has_email:
        score += 25
    if has_site:
        score += 10
    if has_address:
        score += 5
    return min(score, 100)


def enrich_lead_fields(payload: dict[str, Any], column_keys: list[str]) -> dict[str, Any]:
    display_name = derive_display_name(payload, column_keys)
    contact_name = derive_contact_name(payload, fallback=display_name)
    company_name = derive_company_name(payload, fallback=display_name)
    structured = extract_structured_fields(payload)
    cnpj = structured["cnpj"] if isinstance(structured["cnpj"], str) else None
    email = structured["email"] if isinstance(structured["email"], str) else None
    phone = structured["phone"] if isinstance(structured["phone"], str) else None
    has_cnpj = bool(cnpj)
    has_email = bool(email)
    has_phone = bool(phone)
    has_site = bool(structured.get("has_site"))
    has_address = bool(structured.get("has_address"))
    score = compute_completeness_score(
        has_cnpj=has_cnpj,
        has_phone=has_phone,
        has_email=has_email,
        has_site=has_site,
        has_address=has_address,
    )
    return {
        "display_name": contact_name,
        "company_name": company_name,
        "company_name_normalized": normalize_company_name(company_name),
        "cnpj": cnpj or "",
        "email": email or "",
        "phone": phone or "",
        "has_cnpj": has_cnpj,
        "has_email": has_email,
        "has_phone": has_phone,
        "has_site": has_site,
        "has_address": has_address,
        "completeness_score": score,
    }


def build_search_text(*, payload: dict[str, Any], origem: str, display_name: str) -> str:
    parts: list[str] = [origem or "", display_name or ""]
    for value in payload.values():
        text = _cell_to_str(value)
        if text:
            parts.append(text)
    return " ".join(parts).lower()


def build_company_search_text(*, name: str, cnpj: str | None, origem: str, extra: str = "") -> str:
    return " ".join(part for part in [name, cnpj or "", origem, extra] if part).lower()


def recompute_company_quality(company) -> None:
    """Atualiza flags/score/contagem da empresa a partir dos contatos."""
    contacts = list(company.contacts.all())
    has_cnpj = bool(company.cnpj) or any(c.has_cnpj for c in contacts)
    has_phone = any(c.has_phone for c in contacts)
    has_email = any(c.has_email for c in contacts)
    has_site = False
    has_address = False
    for contact in contacts:
        structured = extract_structured_fields(dict(contact.payload or {}))
        has_site = has_site or bool(structured.get("has_site"))
        has_address = has_address or bool(structured.get("has_address"))
    company.has_cnpj = has_cnpj
    company.has_phone = has_phone
    company.has_email = has_email
    company.completeness_score = compute_completeness_score(
        has_cnpj=has_cnpj,
        has_phone=has_phone,
        has_email=has_email,
        has_site=has_site,
        has_address=has_address,
    )
    company.contacts_count = len(contacts)
    company.search_text = build_company_search_text(
        name=company.name,
        cnpj=company.cnpj,
        origem=company.origem,
        extra=" ".join(c.display_name for c in contacts[:20]),
    )
    company.save(
        update_fields=[
            "has_cnpj",
            "has_phone",
            "has_email",
            "completeness_score",
            "contacts_count",
            "search_text",
            "updated_at",
        ],
    )


def get_or_create_company_for_payload(
    *,
    payload: dict[str, Any],
    column_keys: list[str],
    origem: str,
    freshness: str,
    cache: dict[str, Any] | None = None,
):
    from blackbeans_api.leads.models import LeadCompany

    enriched = enrich_lead_fields(payload, column_keys)
    cnpj = enriched["cnpj"] or None
    name = enriched["company_name"]
    name_norm = enriched["company_name_normalized"]
    cache = cache if cache is not None else {}

    cache_key = f"cnpj:{cnpj}" if cnpj else f"name:{name_norm}"
    if cache_key in cache:
        company = cache[cache_key]
    else:
        company = None
        if cnpj:
            company = LeadCompany.objects.filter(cnpj=cnpj).first()
        if company is None and name_norm:
            company = LeadCompany.objects.filter(name_normalized=name_norm).first()
        if company is None:
            company = LeadCompany.objects.create(
                name=name,
                name_normalized=name_norm,
                cnpj=cnpj,
                origem=origem or "",
                freshness=freshness,
                has_cnpj=bool(cnpj),
                has_phone=enriched["has_phone"],
                has_email=enriched["has_email"],
                completeness_score=enriched["completeness_score"],
                contacts_count=0,
                search_text=build_company_search_text(name=name, cnpj=cnpj, origem=origem),
            )
        else:
            changed = False
            if cnpj and not company.cnpj:
                company.cnpj = cnpj
                company.has_cnpj = True
                changed = True
            if origem and not company.origem:
                company.origem = origem
                changed = True
            if freshness == "novo" and company.freshness != "novo":
                company.freshness = "novo"
                changed = True
            if changed:
                company.save()
        cache[cache_key] = company
    return company, enriched


def _rows_from_matrix(matrix: list[list[Any]]) -> tuple[list[str], list[dict[str, Any]]]:
    if not matrix:
        raise LeadParseError("Planilha vazia.")
    header_row = matrix[0]
    if not header_row:
        raise LeadParseError("Cabecalho da planilha vazio.")

    column_keys: list[str] = []
    seen: dict[str, int] = {}
    for idx, raw in enumerate(header_row):
        base = _normalize_header(raw, idx)
        count = seen.get(base, 0)
        seen[base] = count + 1
        column_keys.append(base if count == 0 else f"{base}_{count + 1}")

    rows: list[dict[str, Any]] = []
    for raw_row in matrix[1:]:
        if raw_row is None:
            continue
        payload: dict[str, Any] = {}
        has_value = False
        for idx, key in enumerate(column_keys):
            cell = raw_row[idx] if idx < len(raw_row) else None
            value = _cell_to_str(cell)
            if value is not None:
                payload[key] = value
                has_value = True
        if has_value:
            rows.append(payload)

    if not rows:
        raise LeadParseError("Nenhuma linha de dados encontrada.")
    return column_keys, rows


def parse_csv_bytes(content: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    text: str | None = None
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise LeadParseError("Nao foi possivel decodificar o CSV.")

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel

    reader = csv.reader(io.StringIO(text), dialect)
    matrix = [list(row) for row in reader]
    return _rows_from_matrix(matrix)


def parse_xlsx_bytes(content: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover
        raise LeadParseError("Suporte a XLSX indisponivel (openpyxl).") from exc

    try:
        workbook = load_workbook(filename=io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise LeadParseError("Arquivo XLSX invalido.") from exc

    try:
        sheet = workbook.active
        matrix: list[list[Any]] = []
        for row in sheet.iter_rows(values_only=True):
            matrix.append(list(row) if row else [])
    finally:
        workbook.close()

    return _rows_from_matrix(matrix)


def parse_spreadsheet(*, filename: str, content: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    name = (filename or "").lower().strip()
    if name.endswith(".csv") or name.endswith(".txt"):
        return parse_csv_bytes(content)
    if name.endswith(".xlsx") or name.endswith(".xlsm"):
        return parse_xlsx_bytes(content)
    if content[:2] == b"PK":
        return parse_xlsx_bytes(content)
    return parse_csv_bytes(content)
