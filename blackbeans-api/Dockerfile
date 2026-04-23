FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app

RUN apt-get update && apt-get install --no-install-recommends -y \
  build-essential \
  libpq-dev \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --locked --no-install-project --no-dev

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --locked --no-dev

FROM python:3.14-slim-bookworm AS runner

WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH"
ENV DJANGO_SETTINGS_MODULE="config.settings.production"
ENV PYTHONUNBUFFERED=1
ENV HOME="/tmp"
ENV XDG_CACHE_HOME="/tmp/.cache"

RUN apt-get update && apt-get install --no-install-recommends -y \
  libpq-dev \
  gettext \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system django && adduser --system --ingroup django django
COPY --from=builder --chown=django:django /app /app
RUN mkdir -p /app/staticfiles /app/blackbeans_api/media \
  && chown -R django:django /app
USER django

EXPOSE 5000
CMD ["sh", "-c", "python manage.py collectstatic --noinput && gunicorn config.wsgi --bind 0.0.0.0:5000 --chdir=/app"]
