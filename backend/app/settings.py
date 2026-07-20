from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    app_mode: Literal["mock", "azure"] = "mock"
    build_label: str = "local"
    allowed_origins: str = "http://localhost:5173,http://localhost:8000"
    frontend_dist_path: Path = Field(
        default_factory=lambda: (
            Path(__file__).resolve().parents[2] / "frontend" / "dist"
        )
    )

    azure_voice_live_endpoint: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AZURE_VOICELIVE_ENDPOINT", "azure_voice_live_endpoint"
        ),
    )
    azure_voice_live_model: str = Field(
        default="gpt-realtime-1.5",
        validation_alias=AliasChoices(
            "AZURE_VOICELIVE_MODEL", "azure_voice_live_model"
        ),
    )
    azure_voice_live_transcription_model: str = Field(
        default="azure-speech",
        validation_alias=AliasChoices(
            "AZURE_VOICELIVE_TRANSCRIPTION_MODEL",
            "azure_voice_live_transcription_model",
        ),
    )
    azure_custom_photo_avatar_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "AZURE_CUSTOM_PHOTO_AVATAR_ENABLED",
            "azure_custom_photo_avatar_enabled",
        ),
    )
    azure_custom_photo_avatar_character_scn_001: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_001",
            "azure_custom_photo_avatar_character_scn_001",
        ),
    )
    azure_custom_photo_avatar_character_scn_002: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_002",
            "azure_custom_photo_avatar_character_scn_002",
        ),
    )
    azure_custom_photo_avatar_character_scn_003: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AZURE_CUSTOM_PHOTO_AVATAR_CHARACTER_SCN_003",
            "azure_custom_photo_avatar_character_scn_003",
        ),
    )
    azure_custom_photo_avatar_model: Literal["vasa-1"] = Field(
        default="vasa-1",
        validation_alias=AliasChoices(
            "AZURE_CUSTOM_PHOTO_AVATAR_MODEL",
            "azure_custom_photo_avatar_model",
        ),
    )
    azure_custom_photo_avatar_output_protocol: Literal["webrtc"] = Field(
        default="webrtc",
        validation_alias=AliasChoices(
            "AZURE_CUSTOM_PHOTO_AVATAR_OUTPUT_PROTOCOL",
            "azure_custom_photo_avatar_output_protocol",
        ),
    )
    azure_storage_account_url: str = ""
    azure_result_container: str = "session-results"
    applicationinsights_connection_string: str = ""
    persist_results: bool = False
    session_max_minutes: int = 15

    @property
    def origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]

    @property
    def custom_photo_avatar_characters(self) -> dict[str, str]:
        return {
            "SCN-001": self.azure_custom_photo_avatar_character_scn_001,
            "SCN-002": self.azure_custom_photo_avatar_character_scn_002,
            "SCN-003": self.azure_custom_photo_avatar_character_scn_003,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
