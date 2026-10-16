ARG PYTHON_IMAGE=python:3.13-slim-bookworm
FROM ${PYTHON_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements-models.txt ./
RUN pip install --no-cache-dir -r requirements.txt
ARG INSTALL_AI_RUNTIMES=0
RUN if [ "$INSTALL_AI_RUNTIMES" = "1" ]; then pip install --no-cache-dir -r requirements-models.txt; fi
COPY app ./app
COPY voices.json ./voices.json
RUN useradd --uid 10001 --create-home worker && mkdir -p /models /tmp/audio && chown worker:worker /models /tmp/audio
USER worker
CMD ["python", "-m", "app.run"]
