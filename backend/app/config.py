"""Application settings: the only reader of the environment (AD-21)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str = Field(min_length=1)
    app_env: Literal["app", "test"] = "app"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  (required fields come from the environment)
