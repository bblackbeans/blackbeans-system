FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY blackbeans-mcp /app

RUN uv sync

EXPOSE 8100

CMD ["uv", "run", "blackbeans-mcp", "--http", "--host", "0.0.0.0", "--port", "8100"]
