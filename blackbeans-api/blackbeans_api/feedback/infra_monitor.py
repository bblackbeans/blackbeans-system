from __future__ import annotations

import logging
import shutil
import time
from dataclasses import asdict
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import connection
from django.utils import timezone

from blackbeans_api.feedback.models import ProblemReport
from blackbeans_api.feedback.services import new_correlation_id

logger = logging.getLogger(__name__)

OPEN_STATUSES = {
    ProblemReport.Status.NOVO,
    ProblemReport.Status.EM_ANALISE,
}

SOURCE_SYSTEM = "system"


@dataclass
class InfraAlert:
    fingerprint: str
    severity: str  # warning | critical
    title: str
    description: str
    reasons: list[str]
    metrics: dict[str, Any]


def _bytes_to_gb(value: int | float) -> float:
    return round(float(value) / (1024**3), 2)


def _human_bytes(value: int | float) -> str:
    n = float(value)
    if n >= 1024**3:
        return f"{n / (1024**3):.2f} GB"
    if n >= 1024**2:
        return f"{n / (1024**2):.1f} MB"
    if n >= 1024:
        return f"{n / 1024:.0f} KB"
    return f"{int(n)} B"


def _pct(part: float, whole: float) -> float | None:
    if whole <= 0:
        return None
    return round((part / whole) * 100.0, 1)


def collect_infrastructure_snapshot() -> dict[str, Any]:
    """Coleta metricas de DB, disco e Redis para diagnostico."""
    snapshot: dict[str, Any] = {
        "collected_at": timezone.now().isoformat().replace("+00:00", "Z"),
        "database": {},
        "disk": {},
        "redis": {},
    }

    # --- Database ---
    db_info: dict[str, Any] = {}
    try:
        started = time.perf_counter()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
            query_ms = round((time.perf_counter() - started) * 1000, 1)
            db_info["query_latency_ms"] = query_ms

            cursor.execute("SELECT pg_database_size(current_database())")
            size_bytes = int(cursor.fetchone()[0])
            db_info["size_bytes"] = size_bytes
            db_info["size_gb"] = _bytes_to_gb(size_bytes)

            cursor.execute("SHOW max_connections")
            max_conn = int(cursor.fetchone()[0])
            cursor.execute(
                "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()",
            )
            used_conn = int(cursor.fetchone()[0])
            db_info["max_connections"] = max_conn
            db_info["used_connections"] = used_conn
            db_info["connections_pct"] = _pct(used_conn, max_conn)

            cursor.execute(
                """
                SELECT relname, pg_total_relation_size(c.oid) AS total_bytes
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'r' AND n.nspname = 'public'
                ORDER BY total_bytes DESC
                LIMIT 5
                """,
            )
            top_tables = [
                {"table": str(row[0]), "size_bytes": int(row[1]), "size_gb": _bytes_to_gb(row[1])}
                for row in cursor.fetchall()
            ]
            db_info["top_tables"] = top_tables
        db_info["status"] = "ok"
    except Exception as exc:
        logger.exception("infra.db_snapshot_failed")
        db_info["status"] = "fail"
        db_info["error"] = str(exc)[:500]
    snapshot["database"] = db_info

    # --- Disk (media / data volume) ---
    disk_info: dict[str, Any] = {}
    try:
        media_root = getattr(settings, "MEDIA_ROOT", None) or "/"
        usage = shutil.disk_usage(str(media_root))
        disk_info = {
            "path": str(media_root),
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "total_gb": _bytes_to_gb(usage.total),
            "used_gb": _bytes_to_gb(usage.used),
            "free_gb": _bytes_to_gb(usage.free),
            "used_pct": _pct(usage.used, usage.total),
            "status": "ok",
        }
    except Exception as exc:
        logger.exception("infra.disk_snapshot_failed")
        disk_info = {"status": "fail", "error": str(exc)[:500]}
    snapshot["disk"] = disk_info

    # --- Redis ---
    redis_info: dict[str, Any] = {}
    try:
        from django.core.cache import cache

        started = time.perf_counter()
        cache.set("bb_infra_ping", "1", timeout=30)
        ok = cache.get("bb_infra_ping") == "1"
        redis_info["ping_ms"] = round((time.perf_counter() - started) * 1000, 1)
        redis_info["status"] = "ok" if ok else "fail"
    except Exception as exc:
        logger.exception("infra.redis_snapshot_failed")
        redis_info = {"status": "fail", "error": str(exc)[:500]}
    snapshot["redis"] = redis_info

    return snapshot


def evaluate_infrastructure_alerts(snapshot: dict[str, Any]) -> list[InfraAlert]:
    alerts: list[InfraAlert] = []
    db = snapshot.get("database") or {}
    disk = snapshot.get("disk") or {}
    redis = snapshot.get("redis") or {}

    db_max_bytes = int(getattr(settings, "INFRA_DB_SIZE_ALERT_MAX_BYTES", 10 * 1024**3))
    db_warn_pct = float(getattr(settings, "INFRA_DB_SIZE_WARN_PCT", 80))
    db_crit_pct = float(getattr(settings, "INFRA_DB_SIZE_CRITICAL_PCT", 95))
    disk_warn_pct = float(getattr(settings, "INFRA_DISK_WARN_PCT", 85))
    disk_crit_pct = float(getattr(settings, "INFRA_DISK_CRITICAL_PCT", 95))
    conn_warn_pct = float(getattr(settings, "INFRA_DB_CONNECTIONS_WARN_PCT", 80))
    conn_crit_pct = float(getattr(settings, "INFRA_DB_CONNECTIONS_CRITICAL_PCT", 95))
    latency_warn_ms = float(getattr(settings, "INFRA_DB_LATENCY_WARN_MS", 500))
    latency_crit_ms = float(getattr(settings, "INFRA_DB_LATENCY_CRITICAL_MS", 2000))
    redis_warn_ms = float(getattr(settings, "INFRA_REDIS_LATENCY_WARN_MS", 200))
    redis_crit_ms = float(getattr(settings, "INFRA_REDIS_LATENCY_CRITICAL_MS", 1000))

    # --- DB size ---
    size_bytes = db.get("size_bytes")
    if isinstance(size_bytes, int) and db_max_bytes > 0:
        size_pct = _pct(size_bytes, db_max_bytes) or 0.0
        if size_pct >= db_warn_pct:
            severity = "critical" if size_pct >= db_crit_pct else "warning"
            top = db.get("top_tables") or []
            top_txt = ", ".join(
                f"{t.get('table')} ({_human_bytes(int(t.get('size_bytes') or 0))})" for t in top[:3]
            ) or "n/d"
            reasons = [
                f"Banco usa {_human_bytes(size_bytes)} de {_human_bytes(db_max_bytes)} "
                f"configurados como limite ({size_pct}%).",
                f"Maiores tabelas: {top_txt}.",
                "Risco: backups lentos, inserts/updates mais caros e falha ao gravar quando o disco encher.",
            ]
            alerts.append(
                InfraAlert(
                    fingerprint=f"infra|db_size|{severity}",
                    severity=severity,
                    title=f"[Infra] Banco de dados quase cheio ({size_pct}%)",
                    description="\n".join(reasons),
                    reasons=reasons,
                    metrics={
                        "size_bytes": size_bytes,
                        "size_gb": _bytes_to_gb(size_bytes),
                        "max_bytes": db_max_bytes,
                        "max_gb": _bytes_to_gb(db_max_bytes),
                        "used_pct": size_pct,
                        "top_tables": top,
                    },
                ),
            )

    # --- Disk ---
    used_pct = disk.get("used_pct")
    if isinstance(used_pct, (int, float)) and used_pct >= disk_warn_pct:
        severity = "critical" if used_pct >= disk_crit_pct else "warning"
        reasons = [
            f"Disco do volume de midia ({disk.get('path')}) esta em {used_pct}% "
            f"({disk.get('used_gb')} GB de {disk.get('total_gb')} GB).",
            f"Livre: {disk.get('free_gb')} GB.",
            "Risco: uploads, anexos e gravacoes de pedido/problema falham quando o disco enche.",
        ]
        alerts.append(
            InfraAlert(
                fingerprint=f"infra|disk|{severity}",
                severity=severity,
                title=f"[Infra] Disco quase cheio ({used_pct}%)",
                description="\n".join(reasons),
                reasons=reasons,
                metrics={k: disk.get(k) for k in ("path", "used_pct", "used_gb", "free_gb", "total_gb")},
            ),
        )

    # --- Connections ---
    conn_pct = db.get("connections_pct")
    if isinstance(conn_pct, (int, float)) and conn_pct >= conn_warn_pct:
        severity = "critical" if conn_pct >= conn_crit_pct else "warning"
        reasons = [
            f"Conexoes ativas no Postgres: {db.get('used_connections')} de "
            f"{db.get('max_connections')} ({conn_pct}%).",
            "Causa tipica: pico de usuarios, queries lentas segurando conexao, ou worker sem pool.",
            "Risco: novos logins/requests passam a falhar com 'too many connections'.",
        ]
        alerts.append(
            InfraAlert(
                fingerprint=f"infra|db_connections|{severity}",
                severity=severity,
                title=f"[Infra] Muitas conexoes no banco ({conn_pct}%)",
                description="\n".join(reasons),
                reasons=reasons,
                metrics={
                    "used_connections": db.get("used_connections"),
                    "max_connections": db.get("max_connections"),
                    "connections_pct": conn_pct,
                },
            ),
        )

    # --- DB latency ---
    latency = db.get("query_latency_ms")
    if isinstance(latency, (int, float)) and latency >= latency_warn_ms:
        severity = "critical" if latency >= latency_crit_ms else "warning"
        reasons = [
            f"Latencia de uma query simples (SELECT 1) = {latency} ms "
            f"(limite de alerta {latency_warn_ms} ms).",
            "Causa tipica: CPU/IO saturados, locks, disco lento ou banco grande demais.",
            "Risco: telas demoram, timeouts e sensacao de software 'travando'.",
        ]
        if db.get("top_tables"):
            top = db["top_tables"][:3]
            reasons.append(
                "Maiores tabelas agora: "
                + ", ".join(f"{t.get('table')} ({t.get('size_gb')} GB)" for t in top),
            )
        alerts.append(
            InfraAlert(
                fingerprint=f"infra|db_latency|{severity}",
                severity=severity,
                title=f"[Infra] Desempenho do banco degradado ({latency} ms)",
                description="\n".join(reasons),
                reasons=reasons,
                metrics={"query_latency_ms": latency, "top_tables": db.get("top_tables") or []},
            ),
        )

    if db.get("status") == "fail":
        reasons = [
            f"Falha ao consultar o banco: {db.get('error') or 'erro desconhecido'}.",
            "O health check tambem deve falhar — sistema pode estar indisponivel.",
        ]
        alerts.append(
            InfraAlert(
                fingerprint="infra|db_down|critical",
                severity="critical",
                title="[Infra] Banco de dados inacessivel",
                description="\n".join(reasons),
                reasons=reasons,
                metrics={"error": db.get("error")},
            ),
        )

    # --- Redis latency ---
    redis_ms = redis.get("ping_ms")
    if isinstance(redis_ms, (int, float)) and redis_ms >= redis_warn_ms:
        severity = "critical" if redis_ms >= redis_crit_ms else "warning"
        reasons = [
            f"Latencia do Redis/cache = {redis_ms} ms (limite {redis_warn_ms} ms).",
            "Afeta Celery, rate limits, sessoes e caches — pode deixar o sistema lento.",
        ]
        alerts.append(
            InfraAlert(
                fingerprint=f"infra|redis_latency|{severity}",
                severity=severity,
                title=f"[Infra] Redis lento ({redis_ms} ms)",
                description="\n".join(reasons),
                reasons=reasons,
                metrics={"ping_ms": redis_ms},
            ),
        )

    if redis.get("status") == "fail":
        reasons = [
            f"Redis/cache indisponivel: {redis.get('error') or 'erro desconhecido'}.",
            "Filas Celery e caches podem parar; notificacoes e jobs atrasam.",
        ]
        alerts.append(
            InfraAlert(
                fingerprint="infra|redis_down|critical",
                severity="critical",
                title="[Infra] Redis inacessivel",
                description="\n".join(reasons),
                reasons=reasons,
                metrics={"error": redis.get("error")},
            ),
        )

    return alerts


def upsert_system_problem_report(alert: InfraAlert, *, snapshot: dict[str, Any]) -> tuple[ProblemReport, bool]:
    """Cria ou atualiza ProblemReport aberto com o mesmo fingerprint (dedupe)."""
    context = {
        "system_alert": True,
        "severity": alert.severity,
        "fingerprint": alert.fingerprint,
        "reasons": alert.reasons,
        "metrics": alert.metrics,
        "snapshot": snapshot,
        "kind": "infrastructure",
    }
    existing = (
        ProblemReport.objects.filter(
            source=SOURCE_SYSTEM,
            fingerprint=alert.fingerprint,
            status__in=OPEN_STATUSES,
        )
        .order_by("-updated_at")
        .first()
    )
    if existing:
        existing.title = alert.title[:200]
        existing.description = alert.description
        existing.context_json = context
        existing.save(update_fields=["title", "description", "context_json", "updated_at"])
        return existing, False

    report = ProblemReport.objects.create(
        user=None,
        workspace=None,
        title=alert.title[:200],
        description=alert.description,
        steps="Gerado automaticamente pelo monitor de infraestrutura (Celery).",
        source=SOURCE_SYSTEM,
        status=ProblemReport.Status.NOVO,
        url="",
        correlation_id=new_correlation_id(),
        fingerprint=alert.fingerprint[:255],
        context_json=context,
    )
    return report, True


def resolve_stale_system_alerts(active_fingerprints: set[str]) -> int:
    """Resolve alertas de infra abertos que ja nao disparam mais."""
    qs = ProblemReport.objects.filter(
        source=SOURCE_SYSTEM,
        status__in=OPEN_STATUSES,
        fingerprint__startswith="infra|",
    ).exclude(fingerprint="")
    resolved = 0
    now_note = timezone.now().isoformat().replace("+00:00", "Z")
    for report in qs:
        if report.fingerprint in active_fingerprints:
            continue
        # Se so o severity mudou (warning↔critical), o fingerprint muda —
        # resolve o antigo quando o parativo correspondente nao esta ativo.
        base = "|".join(report.fingerprint.split("|")[:2])  # infra|db_size
        still_active = any(fp.startswith(base + "|") for fp in active_fingerprints)
        if still_active:
            continue
        note = (report.internal_notes or "").strip()
        suffix = f"[{now_note}] Auto-resolvido: metrica voltou ao normal."
        report.status = ProblemReport.Status.RESOLVIDO
        report.internal_notes = f"{note}\n{suffix}".strip() if note else suffix
        report.save(update_fields=["status", "internal_notes", "updated_at"])
        resolved += 1
    return resolved


def run_infrastructure_health_check() -> dict[str, Any]:
    if not getattr(settings, "INFRA_ALERTS_ENABLED", True):
        return {"skipped": True, "reason": "INFRA_ALERTS_ENABLED=false"}

    snapshot = collect_infrastructure_snapshot()
    alerts = evaluate_infrastructure_alerts(snapshot)
    created = 0
    updated = 0
    for alert in alerts:
        _, is_new = upsert_system_problem_report(alert, snapshot=snapshot)
        if is_new:
            created += 1
        else:
            updated += 1
    resolved = resolve_stale_system_alerts({a.fingerprint for a in alerts})
    result = {
        "alerts": len(alerts),
        "created": created,
        "updated": updated,
        "resolved": resolved,
        "snapshot_summary": {
            "db_size_gb": (snapshot.get("database") or {}).get("size_gb"),
            "db_latency_ms": (snapshot.get("database") or {}).get("query_latency_ms"),
            "disk_used_pct": (snapshot.get("disk") or {}).get("used_pct"),
            "redis_ping_ms": (snapshot.get("redis") or {}).get("ping_ms"),
        },
    }
    logger.info("infra.health_check result=%s", result)
    return result


def open_system_alerts_count() -> int:
    return ProblemReport.objects.filter(
        source=SOURCE_SYSTEM,
        status__in=OPEN_STATUSES,
        fingerprint__startswith="infra|",
    ).count()


# Keep dataclass export helper for tests
def alert_to_dict(alert: InfraAlert) -> dict[str, Any]:
    return asdict(alert)
