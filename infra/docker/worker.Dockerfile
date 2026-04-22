FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY blackbeans-api /app

RUN uv sync --group dev
RUN mkdir -p /app/staticfiles

CMD ["uv", "run", "celery", "-A", "config.celery_app", "worker", "-l", "INFO"]
