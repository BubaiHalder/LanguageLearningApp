ARG OLLAMA_IMAGE=ollama/ollama:0.40.4
FROM ${OLLAMA_IMAGE}
# Model data is supplied through a persistent volume. Never pull a model on startup.
ENV OLLAMA_HOST=0.0.0.0:11434 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_NO_CLOUD=1
