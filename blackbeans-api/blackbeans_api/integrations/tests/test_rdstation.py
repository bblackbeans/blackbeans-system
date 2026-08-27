from __future__ import annotations

import json
from datetime import timedelta
from urllib.parse import parse_qsl
from uuid import uuid4

import pytest
from django.db import IntegrityError
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from blackbeans_api.integrations.client import RdCrmClient
from blackbeans_api.integrations.client import RdHttpError
from blackbeans_api.integrations.crypto import decrypt_secret
from blackbeans_api.integrations.crypto import encrypt_secret
from blackbeans_api.integrations.jobs import create_sync_job
from blackbeans_api.integrations.jobs import preview_sync
from blackbeans_api.integrations.models import IntegrationCredential
from blackbeans_api.integrations.models import LocalType
from blackbeans_api.integrations.models import Provider
from blackbeans_api.integrations.models import RdEntityMapping
from blackbeans_api.integrations.models import RdWebhookEvent
from blackbeans_api.integrations.models import RemoteType
from blackbeans_api.integrations.models import SyncStatus
from blackbeans_api.integrations.oauth import build_authorization_url
from blackbeans_api.integrations.oauth import disconnect
from blackbeans_api.integrations.oauth import exchange_code
from blackbeans_api.integrations.oauth import get_settings
from blackbeans_api.integrations.oauth import refresh_access_token
from blackbeans_api.integrations.sync import sync_company
from blackbeans_api.integrations.webhooks import ingest_webhook
from blackbeans_api.integrations.webhooks import process_webhook_event
from blackbeans_api.integrations.webhooks import reconcile_mapped_entities
from blackbeans_api.leads.models import Lead
from blackbeans_api.leads.models import LeadCompany
from blackbeans_api.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

ACCESS_A = "access-token-aaa"
ACCESS_B = "access-token-bbb"
REFRESH_A = "refresh-token-aaa"
REFRESH_B = "refresh-token-bbb"
OWNER_ID = "999999999999999999999999"


def _connect(*, access=ACCESS_A, refresh=REFRESH_A):
    IntegrationCredential.objects.update_or_create(
        provider=Provider.RD_STATION_CRM,
        defaults={
            "access_token_encrypted": encrypt_secret(access),
            "refresh_token_encrypted": encrypt_secret(refresh),
            "access_expires_at": timezone.now() + timedelta(hours=1),
            "connected_at": timezone.now(),
        },
    )


def _company(**kwargs) -> LeadCompany:
    defaults = {
        "name": "Construtora Alfa",
        "name_normalized": "construtora alfa",
        "cnpj": "11222333000181",
        "origem": "planilha",
        "completeness_score": 80,
        "website_domain": "alfa.com.br",
        "contacts_count": 1,
    }
    defaults.update(kwargs)
    return LeadCompany.objects.create(**defaults)


def _lead(company: LeadCompany, **kwargs) -> Lead:
    defaults = {
        "company": company,
        "display_name": "Maria Souza",
        "email": "maria.souza@alfa.com.br",
        "phone": "11987654321",
        "job_title": "Diretora",
        "payload": {},
        "completeness_score": 80,
    }
    defaults.update(kwargs)
    return Lead.objects.create(**defaults)


class ScriptedTransport:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def __call__(self, method, url, headers, body, timeout):
        payload = None
        if body:
            raw = body.decode()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = dict(parse_qsl(raw))
        self.calls.append(
            {
                "method": method,
                "url": url,
                "auth": headers.get("Authorization", ""),
                "body": payload,
            },
        )
        if not self.script:
            return 500, {"error": "unexpected"}, {}
        item = self.script.pop(0)
        if callable(item):
            return item(method, url, headers, payload)
        status, data, hdrs = item
        return status, data, hdrs or {}


def test_encrypt_roundtrip():
    token = encrypt_secret("super-secret-token")
    assert "super-secret-token" not in token
    assert decrypt_secret(token) == "super-secret-token"


def test_mapping_local_unique():
    company = _company()
    RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
        local_id=company.pk,
        remote_type=RemoteType.ORGANIZATION,
        remote_id="aaaaaaaaaaaaaaaaaaaaaaaa",
        sync_status=SyncStatus.SYNCED,
    )
    with pytest.raises(IntegrityError):
        RdEntityMapping.objects.create(
            provider=Provider.RD_STATION_CRM,
            local_type=LocalType.COMPANY,
            local_id=company.pk,
            remote_type=RemoteType.ORGANIZATION,
            remote_id="bbbbbbbbbbbbbbbbbbbbbbbb",
            sync_status=SyncStatus.SYNCED,
        )


def test_mapping_remote_id_unique():
    a = _company(name="A", name_normalized="a", cnpj=None)
    b = _company(name="B", name_normalized="b", cnpj="99888777000166")
    RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
        local_id=a.pk,
        remote_type=RemoteType.ORGANIZATION,
        remote_id="aaaaaaaaaaaaaaaaaaaaaaaa",
        sync_status=SyncStatus.SYNCED,
    )
    with pytest.raises(IntegrityError):
        RdEntityMapping.objects.create(
            provider=Provider.RD_STATION_CRM,
            local_type=LocalType.COMPANY,
            local_id=b.pk,
            remote_type=RemoteType.ORGANIZATION,
            remote_id="aaaaaaaaaaaaaaaaaaaaaaaa",
            sync_status=SyncStatus.SYNCED,
        )


def test_mapping_blank_remote_id_not_unique():
    a = _company(name="A", name_normalized="a", cnpj=None)
    b = _company(name="B", name_normalized="b", cnpj="99888777000166")
    RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
        local_id=a.pk,
        remote_type=RemoteType.ORGANIZATION,
        remote_id="",
        sync_status=SyncStatus.SYNCING,
    )
    RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
        local_id=b.pk,
        remote_type=RemoteType.ORGANIZATION,
        remote_id="",
        sync_status=SyncStatus.SYNCING,
    )
    assert RdEntityMapping.objects.filter(remote_id="").count() == 2


@override_settings(
    RDSTATION_CRM_CLIENT_ID="client-id",
    RDSTATION_CRM_CLIENT_SECRET="client-secret",
    RDSTATION_CRM_REDIRECT_URI="https://app.example/api/v1/integrations/rdstation/oauth/callback",
)
def test_oauth_start_and_exchange_and_refresh_rotation():
    user = UserFactory.create(is_staff=True, is_active=True)
    url = build_authorization_url(user=user)
    assert "client_id=client-id" in url
    assert "response_type=code" in url
    assert "accounts.rdstation.com/oauth/authorize" in url
    assert "state=" in url
    from blackbeans_api.integrations.models import IntegrationOAuthState

    state = IntegrationOAuthState.objects.get().state
    transport = ScriptedTransport(
        [
            (
                200,
                {
                    "access_token": ACCESS_A,
                    "refresh_token": REFRESH_A,
                    "expires_in": 7200,
                },
                {},
            ),
            (
                200,
                {
                    "access_token": ACCESS_B,
                    "refresh_token": REFRESH_B,
                    "expires_in": 7200,
                },
                {},
            ),
        ],
    )
    exchange_code("auth-code", state, transport=transport)
    cred = IntegrationCredential.objects.get()
    assert decrypt_secret(cred.access_token_encrypted) == ACCESS_A
    assert "oauth2/token" in transport.calls[0]["url"]
    assert transport.calls[0]["body"]["grant_type"] == "authorization_code"
    cred.access_expires_at = timezone.now() - timedelta(minutes=1)
    cred.save(update_fields=["access_expires_at"])
    token = refresh_access_token(transport=transport)
    assert token == ACCESS_B
    assert transport.calls[1]["body"]["grant_type"] == "refresh_token"
    cred.refresh_from_db()
    assert decrypt_secret(cred.refresh_token_encrypted) == REFRESH_B
    disconnect()
    assert IntegrationCredential.objects.count() == 0


def test_client_retries_429_and_refreshes_401():
    def handler(method, url, headers, payload):
        n = len(handler.calls)
        handler.calls.append(headers.get("Authorization"))
        if n == 0:
            return 429, {"error": "rate"}, {"Retry-After": "0"}
        if n == 1:
            return 401, {"error": "expired"}, {}
        return 200, {"data": {"id": "cccccccccccccccccccccccc", "name": "Alfa"}}, {}

    handler.calls = []
    transport = ScriptedTransport([handler, handler, handler])
    tokens = {"value": ACCESS_A}

    def provider():
        return tokens["value"]

    def refresher():
        tokens["value"] = ACCESS_B
        return ACCESS_B

    client = RdCrmClient(
        transport=transport,
        token_provider=provider,
        refresher=refresher,
        max_retry_after=0.01,
    )
    data = client.get("/organizations/cccccccccccccccccccccccc")
    assert data["data"]["name"] == "Alfa"
    assert handler.calls[0] == f"Bearer {ACCESS_A}"
    assert handler.calls[-1] == f"Bearer {ACCESS_B}"


def test_http_422_uses_errors_detail():
    transport = ScriptedTransport(
        [
            (
                422,
                {"errors": [{"detail": "User Não pode ficar sem ser preenchido."}]},
                {},
            ),
        ],
    )
    client = RdCrmClient(
        transport=transport, access_token=ACCESS_A, max_retry_after=0.01,
    )
    with pytest.raises(RdHttpError) as exc:
        client.post("/organizations", payload={"data": {"name": "X"}})
    assert "User" in str(exc.value)


def test_sync_uses_cnpj_not_name_and_creates_contact_with_legal_bases():
    _connect()
    company = _company()
    _lead(company)
    org_id = "111111111111111111111111"
    contact_id = "222222222222222222222222"
    cfg = get_settings()
    cfg.create_deals = False
    cfg.cnpj_custom_field_slug = "cnpj"
    cfg.save()

    def handler(method, url, headers, payload):
        if method == "GET" and url.rstrip("/").endswith("/users"):
            return 200, {"data": [{"id": OWNER_ID, "name": "Kaue"}]}, {}
        if method == "GET" and "/organizations" in url and "filter=" in url:
            assert company.cnpj in url
            assert company.name not in url
            return 200, {"data": []}, {}
        if method == "POST" and url.endswith("/organizations"):
            assert payload["data"]["custom_fields"]["cnpj"] == company.cnpj
            assert payload["data"]["name"] == company.name
            assert payload["data"]["owner_id"] == OWNER_ID
            return 200, {"data": {"id": org_id}}, {}
        if method == "GET" and "/contacts" in url:
            return 200, {"data": []}, {}
        if method == "POST" and url.endswith("/contacts"):
            assert payload["data"]["legal_bases"]
            assert payload["data"]["emails"][0]["email"] == "maria.souza@alfa.com.br"
            return 200, {"data": {"id": contact_id}}, {}
        raise AssertionError(f"unexpected {method} {url}")

    transport = ScriptedTransport([handler, handler, handler, handler, handler])
    result = sync_company(company.pk, transport=transport)
    assert result["status"] == "synced"
    assert result["organization_id"] == org_id
    mapping = RdEntityMapping.objects.get(
        local_type=LocalType.COMPANY, local_id=company.pk,
    )
    assert mapping.remote_id == org_id
    assert mapping.sync_status == SyncStatus.SYNCED


def test_second_sync_skips_without_force():
    _connect()
    company = _company()
    RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
        local_id=company.pk,
        remote_type=RemoteType.ORGANIZATION,
        remote_id="111111111111111111111111",
        sync_status=SyncStatus.SYNCED,
        last_synced_at=timezone.now(),
    )
    result = sync_company(company.pk, transport=ScriptedTransport([]))
    assert result["status"] == "skipped"


def test_deal_created_only_when_configured():
    _connect()
    company = _company()
    _lead(company)
    cfg = get_settings()
    cfg.create_deals = True
    cfg.pipeline_id = "333333333333333333333333"
    cfg.stage_id = "444444444444444444444444"
    cfg.min_score_for_deal = 50
    cfg.save()
    org_id = "111111111111111111111111"
    contact_id = "222222222222222222222222"
    deal_id = "555555555555555555555555"

    def handler(method, url, headers, payload):
        if method == "GET" and url.rstrip("/").endswith("/users"):
            return 200, {"data": [{"id": OWNER_ID, "name": "Kaue"}]}, {}
        if method == "GET" and "/organizations" in url:
            return 200, {"data": [{"id": org_id}]}, {}
        if method == "PUT" and "/organizations/" in url:
            return 200, {"data": {"id": org_id}}, {}
        if method == "GET" and "/contacts" in url:
            return 200, {"data": []}, {}
        if method == "POST" and url.endswith("/contacts"):
            return 200, {"data": {"id": contact_id}}, {}
        if method == "POST" and url.endswith("/deals"):
            assert payload["data"]["pipeline_id"] == cfg.pipeline_id
            assert payload["data"]["organization_id"] == org_id
            return 200, {"data": {"id": deal_id}}, {}
        raise AssertionError(f"unexpected {method} {url}")

    transport = ScriptedTransport([handler] * 8)
    result = sync_company(company.pk, force_resync=True, transport=transport)
    assert result["deal_id"] == deal_id
    assert RdEntityMapping.objects.filter(
        local_type=LocalType.DEAL, remote_id=deal_id,
    ).exists()


def test_preview_and_job_use_filters_not_page():
    _connect()
    for index in range(3):
        _company(name=f"Empresa {index}", name_normalized=f"empresa {index}", cnpj=None)
    preview = preview_sync(
        params={"page": "1", "page_size": "1", "origem": "planilha"},
        company_ids=[],
        select_all_matching=True,
    )
    assert preview["found"] == 3
    assert preview["eligible"] == 3
    user = UserFactory.create(is_staff=True)
    job = create_sync_job(
        params={"page": "1", "page_size": "1", "origem": "planilha"},
        company_ids=[],
        select_all_matching=True,
        force_resync=False,
        user=user,
    )
    assert job.total == 3
    assert job.items.count() == 3


def test_preview_company_ids_ignores_select_all():
    first = _company(name="Alvo", name_normalized="alvo", cnpj="11222333000181")
    _company(name="Outra", name_normalized="outra", cnpj="99888777000166")
    preview = preview_sync(
        params={"origem": "planilha"},
        company_ids=[first.pk],
        select_all_matching=False,
    )
    assert preview["found"] == 1
    assert preview["eligible"] == 1


def test_webhook_idempotent_and_updates_contact():
    company = _company()
    lead = _lead(company, email="maria.souza@alfa.com.br")
    RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.CONTACT,
        local_id=lead.pk,
        remote_type=RemoteType.CONTACT,
        remote_id="222222222222222222222222",
        sync_status=SyncStatus.SYNCED,
    )
    company_map = RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
        local_id=company.pk,
        remote_type=RemoteType.ORGANIZATION,
        remote_id="111111111111111111111111",
        sync_status=SyncStatus.SYNCED,
    )
    payload = {
        "event_type": "crm_contact_updated",
        "transaction_uuid": "tx-dup-1",
        "document": {
            "id": "222222222222222222222222",
            "name": "Maria Souza Atualizada",
            "emails": [{"email": "maria.souza@alfa.com.br"}],
            "phones": [{"phone": "11999990000"}],
            "job_title": "CEO",
        },
    }
    raw = json.dumps(payload).encode()
    event, created = ingest_webhook(payload, raw)
    assert created is True
    event2, created2 = ingest_webhook(payload, raw)
    assert created2 is False
    assert event2.pk == event.pk
    process_webhook_event(event)
    lead.refresh_from_db()
    assert lead.display_name == "Maria Souza Atualizada"
    assert lead.phone == "11999990000"
    assert lead.job_title == "CEO"
    company_map.refresh_from_db()
    assert company_map.sync_status == SyncStatus.SYNCED
    assert RdWebhookEvent.objects.count() == 1


def test_reconcile_fetches_mapped_ids_only():
    _connect()
    company = _company()
    mapping = RdEntityMapping.objects.create(
        provider=Provider.RD_STATION_CRM,
        local_type=LocalType.COMPANY,
        local_id=company.pk,
        remote_type=RemoteType.ORGANIZATION,
        remote_id="111111111111111111111111",
        sync_status=SyncStatus.SYNCED,
        last_synced_at=timezone.now(),
    )
    seen = []

    def handler(method, url, headers, payload):
        seen.append(url)
        assert "111111111111111111111111" in url
        return 200, {"data": {"id": "111111111111111111111111", "name": "Alfa"}}, {}

    result = reconcile_mapped_entities(transport=ScriptedTransport([handler]))
    assert result["updated"] == 1
    mapping.refresh_from_db()
    assert mapping.last_error == ""
    assert seen


def test_api_preview_and_webhook_auth():
    admin = UserFactory.create(is_staff=True, is_superuser=True, is_active=True)
    client = APIClient()
    client.force_authenticate(user=admin)
    _company()
    response = client.get("/api/v1/integrations/rdstation/sync/preview?origem=planilha")
    assert response.status_code == 200
    assert response.data["data"]["found"] == 1
    assert response.data["data"]["connected"] is False
    cfg = get_settings()
    cfg.webhook_secret = "hook-secret"
    cfg.webhook_header_name = "X-BlackBeans-RD"
    cfg.save()
    bad = APIClient()
    denied = bad.post(
        "/api/v1/integrations/rdstation/webhook",
        {"event_type": "crm_deal_updated", "transaction_uuid": str(uuid4())},
        format="json",
    )
    assert denied.status_code == 401
    ok = bad.post(
        "/api/v1/integrations/rdstation/webhook",
        {
            "event_type": "crm_deal_updated",
            "transaction_uuid": "tx-api-1",
            "document": {"id": "d"},
        },
        format="json",
        HTTP_X_BLACKBEANS_RD="hook-secret",
    )
    assert ok.status_code == 200
    assert ok.data["data"]["accepted"] is True
    dup = bad.post(
        "/api/v1/integrations/rdstation/webhook",
        {
            "event_type": "crm_deal_updated",
            "transaction_uuid": "tx-api-1",
            "document": {"id": "d"},
        },
        format="json",
        HTTP_X_BLACKBEANS_RD="hook-secret",
    )
    assert dup.data["data"]["duplicate"] is True


def test_status_requires_staff():
    user = UserFactory.create(is_staff=False, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get("/api/v1/integrations/rdstation/status")
    assert response.status_code in {403, 401}
