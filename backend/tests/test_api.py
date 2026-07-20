from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app import main as main_module
from app.settings import Settings


client = TestClient(main_module.app)


def test_health_and_public_config_are_minimal() -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
    config = client.get("/api/config")
    assert config.status_code == 200
    assert config.json()["mode"] == "mock"
    assert set(config.json()) == {"mode", "buildLabel", "sessionMaxMinutes"}
    assert "azure_ai_endpoint" not in config.text
    assert "empathy_visitor=" in config.headers["set-cookie"]
    assert "HttpOnly" in config.headers["set-cookie"]
    assert "SameSite=strict" in config.headers["set-cookie"]


def test_azure_readiness_requires_voice_live_endpoint(monkeypatch) -> None:
    monkeypatch.setattr(main_module.settings, "app_mode", "azure")
    monkeypatch.setattr(main_module.settings, "azure_voice_live_endpoint", "")
    assert client.get("/readyz").status_code == 503

    monkeypatch.setattr(
        main_module.settings,
        "azure_voice_live_endpoint",
        "https://voice.example.test",
    )
    assert client.get("/readyz").json() == {"status": "ready"}


def test_custom_avatar_readiness_requires_all_scenario_characters(
    monkeypatch,
) -> None:
    monkeypatch.setattr(main_module.settings, "app_mode", "azure")
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
    monkeypatch.setattr(
        main_module.settings,
        "azure_custom_photo_avatar_character_scn_002",
        " ",
    )
    monkeypatch.setattr(
        main_module.settings,
        "azure_custom_photo_avatar_character_scn_003",
        "AvatarGptPatient03V1",
    )
    assert client.get("/readyz").status_code == 503

    monkeypatch.setattr(
        main_module.settings,
        "azure_custom_photo_avatar_character_scn_002",
        "AvatarGptPatient02V1",
    )
    assert client.get("/readyz").json() == {"status": "ready"}


def test_voice_live_settings_use_deployment_environment_names(monkeypatch) -> None:
    monkeypatch.setenv("AZURE_VOICELIVE_ENDPOINT", "https://voice.example.test")
    monkeypatch.setenv("AZURE_VOICELIVE_MODEL", "voice-live-model")
    monkeypatch.setenv("AZURE_VOICELIVE_TRANSCRIPTION_MODEL", "speech-model")
    monkeypatch.setenv("AZURE_CUSTOM_PHOTO_AVATAR_ENABLED", "true")
    monkeypatch.setenv(
        "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_001",
        "AvatarGptPatient01V1",
    )
    monkeypatch.setenv(
        "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_002",
        "AvatarGptPatient02V1",
    )
    monkeypatch.setenv(
        "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_003",
        "AvatarGptPatient03V1",
    )
    monkeypatch.setenv("AZURE_CUSTOM_PHOTO_AVATAR_MODEL", "vasa-1")
    monkeypatch.setenv("AZURE_CUSTOM_PHOTO_AVATAR_OUTPUT_PROTOCOL", "webrtc")

    settings = Settings(_env_file=None)

    assert settings.azure_voice_live_endpoint == "https://voice.example.test"
    assert settings.azure_voice_live_model == "voice-live-model"
    assert settings.azure_voice_live_transcription_model == "speech-model"
    assert settings.azure_custom_photo_avatar_enabled is True
    assert settings.custom_photo_avatar_characters == {
        "SCN-001": "AvatarGptPatient01V1",
        "SCN-002": "AvatarGptPatient02V1",
        "SCN-003": "AvatarGptPatient03V1",
    }
    assert settings.azure_custom_photo_avatar_model == "vasa-1"
    assert settings.azure_custom_photo_avatar_output_protocol == "webrtc"


def test_scenarios_exclude_hidden_behavior() -> None:
    response = client.get("/api/scenarios")
    assert response.status_code == 200
    assert [item["persona"] for item in response.json()] == [
        "Persona 1",
        "Persona 3",
        "Persona 4",
    ]
    assert all(
        "opening" not in item and "concerns" not in item for item in response.json()
    )


def test_evaluation_rejects_unknown_fields() -> None:
    response = client.post(
        "/api/evaluations",
        json={"scenarioId": "SCN-001", "learnerTurns": [], "rawAudio": "forbidden"},
    )
    assert response.status_code == 422


def test_legacy_client_secret_route_is_not_exposed() -> None:
    response = client.post(
        "/api/realtime/session",
        json={
            "scenarioId": "SCN-001",
            "scenarioVersion": "1.0",
            "difficulty": "medium",
            "clientCapabilities": {"webRtc": True, "audioOutput": True},
        },
    )
    assert response.status_code == 405
    assert "clientSecret" not in response.text


def test_distinct_browsers_on_one_network_get_distinct_visitors() -> None:
    headers = {"X-Forwarded-For": "198.51.100.8, 203.0.113.7:51842"}
    with (
        TestClient(main_module.app) as browser_one,
        TestClient(main_module.app) as browser_two,
    ):
        first = browser_one.get("/api/config", headers=headers)
        second = browser_two.get("/api/config", headers=headers)

        assert browser_one.cookies.get("empathy_visitor")
        assert browser_two.cookies.get("empathy_visitor")
        assert browser_one.cookies.get("empathy_visitor") != browser_two.cookies.get(
            "empathy_visitor"
        )
        assert first.status_code == second.status_code == 200


def test_reset_releases_only_the_current_browser_session(monkeypatch) -> None:
    release_active = AsyncMock()
    monkeypatch.setattr(
        main_module.voice_session_broker.limiter, "release_active", release_active
    )

    response = client.post("/api/voice-live/reset")

    assert response.status_code == 204
    release_active.assert_awaited_once()
