import asyncio
import logging
from types import SimpleNamespace

import pytest
from azure.ai.voicelive.models import ServerEventType
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import main as main_module
from app import voice_live as voice_live_module
from app.settings import Settings
from app.voice_live import VOICE_PROFILES, VoiceLiveStart, build_voice_live_session


class FakeLimiter:
    def __init__(self) -> None:
        self.reservations: list[tuple] = []
        self.releases: list[tuple] = []

    async def reserve(self, *args) -> None:
        self.reservations.append(args)

    async def release(self, *args) -> None:
        self.releases.append(args)


class FakeVoiceLiveConnection:
    def __init__(self) -> None:
        self.events: asyncio.Queue = asyncio.Queue()
        self.session_updates = []
        self.audio_chunks: list[bytes] = []
        self.sent_events = []
        self.response_creates = 0
        self.response_cancels = 0
        self.session = SimpleNamespace(update=self.update_session)
        self.input_audio_buffer = SimpleNamespace(append=self.append_audio)
        self.response = SimpleNamespace(
            create=self.create_response,
            cancel=self.cancel_response,
        )
        session = SimpleNamespace(
            id="azure-session",
            avatar=SimpleNamespace(
                ice_servers=[
                    SimpleNamespace(
                        urls=["turn:relay.example.test:3478"],
                        username="avatar-user",
                        credential="avatar-credential",
                    )
                ]
            ),
        )
        self.events.put_nowait(
            SimpleNamespace(type=ServerEventType.SESSION_UPDATED, session=session)
        )

    async def update_session(self, *, session) -> None:
        self.session_updates.append(session)

    async def append_audio(self, *, audio: bytes) -> None:
        self.audio_chunks.append(audio)

    async def send(self, event) -> None:
        self.sent_events.append(event)
        self.events.put_nowait(
            SimpleNamespace(
                type=ServerEventType.SESSION_AVATAR_CONNECTING,
                server_sdp="encoded-server-sdp",
            )
        )

    async def create_response(self) -> None:
        self.response_creates += 1
        self.events.put_nowait(
            SimpleNamespace(
                type=ServerEventType.RESPONSE_AUDIO_DELTA,
                delta=b"\x01\x02\x03\x04",
                item_id="assistant-one",
                response_id="response-one",
            )
        )
        self.events.put_nowait(
            SimpleNamespace(
                type=ServerEventType.RESPONSE_ANIMATION_VISEME_DELTA,
                viseme_id=20,
                audio_offset_ms=455,
                response_id="response-one",
            )
        )
        self.events.put_nowait(
            SimpleNamespace(
                type=ServerEventType.RESPONSE_AUDIO_TRANSCRIPT_DELTA,
                delta="Hello",
                item_id="assistant-one",
                response_id="response-one",
            )
        )

    async def cancel_response(self) -> None:
        self.response_cancels += 1

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await self.events.get()


class FakeConnectionContext:
    def __init__(self, connection: FakeVoiceLiveConnection) -> None:
        self.connection = connection
        self.closed = False

    async def __aenter__(self) -> FakeVoiceLiveConnection:
        return self.connection

    async def __aexit__(self, *_args) -> None:
        self.closed = True


def test_voice_live_session_uses_ga_audio_visemes_with_subdued_prosody() -> None:
    request = VoiceLiveStart(
        type="start_session",
        scenarioId="SCN-003",
        scenarioVersion="1.0",
        difficulty="hard",
    )

    session = build_voice_live_session(request, Settings())
    payload = session.as_dict()

    assert "avatar" not in payload
    assert payload["animation"] == {"outputs": ["viseme_id"]}
    assert payload["voice"] == {
        "type": "azure-standard",
        "name": VOICE_PROFILES["SCN-003"].voice,
        "style": "sad",
        "pitch": "-5%",
        "rate": "0.85",
        "volume": "-3dB",
    }
    assert payload["input_audio_transcription"] == {
        "model": "azure-speech",
        "language": "en-US",
    }
    assert payload["turn_detection"]["create_response"] is True
    assert payload["turn_detection"]["interrupt_response"] is True
    assert "end_of_utterance_detection" not in payload["turn_detection"]
    assert "REF-SCN003-" in payload["instructions"]
    assert "REF-SCN001-" not in payload["instructions"]


def test_each_scenario_has_a_distinct_patient_voice() -> None:
    assert set(VOICE_PROFILES) == {"SCN-001", "SCN-002", "SCN-003"}
    assert len({profile.voice for profile in VOICE_PROFILES.values()}) == 3


@pytest.mark.parametrize(
    ("scenario_id", "character"),
    [
        ("SCN-001", "AvatarGptPatient01V1"),
        ("SCN-002", "AvatarGptPatient02V1"),
        ("SCN-003", "AvatarGptPatient03V1"),
    ],
)
def test_voice_live_session_uses_scenario_photo_avatar_when_enabled(
    scenario_id: str,
    character: str,
) -> None:
    request = VoiceLiveStart(
        type="start_session",
        scenarioId=scenario_id,
        scenarioVersion="1.0",
        difficulty="medium",
    )
    settings = Settings(
        azure_custom_photo_avatar_enabled=True,
        azure_custom_photo_avatar_character_scn_001="AvatarGptPatient01V1",
        azure_custom_photo_avatar_character_scn_002="AvatarGptPatient02V1",
        azure_custom_photo_avatar_character_scn_003="AvatarGptPatient03V1",
    )

    payload = build_voice_live_session(request, settings).as_dict()

    assert "animation" not in payload
    assert payload["avatar"] == {
        "type": "photo-avatar",
        "character": character,
        "model": "vasa-1",
        "customized": True,
        "output_protocol": "webrtc",
        "output_audit_audio": False,
        "video": {
            "codec": "h264",
            "resolution": {"width": 512, "height": 512},
        },
    }
    assert payload["voice"]["name"] == VOICE_PROFILES[scenario_id].voice


def test_voice_live_websocket_relays_pcm_and_releases_lease(monkeypatch) -> None:
    connection = FakeVoiceLiveConnection()
    context = FakeConnectionContext(connection)
    connect_calls = []

    def fake_connect(**kwargs):
        connect_calls.append(kwargs)
        return context

    limiter = FakeLimiter()
    monkeypatch.setattr(voice_live_module, "connect", fake_connect)
    monkeypatch.setattr(main_module.voice_session_broker, "limiter", limiter)
    monkeypatch.setattr(main_module.settings, "app_mode", "azure")
    monkeypatch.setattr(
        main_module.settings,
        "azure_voice_live_endpoint",
        "https://voice.example.test",
    )
    monkeypatch.setattr(main_module.settings, "allowed_origins", "http://testserver")

    browser = TestClient(main_module.app)
    browser.get("/api/config")
    with browser.websocket_connect(
        "/api/voice-live", headers={"origin": "http://testserver"}
    ) as websocket:
        websocket.send_json(
            {
                "type": "start_session",
                "scenarioId": "SCN-001",
                "scenarioVersion": "1.0",
                "difficulty": "medium",
            }
        )

        assert websocket.receive_json() == {
            "type": "session_started",
            "sessionId": "azure-session",
            "model": "gpt-realtime-1.5",
            "transcriptionModel": "azure-speech",
            "grounding": {
                "mode": "synthetic-local",
                "datasetId": "avatar-gpt-realtime-synthetic-v1",
                "queryBasis": "scenario",
                "sources": [
                    {
                        "id": "REF-SCN001-001",
                        "title": "Naming fear before explaining next steps",
                    },
                    {
                        "id": "REF-SCN001-002",
                        "title": "Generic reassurance leaves the concern unanswered",
                    },
                    {
                        "id": "REF-SCN001-003",
                        "title": "Repairing prognosis and palliative jargon",
                    },
                ],
            },
        }
        websocket.send_bytes(b"\x00\x01" * 480)
        websocket.send_json({"type": "client_ready"})
        assert websocket.receive_bytes() == b"\x01\x02\x03\x04"
        assert websocket.receive_json() == {
            "type": "viseme",
            "visemeId": 20,
            "audioOffsetMs": 455,
            "responseId": "response-one",
        }
        assert websocket.receive_json() == {
            "type": "transcript_delta",
            "role": "assistant",
            "delta": "Hello",
            "itemId": "assistant-one",
            "responseId": "response-one",
        }
        websocket.send_json({"type": "interrupt"})
        websocket.send_json({"type": "stop_session"})
        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()

    assert connect_calls[0]["endpoint"] == "https://voice.example.test"
    assert connect_calls[0]["model"] == "gpt-realtime-1.5"
    assert len(connection.session_updates) == 1
    assert connection.sent_events == []
    assert connection.audio_chunks == [b"\x00\x01" * 480]
    assert connection.response_creates == 1
    assert connection.response_cancels == 1
    assert context.closed is True
    assert len(limiter.reservations) == 1
    assert limiter.releases == [
        (limiter.reservations[0][0], limiter.reservations[0][2])
    ]


def test_custom_photo_avatar_relays_ice_and_sdp_without_duplicate_pcm(
    monkeypatch,
) -> None:
    connection = FakeVoiceLiveConnection()
    context = FakeConnectionContext(connection)

    monkeypatch.setattr(voice_live_module, "connect", lambda **_kwargs: context)
    monkeypatch.setattr(main_module.settings, "app_mode", "azure")
    monkeypatch.setattr(main_module.settings, "allowed_origins", "http://testserver")
    monkeypatch.setattr(
        main_module.settings,
        "azure_voice_live_endpoint",
        "https://voice.example.test",
    )
    monkeypatch.setattr(
        main_module.settings,
        "azure_custom_photo_avatar_enabled",
        True,
    )
    monkeypatch.setattr(
        main_module.settings,
        "azure_custom_photo_avatar_character_scn_001",
        "AvatarGptPatient01V1",
    )

    browser = TestClient(main_module.app)
    browser.get("/api/config")
    with browser.websocket_connect(
        "/api/voice-live", headers={"origin": "http://testserver"}
    ) as websocket:
        websocket.send_json(
            {
                "type": "start_session",
                "scenarioId": "SCN-001",
                "scenarioVersion": "1.0",
                "difficulty": "medium",
            }
        )

        started = websocket.receive_json()
        assert started["avatar"] == {
            "enabled": True,
            "iceServers": [
                {
                    "urls": ["turn:relay.example.test:3478"],
                    "username": "avatar-user",
                    "credential": "avatar-credential",
                }
            ],
        }
        websocket.send_json(
            {"type": "avatar_connect", "clientSdp": "encoded-client-sdp"}
        )
        assert websocket.receive_json() == {
            "type": "avatar_answer",
            "serverSdp": "encoded-server-sdp",
        }
        websocket.send_json({"type": "client_ready"})
        assert websocket.receive_json() == {
            "type": "transcript_delta",
            "role": "assistant",
            "delta": "Hello",
            "itemId": "assistant-one",
            "responseId": "response-one",
        }
        websocket.send_json({"type": "stop_session"})

    assert [event.as_dict() for event in connection.sent_events] == [
        {
            "type": "session.avatar.connect",
            "client_sdp": "encoded-client-sdp",
        }
    ]
    assert context.closed is True


def test_voice_live_service_error_logs_only_allowlisted_metadata(caplog) -> None:
    class FakeWebSocket:
        def __init__(self) -> None:
            self.messages = []

        async def send_json(self, message) -> None:
            self.messages.append(message)

    async def service_events():
        yield SimpleNamespace(
            type=ServerEventType.ERROR,
            event_id="server-event",
            error=SimpleNamespace(
                type="invalid_request_error",
                code="invalid_avatar_sdp",
                message="The avatar SDP offer is not base64 encoded.",
                param="client_sdp",
                event_id="client-event",
                client_sdp="v=0 private-sdp",
                credential="private-turn-credential",
            ),
        )

    websocket = FakeWebSocket()
    bridge = voice_live_module.VoiceLiveBridge(
        websocket,
        credential=None,
        settings=Settings(),
        session_id="local-session",
    )

    with caplog.at_level(logging.WARNING, logger=voice_live_module.__name__):
        asyncio.run(bridge._relay_service(service_events()))

    assert websocket.messages == [
        {
            "type": "session_error",
            "error": "The Azure voice session reported an error.",
        }
    ]
    assert '"error_type": "invalid_request_error"' in caplog.text
    assert '"error_code": "invalid_avatar_sdp"' in caplog.text
    assert '"error_param": "client_sdp"' in caplog.text
    assert "not base64 encoded" in caplog.text
    assert "private-sdp" not in caplog.text
    assert "private-turn-credential" not in caplog.text
