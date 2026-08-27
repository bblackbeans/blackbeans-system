from __future__ import annotations

import pytest
from django.core.management import call_command
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from blackbeans_api.api.leads_views import _apply_quality_filters
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.leads.scoring import QUALITY_BEST_THRESHOLD
from blackbeans_api.leads.scoring import classify_email
from blackbeans_api.leads.scoring import classify_person
from blackbeans_api.leads.scoring import classify_phone
from blackbeans_api.leads.scoring import cnpj_with_check_digits
from blackbeans_api.leads.scoring import compute_prospect_score
from blackbeans_api.leads.scoring import is_valid_cnpj
from blackbeans_api.leads.services import enrich_lead_fields
from blackbeans_api.leads.services import get_or_create_company_for_payload
from blackbeans_api.leads.services import recompute_company_quality
from blackbeans_api.leads.services import refresh_shared_quality

VALID_CNPJ = cnpj_with_check_digits("112223330001")
INVALID_CNPJ = "12345678000190"
MOBILE = "11987654321"


def test_valid_cnpj_helper_matches_algorithm():
    assert is_valid_cnpj(VALID_CNPJ)
    assert not is_valid_cnpj(INVALID_CNPJ)
    assert not is_valid_cnpj("00000000000000")


def test_role_email_is_generic():
    assert classify_email("contato@empresa.com.br") == "role"
    assert classify_email("sac@foo.com") == "role"
    assert classify_email("contato.vendas@foo.com") == "role"
    assert classify_email("maria.souza@empresa.com.br") == "nominative"
    assert classify_email("joao.silva@gmail.com") == "personal"


def test_brazilian_phone_kinds():
    assert classify_phone("11987654321") == "mobile"
    assert classify_phone("5511987654321") == "mobile"
    assert classify_phone("1133334444") == "landline"
    assert classify_phone("11111111111") == "invalid"


def test_lucio_is_not_classified_as_cio():
    is_person, is_decision_maker = classify_person(contact_name="Lucio Silva")
    assert is_person is True
    assert is_decision_maker is False


def test_generic_contact_does_not_reach_best_threshold():
    result = compute_prospect_score(
        cnpj=VALID_CNPJ,
        email="contato@empresa.com.br",
        phone=MOBILE,
        contact_name="Contato",
        company_name="Empresa Alfa",
    )
    assert result["email_is_generic"] is True
    assert result["contact_is_decision_maker"] is False
    assert result["completeness_score"] < QUALITY_BEST_THRESHOLD
    assert result["has_email"] is False


def test_named_director_reaches_best_threshold():
    result = compute_prospect_score(
        cnpj=VALID_CNPJ,
        email="maria.souza@empresa.com.br",
        phone=MOBILE,
        contact_name="Maria Souza",
        company_name="Empresa Alfa",
        job_title="Diretora",
    )
    assert result["contact_is_decision_maker"] is True
    assert result["has_email"] is True
    assert result["has_phone"] is True
    assert result["completeness_score"] >= QUALITY_BEST_THRESHOLD


def test_invalid_cnpj_does_not_score():
    kwargs = {
        "email": "maria.souza@empresa.com.br",
        "phone": MOBILE,
        "contact_name": "Maria Souza",
    }
    valid = compute_prospect_score(cnpj=VALID_CNPJ, **kwargs)
    invalid = compute_prospect_score(cnpj=INVALID_CNPJ, **kwargs)
    assert invalid["has_cnpj"] is False
    assert invalid["completeness_score"] == valid["completeness_score"] - 20
    labels = [item["label"] for item in invalid["score_breakdown"]]
    assert any(
        "inválido" in label.lower() or "invalido" in label.lower() for label in labels
    )


def test_enrich_reads_job_title_from_payload():
    enriched = enrich_lead_fields(
        {
            "nome da empresa": "Alfa",
            "nome contato": "Maria Souza",
            "email": "maria.souza@empresa.com.br",
            "telefone": MOBILE,
            "cnpj": VALID_CNPJ,
            "cargo": "Diretora Comercial",
        },
        ["nome da empresa", "nome contato", "email", "telefone", "cnpj", "cargo"],
    )
    assert enriched["contact_is_decision_maker"] is True
    assert enriched["completeness_score"] >= QUALITY_BEST_THRESHOLD


@pytest.mark.django_db
def test_shared_phone_penalizes_all_contacts():
    company = LeadCompany.objects.create(name="Alfa", name_normalized="alfa")
    for index in range(3):
        Lead.objects.create(
            company=company,
            display_name=f"Pessoa {index}",
            email=f"pessoa{index}@empresa.com.br",
            phone=MOBILE,
            cnpj=VALID_CNPJ,
            payload={"nome": f"Pessoa {index}", "cargo": "Diretor", "cnpj": VALID_CNPJ},
        )
    refresh_shared_quality(phones=[MOBILE])
    scores = list(Lead.objects.values_list("phone_is_shared", "completeness_score"))
    assert all(shared for shared, _ in scores)
    unique = compute_prospect_score(
        cnpj=VALID_CNPJ,
        email="pessoa0@empresa.com.br",
        phone=MOBILE,
        contact_name="Pessoa 0",
        job_title="Diretor",
        phone_is_shared=False,
    )["completeness_score"]
    for _, score in scores:
        assert score == unique - 15


@pytest.mark.django_db
def test_shared_email_penalizes_all_contacts():
    company = LeadCompany.objects.create(name="Alfa", name_normalized="alfa")
    shared_email = "maria.souza@empresa.com.br"
    for index in range(2):
        Lead.objects.create(
            company=company,
            display_name=f"Maria Souza {index}",
            email=shared_email,
            phone=f"1198888000{index}",
            cnpj=VALID_CNPJ,
            payload={"nome": f"Maria Souza {index}", "cnpj": VALID_CNPJ},
        )
    refresh_shared_quality(emails=[shared_email])
    scores = list(Lead.objects.values_list("email_is_shared", "completeness_score"))
    assert all(shared for shared, _ in scores)
    unique = compute_prospect_score(
        cnpj=VALID_CNPJ,
        email=shared_email,
        phone="11988880000",
        contact_name="Maria Souza 0",
        email_is_shared=False,
    )["completeness_score"]
    for _, score in scores:
        assert score == unique - 18


@pytest.mark.django_db
def test_company_with_only_generic_email_does_not_inherit_high_score():
    company = LeadCompany.objects.create(
        name="Beta",
        name_normalized="beta",
        cnpj=VALID_CNPJ,
    )
    Lead.objects.create(
        company=company,
        display_name="SAC",
        email="sac@beta.com.br",
        phone=MOBILE,
        cnpj=VALID_CNPJ,
        payload={"nome": "SAC", "cnpj": VALID_CNPJ},
    )
    refresh_shared_quality(emails=["sac@beta.com.br"], phones=[MOBILE])
    company.refresh_from_db()
    recompute_company_quality(company)
    company.refresh_from_db()
    contact = company.contacts.get()
    assert contact.email_is_generic is True
    assert contact.completeness_score < QUALITY_BEST_THRESHOLD
    assert company.completeness_score == contact.completeness_score
    assert company.email_is_generic is True
    assert company.has_email is False


@pytest.mark.django_db
def test_import_rows_apply_prospect_score_and_shared_phone():
    rows = [
        {
            "nome da empresa": "Alfa",
            "nome contato": "Contato",
            "email": "contato@alfa.com.br",
            "telefone": MOBILE,
            "cnpj": VALID_CNPJ,
        },
        {
            "nome da empresa": "Alfa",
            "nome contato": "Maria Souza",
            "email": "maria.souza@alfa.com.br",
            "telefone": MOBILE,
            "cnpj": VALID_CNPJ,
            "cargo": "Diretora",
        },
    ]
    cache: dict = {}
    keys = ["nome da empresa", "nome contato", "email", "telefone", "cnpj", "cargo"]
    leads: list[Lead] = []
    company = None
    for payload in rows:
        company, enriched = get_or_create_company_for_payload(
            payload=payload,
            column_keys=keys,
            origem="Planilha teste",
            freshness="novo",
            cache=cache,
        )
        leads.append(
            Lead(
                company=company,
                payload=payload,
                display_name=enriched["display_name"],
                email=enriched["email"],
                phone=enriched["phone"],
                cnpj=enriched["cnpj"],
                has_cnpj=enriched["has_cnpj"],
                has_phone=enriched["has_phone"],
                has_email=enriched["has_email"],
                completeness_score=enriched["completeness_score"],
                email_is_generic=enriched["email_is_generic"],
                email_is_shared=enriched["email_is_shared"],
                phone_is_shared=enriched["phone_is_shared"],
                contact_is_person=enriched["contact_is_person"],
                contact_is_decision_maker=enriched["contact_is_decision_maker"],
            ),
        )
    Lead.objects.bulk_create(leads)
    refresh_shared_quality(
        emails=[row.email for row in leads],
        phones=[row.phone for row in leads],
    )
    company.refresh_from_db()
    generic = Lead.objects.get(email="contato@alfa.com.br")
    director = Lead.objects.get(email="maria.souza@alfa.com.br")
    assert generic.email_is_generic is True
    assert generic.completeness_score < QUALITY_BEST_THRESHOLD
    assert director.contact_is_decision_maker is True
    assert director.phone_is_shared is True
    assert generic.phone_is_shared is True
    assert company.completeness_score == director.completeness_score
    assert company.contact_is_decision_maker is True


@pytest.mark.django_db
def test_quality_filters_hide_generic_and_select_decision_makers():

    decision_company = LeadCompany.objects.create(
        name="Com decisor",
        name_normalized="com decisor",
        contact_is_decision_maker=True,
        email_is_generic=False,
        completeness_score=80,
    )
    generic_company = LeadCompany.objects.create(
        name="So generico",
        name_normalized="so generico",
        contact_is_decision_maker=False,
        email_is_generic=True,
        phone_is_shared=True,
        completeness_score=20,
    )
    factory = APIRequestFactory()

    decision_ids = set(
        _apply_quality_filters(
            LeadCompany.objects.all(),
            Request(factory.get("/leads/companies", {"decision_makers": "true"})),
        ).values_list("pk", flat=True),
    )
    assert decision_company.pk in decision_ids
    assert generic_company.pk not in decision_ids

    hidden_generic = set(
        _apply_quality_filters(
            LeadCompany.objects.all(),
            Request(factory.get("/leads/companies", {"hide_generic_email": "true"})),
        ).values_list("pk", flat=True),
    )
    assert decision_company.pk in hidden_generic
    assert generic_company.pk not in hidden_generic

    hidden_shared = set(
        _apply_quality_filters(
            LeadCompany.objects.all(),
            Request(factory.get("/leads/companies", {"hide_shared_phone": "true"})),
        ).values_list("pk", flat=True),
    )
    assert decision_company.pk in hidden_shared
    assert generic_company.pk not in hidden_shared


@pytest.mark.django_db
def test_recompute_command_updates_existing_rows():
    company = LeadCompany.objects.create(name="Gama", name_normalized="gama")
    lead = Lead.objects.create(
        company=company,
        display_name="Maria Souza",
        email="maria.souza@empresa.com.br",
        phone=MOBILE,
        cnpj=VALID_CNPJ,
        payload={"nome": "Maria Souza", "cargo": "CEO", "cnpj": VALID_CNPJ},
        completeness_score=0,
    )
    call_command("recompute_lead_scores")
    lead.refresh_from_db()
    company.refresh_from_db()
    assert lead.contact_is_decision_maker is True
    assert lead.completeness_score >= QUALITY_BEST_THRESHOLD
    assert company.completeness_score == lead.completeness_score
    assert company.contact_is_decision_maker is True
