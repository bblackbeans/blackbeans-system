from __future__ import annotations

import re
import unicodedata
from typing import Any
from typing import Literal

QUALITY_BEST_THRESHOLD = 60

CNPJ_LENGTH = 14
CNPJ_BASE_LENGTH = 12
CNPJ_MODULUS = 11
CNPJ_DV_THRESHOLD = 2
MIN_PHONE_DIGITS = 8
MOBILE_NATIONAL_LENGTH = 11
LANDLINE_NATIONAL_LENGTH = 10
BR_DDD_MIN = 11
BR_DDD_MAX = 99
PERSON_NAME_MIN_TOKENS = 2

SCORE_MAX = 100
POINTS_CNPJ_VALID = 20
POINTS_EMAIL_NOMINATIVE = 28
POINTS_EMAIL_PERSONAL = 12
POINTS_EMAIL_ROLE = 4
POINTS_PHONE_MOBILE = 22
POINTS_PHONE_LANDLINE = 12
POINTS_DECISION_MAKER = 18
POINTS_PERSON = 8
PENALTY_SHARED_EMAIL = 18
PENALTY_SHARED_PHONE = 15
PENALTY_GENERIC_BOX = 8

EmailKind = Literal["missing", "role", "personal", "nominative"]
PhoneKind = Literal["missing", "invalid", "landline", "mobile"]

ROLE_EMAIL_PREFIXES = frozenset(
    {
        "adm",
        "admin",
        "administrativo",
        "atendimento",
        "billing",
        "comercial",
        "compras",
        "contact",
        "contato",
        "financeiro",
        "help",
        "hello",
        "hr",
        "imprensa",
        "info",
        "jobs",
        "marketing",
        "no-reply",
        "noreply",
        "office",
        "ouvidoria",
        "postmaster",
        "rh",
        "sac",
        "sales",
        "suporte",
        "support",
        "team",
        "vendas",
        "webmaster",
    },
)

PERSONAL_EMAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "hotmail.com",
        "hotmail.com.br",
        "outlook.com",
        "outlook.com.br",
        "live.com",
        "yahoo.com",
        "yahoo.com.br",
        "icloud.com",
        "me.com",
        "bol.com.br",
        "uol.com.br",
        "terra.com.br",
        "ig.com.br",
        "r7.com",
        "zipmail.com.br",
    },
)

GENERIC_CONTACT_NAMES = frozenset(
    {
        "atendimento",
        "comercial",
        "contact",
        "contato",
        "contato comercial",
        "empresa",
        "financeiro",
        "nao informado",
        "não informado",
        "sac",
        "sem nome",
        "contato sem nome",
        "lead sem nome",
        "suporte",
        "vendas",
    },
)

DECISION_TITLE_TERMS = (
    "ceo",
    "cfo",
    "cio",
    "coo",
    "cto",
    "diretor",
    "diretora",
    "founder",
    "fundador",
    "fundadora",
    "gerente geral",
    "head",
    "owner",
    "presidente",
    "proprietario",
    "proprietário",
    "socio",
    "sócio",
    "socia",
    "sócia",
)

TITLE_KEY_HINTS = (
    "cargo",
    "funcao",
    "função",
    "titulo",
    "título",
    "job title",
    "job_title",
    "title",
)

_STRIP_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _fold(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower().strip()


def _cnpj_dv(base: str, weights: list[int]) -> str:
    total = sum(int(base[index]) * weights[index] for index in range(len(weights)))
    remainder = total % CNPJ_MODULUS
    if remainder < CNPJ_DV_THRESHOLD:
        return "0"
    return str(CNPJ_MODULUS - remainder)


def is_valid_cnpj(value: str | None) -> bool:
    if not value:
        return False
    digits = re.sub(r"\D", "", value)
    if len(digits) != CNPJ_LENGTH or digits == digits[0] * CNPJ_LENGTH:
        return False
    first = _cnpj_dv(digits[:CNPJ_BASE_LENGTH], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    second = _cnpj_dv(
        digits[:CNPJ_BASE_LENGTH] + first,
        [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    )
    return digits[-2:] == first + second


def cnpj_with_check_digits(base12: str) -> str:
    digits = re.sub(r"\D", "", base12)[:CNPJ_BASE_LENGTH].zfill(CNPJ_BASE_LENGTH)
    first = _cnpj_dv(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    second = _cnpj_dv(digits + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return digits + first + second


def _national_phone_digits(digits: str) -> str:
    if digits.startswith("55") and len(digits) in {12, 13}:
        return digits[2:]
    return digits


def is_obvious_fake_phone(digits: str) -> bool:
    if len(digits) < MIN_PHONE_DIGITS:
        return True
    if digits == digits[0] * len(digits):
        return True
    if digits in {"12345678", "123456789", "1234567890", "12345678901"}:
        return True
    sequential = "".join(
        str(i % 10) for i in range(int(digits[0]), int(digits[0]) + len(digits))
    )
    return digits == sequential


def _valid_br_ddd(national: str) -> bool:
    ddd = int(national[:2])
    return BR_DDD_MIN <= ddd <= BR_DDD_MAX


def classify_phone(phone: str | None) -> PhoneKind:
    if not phone:
        return "missing"
    digits = re.sub(r"\D", "", phone)
    national = _national_phone_digits(digits)
    if is_obvious_fake_phone(national):
        return "invalid"
    if (
        len(national) == MOBILE_NATIONAL_LENGTH
        and national[2] == "9"
        and _valid_br_ddd(
            national,
        )
    ):
        return "mobile"
    if len(national) == LANDLINE_NATIONAL_LENGTH and _valid_br_ddd(national):
        return "landline"
    return "invalid"


def classify_email(email: str | None) -> EmailKind:
    if not email or "@" not in email:
        return "missing"
    local, domain = email.lower().strip().split("@", 1)
    if not local or not domain:
        return "missing"
    tokens = [part for part in _STRIP_NON_ALNUM.split(local) if part]
    if local in ROLE_EMAIL_PREFIXES or any(
        token in ROLE_EMAIL_PREFIXES for token in tokens
    ):
        return "role"
    if domain in PERSONAL_EMAIL_DOMAINS:
        return "personal"
    return "nominative"


def extract_job_title(payload: dict[str, Any] | None) -> str:
    if not payload:
        return ""
    for key, raw in payload.items():
        low = str(key).strip().lower()
        if any(hint in low for hint in TITLE_KEY_HINTS):
            text = str(raw or "").strip()
            if text and text.lower() not in {"none", "null", "nan"}:
                return text[:120]
    return ""


def classify_person(
    *,
    contact_name: str | None,
    company_name: str | None = None,
    job_title: str | None = None,
) -> tuple[bool, bool]:
    folded_name = _fold(contact_name)
    folded_company = _fold(company_name)
    folded_title = _fold(job_title)
    same_as_company = bool(folded_company) and folded_name == folded_company
    if not folded_name or folded_name in GENERIC_CONTACT_NAMES or same_as_company:
        is_person = False
    else:
        tokens = [tok for tok in re.split(r"\s+", folded_name) if tok]
        is_person = len(tokens) >= PERSON_NAME_MIN_TOKENS and not any(
            tok in ROLE_EMAIL_PREFIXES for tok in tokens
        )

    haystack = f"{folded_title} {folded_name}".strip()
    is_decision_maker = _haystack_has_decision_term(haystack)
    if is_decision_maker:
        is_person = True
    return is_person, is_decision_maker


def _haystack_has_decision_term(haystack: str) -> bool:
    if not haystack:
        return False
    tokens = [tok for tok in re.split(r"[^a-z0-9]+", haystack) if tok]
    token_set = set(tokens)
    for term in DECISION_TITLE_TERMS:
        parts = [part for part in term.split() if part]
        if not parts:
            continue
        if len(parts) == 1:
            if parts[0] in token_set:
                return True
            continue
        length = len(parts)
        for index in range(len(tokens) - length + 1):
            if tokens[index : index + length] == parts:
                return True
    return False


def _add_breakdown(
    breakdown: list[dict[str, Any]],
    label: str,
    points: int,
) -> int:
    breakdown.append({"label": label, "points": points})
    return points


def _score_cnpj(cnpj: str | None, breakdown: list[dict[str, Any]]) -> tuple[int, bool]:
    cnpj_ok = is_valid_cnpj(cnpj)
    if cnpj_ok:
        return _add_breakdown(breakdown, "CNPJ válido", POINTS_CNPJ_VALID), True
    if cnpj:
        _add_breakdown(breakdown, "CNPJ inválido (dígito verificador)", 0)
    return 0, False


def _score_email(
    email: str | None,
    breakdown: list[dict[str, Any]],
) -> tuple[int, EmailKind]:
    kind = classify_email(email)
    labels = {
        "nominative": (
            f"E-mail nominativo corporativo ({email})",
            POINTS_EMAIL_NOMINATIVE,
        ),
        "personal": (f"E-mail pessoal ({email})", POINTS_EMAIL_PERSONAL),
        "role": (
            f"E-mail de função / caixa genérica ({email})",
            POINTS_EMAIL_ROLE,
        ),
    }
    if kind in labels:
        label, points = labels[kind]
        return _add_breakdown(breakdown, label, points), kind
    return 0, kind


def _score_phone(
    phone: str | None,
    breakdown: list[dict[str, Any]],
) -> tuple[int, PhoneKind]:
    kind = classify_phone(phone)
    if kind == "mobile":
        return (
            _add_breakdown(breakdown, "Celular brasileiro válido", POINTS_PHONE_MOBILE),
            kind,
        )
    if kind == "landline":
        return (
            _add_breakdown(
                breakdown,
                "Telefone fixo brasileiro",
                POINTS_PHONE_LANDLINE,
            ),
            kind,
        )
    if phone:
        _add_breakdown(breakdown, "Telefone inválido ou genérico", 0)
    return 0, kind


def _score_person(
    *,
    contact_name: str | None,
    company_name: str | None,
    job_title: str | None,
    breakdown: list[dict[str, Any]],
) -> tuple[int, bool, bool]:
    is_person, is_decision_maker = classify_person(
        contact_name=contact_name,
        company_name=company_name,
        job_title=job_title,
    )
    if is_decision_maker:
        suffix = f" ({job_title})" if job_title else ""
        points = _add_breakdown(
            breakdown,
            f"Decisor{suffix}",
            POINTS_DECISION_MAKER,
        )
        return points, is_person, is_decision_maker
    if is_person:
        points = _add_breakdown(
            breakdown,
            f"Contato nominativo ({contact_name})",
            POINTS_PERSON,
        )
        return points, is_person, is_decision_maker
    if contact_name:
        _add_breakdown(breakdown, f"Nome genérico ({contact_name})", 0)
    return 0, is_person, is_decision_maker


def _score_penalties(  # noqa: PLR0913
    *,
    email: str | None,
    phone: str | None,
    email_is_generic: bool,
    is_person: bool,
    email_is_shared: bool,
    phone_is_shared: bool,
    breakdown: list[dict[str, Any]],
) -> int:
    score = 0
    if email_is_shared and email:
        score += _add_breakdown(
            breakdown,
            "E-mail repetido em outros contatos",
            -PENALTY_SHARED_EMAIL,
        )
    if phone_is_shared and phone:
        score += _add_breakdown(
            breakdown,
            "Telefone repetido em outros contatos",
            -PENALTY_SHARED_PHONE,
        )
    if email_is_generic and not is_person:
        score += _add_breakdown(
            breakdown,
            "Caixa da empresa (e-mail e nome genéricos)",
            -PENALTY_GENERIC_BOX,
        )
    return score


def compute_prospect_score(  # noqa: PLR0913
    *,
    cnpj: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    contact_name: str | None = None,
    company_name: str | None = None,
    job_title: str | None = None,
    email_is_shared: bool = False,
    phone_is_shared: bool = False,
) -> dict[str, Any]:
    breakdown: list[dict[str, Any]] = []
    cnpj_points, cnpj_ok = _score_cnpj(cnpj, breakdown)
    email_points, email_kind = _score_email(email, breakdown)
    phone_points, phone_kind = _score_phone(phone, breakdown)
    person_points, is_person, is_decision_maker = _score_person(
        contact_name=contact_name,
        company_name=company_name,
        job_title=job_title,
        breakdown=breakdown,
    )
    email_is_generic = email_kind == "role"
    penalty_points = _score_penalties(
        email=email,
        phone=phone,
        email_is_generic=email_is_generic,
        is_person=is_person,
        email_is_shared=email_is_shared,
        phone_is_shared=phone_is_shared,
        breakdown=breakdown,
    )
    score = max(
        0,
        min(
            SCORE_MAX,
            cnpj_points + email_points + phone_points + person_points + penalty_points,
        ),
    )
    useful_email = email_kind == "nominative" or (
        email_kind == "personal" and is_person
    )
    useful_phone = phone_kind in {"mobile", "landline"} and not phone_is_shared
    return {
        "completeness_score": score,
        "has_cnpj": cnpj_ok,
        "has_email": useful_email,
        "has_phone": useful_phone,
        "email_is_generic": email_is_generic,
        "email_is_shared": bool(email_is_shared and email),
        "phone_is_shared": bool(phone_is_shared and phone),
        "contact_is_person": is_person,
        "contact_is_decision_maker": is_decision_maker,
        "email_kind": email_kind,
        "phone_kind": phone_kind,
        "job_title": job_title or "",
        "score_breakdown": breakdown,
    }


def prospect_quality_from_lead(
    lead,
    *,
    email_is_shared: bool = False,
    phone_is_shared: bool = False,
    company_name: str | None = None,
) -> dict[str, Any]:
    payload = dict(getattr(lead, "payload", None) or {})
    company = getattr(lead, "company", None)
    resolved_company = company_name or (company.name if company is not None else None)
    company_cnpj = company.cnpj if company is not None else None
    return compute_prospect_score(
        cnpj=getattr(lead, "cnpj", None) or payload.get("cnpj") or company_cnpj,
        email=getattr(lead, "email", None),
        phone=getattr(lead, "phone", None),
        contact_name=getattr(lead, "display_name", None),
        company_name=resolved_company,
        job_title=(getattr(lead, "job_title", None) or "").strip()
        or extract_job_title(payload),
        email_is_shared=email_is_shared,
        phone_is_shared=phone_is_shared,
    )


def apply_prospect_quality(lead, quality: dict[str, Any]) -> None:
    lead.has_cnpj = bool(quality["has_cnpj"])
    lead.has_email = bool(quality["has_email"])
    lead.has_phone = bool(quality["has_phone"])
    lead.completeness_score = int(quality["completeness_score"])
    lead.email_is_generic = bool(quality["email_is_generic"])
    lead.email_is_shared = bool(quality["email_is_shared"])
    lead.phone_is_shared = bool(quality["phone_is_shared"])
    lead.contact_is_person = bool(quality["contact_is_person"])
    lead.contact_is_decision_maker = bool(quality["contact_is_decision_maker"])


LEAD_QUALITY_FIELDS = (
    "has_cnpj",
    "has_phone",
    "has_email",
    "completeness_score",
    "email_is_generic",
    "email_is_shared",
    "phone_is_shared",
    "contact_is_person",
    "contact_is_decision_maker",
)
