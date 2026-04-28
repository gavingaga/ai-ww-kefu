# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY pyproject.toml /app/
RUN pip install --no-cache-dir hatchling \
 && pip install --no-cache-dir \
      fastapi uvicorn[standard] httpx pydantic pydantic-settings python-json-logger

COPY src /app/src

EXPOSE 8090
CMD ["python","-m","llm_router.main"]
