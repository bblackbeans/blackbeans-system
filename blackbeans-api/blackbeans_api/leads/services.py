from __future__ import annotations

import csv
import io
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


def derive_display_name(payload: dict[str, Any], column_keys: list[str]) -> str:
    key_map = {str(k).strip().lower(): k for k in payload}
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


def build_search_text(*, payload: dict[str, Any], origem: str, display_name: str) -> str:
    parts: list[str] = [origem or "", display_name or ""]
    for value in payload.values():
        text = _cell_to_str(value)
        if text:
            parts.append(text)
    return " ".join(parts).lower()


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
    # Heuristica por assinatura / conteudo
    if content[:2] == b"PK":
        return parse_xlsx_bytes(content)
    return parse_csv_bytes(content)
