# syntax=docker/dockerfile:1.7
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY pyproject.toml /app/
RUN pip install --no-cache-dir hatchling \
 && pip install --no-cache-dir \
      fastapi uvicorn[standard] httpx pydantic python-json-logger

COPY src /app/src

EXPOSE 8091
CMD ["python","-m","ai_hub.main"]
