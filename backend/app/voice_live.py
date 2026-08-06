import asyncio
import json
import logging
from contextlib import suppress
from dataclasses import dataclass
from typing import Any, Literal

from azure.ai.voicelive.aio import connect
from azure.ai.voicelive.models import (
    Animation,
    AnimationOutputType,
    AudioEchoCancellation,
    AudioInputTranscriptionOptions,
    AudioNoiseReduction,
    AvatarConfig,
    AvatarConfigTypes,
    AvatarOutputProtocol,
    AzureSemanticVad,
    ClientEventSessionAvatarConnect,
    InputAudioFormat,
    Modality,
    OpenAIVoice,
    OutputAudioFormat,
    RequestSession,
    ServerEventType,
    VideoParams,
    VideoResolution,
)
from fastapi import WebSocket

from .models import StrictModel
from .rag import GroundingBundle, retrieve_scenario_grounding
from .realtime import build_prompt
from .scenarios import SCENARIOS
from .settings import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VoiceProfile:
    voice: str


# gpt-realtime voices expose only a name; all expressive direction lives in the prompt.
VOICE_PROFILES = {
    "SCN-001": VoiceProfile(voice="echo"),
    "SCN-002": VoiceProfile(voice="shimmer"),
    "SCN-003": VoiceProfile(voice="ballad"),
}

MAX_AUDIO_CHUNK_BYTES = 48_000
MAX_RESPONSE_AUDIO_CHUNK_BYTES = 256_000
MAX_CONTROL_MESSAGE_BYTES = 128_000
MAX_SERVICE_ERROR_MESSAGE_CHARS = 512


class VoiceLiveStart(StrictModel):
    type: Literal["start_session"]
    scenarioId: Literal["SCN-001", "SCN-002", "SCN-003"]
    scenarioVersion: Literal["1.0"]
    difficulty: Literal["easy", "medium", "hard"]


class ClientReady(StrictModel):
    type: Literal["client_ready"]


class Interrupt(StrictModel):
    type: Literal["interrupt"]


class StopSession(StrictModel):
    type: Literal["stop_session"]


class AvatarConnect(StrictModel):
    type: Literal["avatar_connect"]
    clientSdp: str


class VoiceLiveProtocolError(ValueError):
    pass


def service_error_diagnostics(event: Any) -> dict[str, str]:
    error = getattr(event, "error", None)

    def bounded(value: Any, maximum: int) -> str:
        if not isinstance(value, str):
            return ""
        return " ".join(value.split())[:maximum]

    return {
        "error_type": bounded(getattr(error, "type", None), 120),
        "error_code": bounded(getattr(error, "code", None), 120),
        "error_message": bounded(
            getattr(error, "message", None), MAX_SERVICE_ERROR_MESSAGE_CHARS
        ),
        "error_param": bounded(getattr(error, "param", None), 120),
        "event_id": bounded(
            getattr(error, "event_id", None) or getattr(event, "event_id", None),
            160,
        ),
    }


def build_voice_live_session(
    request: VoiceLiveStart,
    settings: Settings,
    grounding: GroundingBundle | None = None,
) -> RequestSession:
    profile = VOICE_PROFILES[request.scenarioId]
    avatar = None
    if settings.azure_custom_photo_avatar_enabled:
        character = settings.custom_photo_avatar_characters[request.scenarioId].strip()
        if not character:
            raise VoiceLiveProtocolError(
                "Custom photo avatar is enabled without a scenario character name."
            )
        avatar = AvatarConfig(
            avatar_type=AvatarConfigTypes.PHOTO_AVATAR,
            character=character,
            model=settings.azure_custom_photo_avatar_model,
            customized=True,
            output_protocol=AvatarOutputProtocol.WEBRTC,
            output_audit_audio=False,
            video=VideoParams(
                codec="h264",
                resolution=VideoResolution(width=512, height=512),
            ),
        )
    turn_detection = AzureSemanticVad(
        prefix_padding_ms=300,
        silence_duration_ms=500,
        speech_duration_ms=80,
        remove_filler_words=True,
        auto_truncate=True,
        create_response=True,
        interrupt_response=True,
    )
    output_config: dict[str, Any]
    if avatar:
        output_config = {"avatar": avatar}
    else:
        output_config = {
            "animation": Animation(outputs=[AnimationOutputType.VISEME_ID])
        }
    return RequestSession(
        modalities=[Modality.TEXT, Modality.AUDIO],
        instructions=build_prompt(request, grounding),
        **output_config,
        voice=OpenAIVoice(name=profile.voice),
        input_audio_format=InputAudioFormat.PCM16,
        output_audio_format=OutputAudioFormat.PCM16,
        input_audio_transcription=AudioInputTranscriptionOptions(
            model=settings.azure_voice_live_transcription_model,
            language="en-US",
        ),
        turn_detection=turn_detection,
        input_audio_noise_reduction=AudioNoiseReduction(
            type="azure_deep_noise_suppression"
        ),
        input_audio_echo_cancellation=AudioEchoCancellation(
            type="server_echo_cancellation"
        ),
        temperature=0.8,
    )


class VoiceLiveBridge:
    def __init__(
        self,
        websocket: WebSocket,
        credential: Any,
        settings: Settings,
        session_id: str,
    ) -> None:
        self.websocket = websocket
        self.credential = credential
        self.settings = settings
        self.session_id = session_id
        self._opening_sent = False
        self._grounding: GroundingBundle | None = None

    async def run(self, request: VoiceLiveStart) -> None:
        self._grounding = retrieve_scenario_grounding(
            request.scenarioId,
            SCENARIOS[request.scenarioId],
            request.difficulty,
        )
        async with asyncio.timeout(self.settings.session_max_minutes * 60):
            async with connect(
                credential=self.credential,
                endpoint=self.settings.azure_voice_live_endpoint,
                model=self.settings.azure_voice_live_model,
            ) as connection:
                await connection.session.update(
                    session=build_voice_live_session(
                        request,
                        self.settings,
                        self._grounding,
                    )
                )
                await self._pump(connection)

    async def _pump(self, connection: Any) -> None:
        tasks = {
            asyncio.create_task(self._receive_browser(connection)),
            asyncio.create_task(self._relay_service(connection)),
        }
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for task in done:
            task.result()

    async def _receive_browser(self, connection: Any) -> None:
        while True:
            message = await self.websocket.receive()
            if message["type"] == "websocket.disconnect":
                return

            audio = message.get("bytes")
            if audio is not None:
                if not audio or len(audio) > MAX_AUDIO_CHUNK_BYTES:
                    raise VoiceLiveProtocolError("Invalid microphone audio chunk.")
                await connection.input_audio_buffer.append(audio=audio)
                continue

            text = message.get("text")
            if not isinstance(text, str) or len(text) > MAX_CONTROL_MESSAGE_BYTES:
                raise VoiceLiveProtocolError("Invalid control message.")
            await self._handle_control(connection, text)
            if json.loads(text).get("type") == "stop_session":
                return

    async def _handle_control(self, connection: Any, text: str) -> None:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise VoiceLiveProtocolError("Invalid control message.") from exc
        if not isinstance(payload, dict):
            raise VoiceLiveProtocolError("Invalid control message.")

        message_type = payload.get("type")
        if message_type == "client_ready":
            ClientReady.model_validate(payload)
            if not self._opening_sent:
                self._opening_sent = True
                await connection.response.create()
        elif message_type == "interrupt":
            Interrupt.model_validate(payload)
            with suppress(Exception):
                await connection.response.cancel()
        elif message_type == "avatar_connect":
            if not self.settings.azure_custom_photo_avatar_enabled:
                raise VoiceLiveProtocolError("Avatar signaling is not enabled.")
            message = AvatarConnect.model_validate(payload)
            if not message.clientSdp or len(message.clientSdp) > 65_536:
                raise VoiceLiveProtocolError("Invalid avatar SDP offer.")
            await connection.send(
                ClientEventSessionAvatarConnect(client_sdp=message.clientSdp)
            )
        elif message_type == "stop_session":
            StopSession.model_validate(payload)
        else:
            raise VoiceLiveProtocolError("Unsupported control message.")

    async def _relay_service(self, connection: Any) -> None:
        async for event in connection:
            event_type = event.type
            if event_type == ServerEventType.SESSION_UPDATED:
                await self._relay_session_updated(event)
            elif event_type == ServerEventType.SESSION_AVATAR_CONNECTING:
                server_sdp = getattr(event, "server_sdp", "")
                if (
                    self.settings.azure_custom_photo_avatar_enabled
                    and isinstance(server_sdp, str)
                    and 0 < len(server_sdp) <= 65_536
                ):
                    await self.websocket.send_json(
                        {
                            "type": "avatar_answer",
                            "serverSdp": server_sdp,
                        }
                    )
            elif event_type == ServerEventType.RESPONSE_AUDIO_DELTA:
                delta = getattr(event, "delta", b"")
                if (
                    not self.settings.azure_custom_photo_avatar_enabled
                    and isinstance(delta, (bytes, bytearray))
                    and 0 < len(delta) <= MAX_RESPONSE_AUDIO_CHUNK_BYTES
                ):
                    await self.websocket.send_bytes(bytes(delta))
            elif event_type == ServerEventType.RESPONSE_ANIMATION_VISEME_DELTA:
                viseme_id = getattr(event, "viseme_id", -1)
                audio_offset_ms = getattr(event, "audio_offset_ms", -1)
                if (
                    not self.settings.azure_custom_photo_avatar_enabled
                    and isinstance(viseme_id, int)
                    and 0 <= viseme_id <= 21
                    and isinstance(audio_offset_ms, int)
                    and 0 <= audio_offset_ms <= 600_000
                ):
                    await self.websocket.send_json(
                        {
                            "type": "viseme",
                            "visemeId": viseme_id,
                            "audioOffsetMs": audio_offset_ms,
                            "responseId": getattr(event, "response_id", ""),
                        }
                    )
            elif (
                event_type
                == ServerEventType.CONVERSATION_ITEM_INPUT_AUDIO_TRANSCRIPTION_COMPLETED
            ):
                await self.websocket.send_json(
                    {
                        "type": "transcript_done",
                        "role": "user",
                        "transcript": getattr(event, "transcript", ""),
                        "itemId": getattr(event, "item_id", ""),
                    }
                )
            elif event_type == ServerEventType.RESPONSE_AUDIO_TRANSCRIPT_DELTA:
                await self.websocket.send_json(
                    {
                        "type": "transcript_delta",
                        "role": "assistant",
                        "delta": getattr(event, "delta", ""),
                        "itemId": getattr(event, "item_id", ""),
                        "responseId": getattr(event, "response_id", ""),
                    }
                )
            elif event_type == ServerEventType.RESPONSE_AUDIO_TRANSCRIPT_DONE:
                await self.websocket.send_json(
                    {
                        "type": "transcript_done",
                        "role": "assistant",
                        "transcript": getattr(event, "transcript", ""),
                        "itemId": getattr(event, "item_id", ""),
                        "responseId": getattr(event, "response_id", ""),
                    }
                )
            elif event_type == ServerEventType.INPUT_AUDIO_BUFFER_SPEECH_STARTED:
                await self.websocket.send_json(
                    {
                        "type": "speech_started",
                        "itemId": getattr(event, "item_id", ""),
                    }
                )
            elif event_type == ServerEventType.INPUT_AUDIO_BUFFER_SPEECH_STOPPED:
                await self.websocket.send_json(
                    {
                        "type": "speech_stopped",
                        "itemId": getattr(event, "item_id", ""),
                    }
                )
            elif event_type == ServerEventType.RESPONSE_DONE:
                response = getattr(event, "response", None)
                await self.websocket.send_json(
                    {
                        "type": "response_done",
                        "responseId": getattr(response, "id", ""),
                    }
                )
            elif event_type == ServerEventType.ERROR:
                logger.warning(
                    "Azure Voice Live service error %s",
                    json.dumps(
                        {
                            "session_id": self.session_id,
                            **service_error_diagnostics(event),
                        },
                        sort_keys=True,
                    ),
                )
                await self.websocket.send_json(
                    {
                        "type": "session_error",
                        "error": "The Azure voice session reported an error.",
                    }
                )
                return

    async def _relay_session_updated(self, event: Any) -> None:
        session = getattr(event, "session", None)
        service_session_id = getattr(session, "id", "") or self.session_id
        payload = {
            "type": "session_started",
            "sessionId": service_session_id,
            "model": self.settings.azure_voice_live_model,
            "transcriptionModel": self.settings.azure_voice_live_transcription_model,
            "grounding": (
                self._grounding.public_summary("scenario") if self._grounding else None
            ),
        }
        if self.settings.azure_custom_photo_avatar_enabled:
            payload["avatar"] = {
                "enabled": True,
                "iceServers": self._bounded_ice_servers(session),
            }
        await self.websocket.send_json(payload)

    @staticmethod
    def _bounded_ice_servers(session: Any) -> list[dict[str, Any]]:
        avatar = getattr(session, "avatar", None)
        servers = getattr(avatar, "ice_servers", None) or []
        bounded = []
        for server in servers[:8]:
            raw_urls = getattr(server, "urls", None) or []
            urls = [
                url
                for url in raw_urls[:8]
                if isinstance(url, str)
                and len(url) <= 2_048
                and url.startswith(("stun:", "stuns:", "turn:", "turns:"))
            ]
            if not urls:
                continue
            entry: dict[str, Any] = {"urls": urls}
            username = getattr(server, "username", None)
            credential = getattr(server, "credential", None)
            if isinstance(username, str) and len(username) <= 1_024:
                entry["username"] = username
            if isinstance(credential, str) and len(credential) <= 2_048:
                entry["credential"] = credential
            bounded.append(entry)
        return bounded
