import asyncio
from contextlib import asynccontextmanager
from functools import partial
import secrets
import threading
import time
import uuid
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest, CONTENT_TYPE_LATEST
import psutil
from .engines import Engines
from .schemas import Language, SpeechRequest, TutorRequest
from .settings import Settings


def create_app(settings: Settings | None = None, engines: Engines | None = None):
    settings = settings or Settings.load()
    owns_engines = engines is None
    engines = engines or Engines(settings)

    @asynccontextmanager
    async def lifespan(_app):
        if owns_engines:
            threading.Thread(target=engines.warm_up, daemon=True).start()
        yield

    app = FastAPI(title="Local Tutor AI", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    slots = asyncio.Semaphore(settings.concurrency)
    registry = CollectorRegistry()
    requests = Counter("ai_requests_total", "HTTP outcomes", ["status"], registry=registry)
    latency = Histogram("ai_request_seconds", "HTTP latency", registry=registry)
    active = Gauge("ai_active_jobs", "Running model jobs, including timed-out jobs", registry=registry)
    rss = Gauge("ai_process_rss_bytes", "Worker RSS", registry=registry)
    cpu = Gauge("ai_process_cpu_seconds", "Worker CPU time", registry=registry)
    pending = set()

    @app.middleware("http")
    async def boundary(request, call_next):
        request.state.request_id = str(uuid.uuid4())
        started = time.monotonic()
        public = request.method == "GET" and request.url.path == "/health/live"
        if not public and not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + settings.service_token):
            return JSONResponse({"error": {"code": "unauthorized", "message": "Service authentication required"}}, 401)
        if request.method == "POST":
            try:
                length = int(request.headers.get("content-length", "-1"))
            except ValueError:
                length = -1
            if length < 0:
                return JSONResponse({"error": {"code": "length_required", "message": "Content-Length required"}}, 411)
            if length > settings.max_upload + 16384:
                return JSONResponse({"error": {"code": "too_large", "message": "Request exceeds upload limit"}}, 413)
        try:
            response = await call_next(request)
            requests.labels(str(response.status_code)).inc()
            response.headers["X-Request-ID"] = request.state.request_id
            response.headers["Cache-Control"] = "no-store"
            return response
        finally:
            latency.observe(time.monotonic() - started)

    @app.exception_handler(HTTPException)
    async def http_error(request, error):
        return JSONResponse({"error": {"code": str(error.status_code), "message": str(error.detail)},
                             "requestId": request.state.request_id}, error.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, _error):
        return JSONResponse({"error": {"code": "validation", "message": "Invalid request fields"},
                             "requestId": request.state.request_id}, 422)

    @app.exception_handler(Exception)
    async def internal_error(request, _error):
        return JSONResponse({"error": {"code": "internal", "message": "Local AI processing failed"},
                             "requestId": request.state.request_id}, 500)

    async def run_job(function, *args):
        if slots.locked():
            raise HTTPException(429, "AI concurrency limit reached; retry later")
        await slots.acquire()
        active.inc()
        task = asyncio.create_task(asyncio.to_thread(partial(function, *args)))
        pending.add(task)

        def finished(job):
            pending.discard(job)
            if not job.cancelled():
                job.exception()  # consume errors after HTTP timeout/client cancellation
            slots.release()
            active.dec()

        task.add_done_callback(finished)
        try:
            # Shielding prevents a timed-out native thread from releasing its capacity early.
            return await asyncio.wait_for(asyncio.shield(task), settings.timeout)
        except TimeoutError:
            raise HTTPException(504, "AI job timed out; its capacity remains reserved until the worker stops") from None

    @app.get("/health/live")
    async def live():
        return {"status": "alive"}

    @app.get("/health/ready")
    async def ready():
        result = await asyncio.to_thread(engines.readiness)
        return JSONResponse(result, 200 if result["ready"] else 503)

    @app.get("/metrics")
    async def metrics():
        process = psutil.Process()
        rss.set(process.memory_info().rss)
        times = process.cpu_times()
        cpu.set(times.user + times.system)
        return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)

    @app.get("/v1/voices")
    async def voices():
        return {"mode": settings.mode, "voices": [
            {k: v[k] for k in ("id", "language", "gender", "label") if k in v} for v in engines.voices()]}

    @app.post("/v1/audio/transcriptions")
    async def transcribe(audio: UploadFile = File(), nativeLanguage: Language = Form(),
                         targetLanguage: Language = Form(), durationMs: int = Form(ge=300, le=settings.max_duration * 1000 + 1000)):
        data = await audio.read(settings.max_upload + 1)
        await audio.close()
        if not data or len(data) > settings.max_upload:
            raise HTTPException(413, "Audio is empty or exceeds the upload limit")
        suffix = None
        if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
            suffix = ".wav"
        elif data[4:8] == b"ftyp":
            suffix = ".m4a"
        elif data[:4] == b"OggS":
            suffix = ".ogg"
        if suffix is None:
            raise HTTPException(415, "Supported audio containers: WAV, M4A, OGG")
        return await run_job(engines.transcribe, data, suffix, nativeLanguage, targetLanguage)

    @app.post("/v1/tutor/respond")
    @app.post("/v1/corrections")
    async def respond(request: TutorRequest):
        result = await run_job(engines.tutor, request)
        return {**result, "feedbackDeferred": request.correctionMode == "end", "mode": settings.mode}

    @app.post("/v1/audio/speech")
    async def speech(request: SpeechRequest):
        audio = await run_job(engines.speech, request)
        return Response(audio, media_type="audio/wav", headers={"X-AI-Mode": settings.mode})

    return app
