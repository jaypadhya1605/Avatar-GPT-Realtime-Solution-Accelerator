import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from uuid import uuid4

from azure.identity import DefaultAzureCredential
from azure.monitor.opentelemetry import configure_azure_monitor
from fastapi import Depends, FastAPI, HTTPException, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from .evaluator import evaluate
from .models import (
    EvaluationRequest,
    EvaluationResponse,
    PublicConfig,
    SanitizedResultRequest,
    SanitizedResultResponse,
)
from .persistence import save_sanitized_result
from .rag import get_default_corpus
from .realtime import VoiceSessionBroker
from .scenarios import public_scenarios
from .settings import get_settings
from .visitors import (
    VisitorIdentity,
    identify_visitor,
    identify_websocket_visitor,
)
from .voice_live import (
    MAX_CONTROL_MESSAGE_BYTES,
    VoiceLiveBridge,
    VoiceLiveProtocolError,
    VoiceLiveStart,
)

settings = get_settings()
telemetry_credential = None
if settings.applicationinsights_connection_string:
    telemetry_credential = DefaultAzureCredential(
        exclude_interactive_browser_credential=True,
        exclude_shared_token_cache_credential=True,
    )
    configure_azure_monitor(
        connection_string=settings.applicationinsights_connection_string,
        credential=telemetry_credential,
    )

voice_session_broker = VoiceSessionBroker()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await voice_session_broker.close()
    if telemetry_credential:
        telemetry_credential.close()


app = FastAPI(
    title="Avatar GPT Realtime Solution Accelerator",
    version="2.0.0",
    docs_url="/api/docs" if settings.app_env == "local" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Correlation-ID"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = (
        "microphone=(self), camera=(), geolocation=()"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'sha256-HNjOU2rt1GsFc5zDEQXklLEbjDyKexAo5wKONo5tkTc='; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "font-src 'self'; media-src 'self' blob:; connect-src 'self'; "
        "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
    )
    return response


@app.get("/healthz", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
async def readiness() -> dict[str, str]:
    if settings.app_mode == "azure" and not settings.azure_voice_live_endpoint:
        raise HTTPException(
            status_code=503, detail="Required Azure configuration is incomplete."
        )
    if (
        settings.app_mode == "azure"
        and settings.azure_custom_photo_avatar_enabled
        and any(
            not character.strip()
            for character in settings.custom_photo_avatar_characters.values()
        )
    ):
        raise HTTPException(
            status_code=503, detail="Required Azure configuration is incomplete."
        )
    try:
        get_default_corpus()
    except (OSError, ValueError):
        raise HTTPException(
            status_code=503, detail="Reference corpus is unavailable."
        ) from None
    return {"status": "ready"}


@app.get("/api/config", response_model=PublicConfig)
async def public_config(
    _: VisitorIdentity = Depends(identify_visitor),
) -> PublicConfig:
    return PublicConfig(
        mode=settings.app_mode,
        buildLabel=settings.build_label,
        sessionMaxMinutes=settings.session_max_minutes,
    )


@app.get("/api/scenarios")
async def scenarios(_: VisitorIdentity = Depends(identify_visitor)) -> list[dict]:
    return public_scenarios()


@app.post("/api/evaluations", response_model=EvaluationResponse)
async def evaluations(
    request: EvaluationRequest,
    _: VisitorIdentity = Depends(identify_visitor),
) -> EvaluationResponse:
    return evaluate(request)


@app.post("/api/voice-live/reset", status_code=204)
async def reset_voice_session(
    visitor: VisitorIdentity = Depends(identify_visitor),
) -> Response:
    user_key = f"{visitor.namespace}:{visitor.subject}"
    await voice_session_broker.limiter.release_active(user_key)
    return Response(status_code=204)


@app.websocket("/api/voice-live")
async def voice_live_session(websocket: WebSocket) -> None:
    if websocket.headers.get("origin", "") not in settings.origin_list:
        await websocket.close(code=1008, reason="Origin is not allowed.")
        return
    visitor = identify_websocket_visitor(websocket)
    if visitor is None:
        await websocket.close(code=1008, reason="Browser session cookie is required.")
        return
    if settings.app_mode != "azure" or not settings.azure_voice_live_endpoint:
        await websocket.close(code=1013, reason="Azure Voice Live is unavailable.")
        return

    await websocket.accept()
    session_id = ""
    user_key = f"{visitor.namespace}:{visitor.subject}"
    reserved = False
    try:
        message = await asyncio.wait_for(websocket.receive(), timeout=10)
        text = message.get("text")
        if (
            message["type"] != "websocket.receive"
            or not isinstance(text, str)
            or len(text) > MAX_CONTROL_MESSAGE_BYTES
        ):
            raise VoiceLiveProtocolError("A valid start message is required.")
        request = VoiceLiveStart.model_validate_json(text)

        session_id = str(uuid4())
        network_key = f"network:{visitor.network_subject or visitor.subject}"
        await voice_session_broker.limiter.reserve(
            user_key,
            network_key,
            session_id,
            settings.session_max_minutes,
        )
        reserved = True
        bridge = VoiceLiveBridge(
            websocket,
            voice_session_broker.credential,
            settings,
            session_id,
        )
        await bridge.run(request)
    except HTTPException as exc:
        with suppress(Exception):
            await websocket.send_json({"type": "session_error", "error": exc.detail})
    except (TimeoutError, ValidationError, VoiceLiveProtocolError):
        with suppress(Exception):
            await websocket.send_json(
                {"type": "session_error", "error": "Invalid voice session request."}
            )
    except Exception:
        with suppress(Exception):
            await websocket.send_json(
                {"type": "session_error", "error": "Voice session unavailable."}
            )
    finally:
        if reserved:
            await voice_session_broker.limiter.release(user_key, session_id)
        with suppress(Exception):
            await websocket.close(code=1000)


@app.post("/api/session-results", response_model=SanitizedResultResponse)
async def save_result(
    request: SanitizedResultRequest,
    visitor: VisitorIdentity = Depends(identify_visitor),
) -> SanitizedResultResponse:
    return await save_sanitized_result(request, visitor, settings)


frontend_dist: Path = settings.frontend_dist_path
if not frontend_dist.is_absolute():
    frontend_dist = Path(__file__).resolve().parent.parent / frontend_dist
frontend_dist = frontend_dist.resolve()
if frontend_dist.exists():
    assets = frontend_dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str):
        requested = frontend_dist / path
        if (
            path
            and requested.is_file()
            and frontend_dist in requested.resolve().parents
        ):
            return FileResponse(requested)
        index = frontend_dist / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(status_code=404)
