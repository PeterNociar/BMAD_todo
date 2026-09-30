"""Test-only settings: owns TEST_DATABASE_URL, which the app's Settings never reads (AD-21)."""

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config import ENV_FILE

DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://todo:todo@127.0.0.1:5436/todo_pytest"


class TestSettings(BaseSettings):
    __test__ = False  # not a pytest test class

    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    test_database_url: str = DEFAULT_TEST_DATABASE_URL
