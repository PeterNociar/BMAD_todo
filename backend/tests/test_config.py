"""AD-21 settings matrix: one test per row of the plan's I/O & edge-case matrix.

These tests prove what `Settings` reads from the real process environment, so they set that
environment with `monkeypatch`. Every other test passes `Settings(_env_file=None, ...)`.
"""

import io
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError

import app.config
from app.config import ENV_FILE, Settings, get_settings
from app.db import get_session
from app.deps import current_settings
from app.main import create_app
from tests.settings import DEFAULT_TEST_DATABASE_URL, TestSettings

BACKEND_DIR = Path(__file__).resolve().parent.parent
URL = "postgresql+psycopg://user:secret@example.invalid:5432/todo"


def write_env(path: Path, **values: str) -> Path:
    path.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
    return path


@pytest.fixture()
def no_config(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    """No DATABASE_URL in the process environment and no env file for the cached loader."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", tmp_path / "absent.env")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_import_reads_no_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    script = (
        "import pydantic_settings\n"
        "def refuse(*args, **kwargs):\n"
        "    raise AssertionError('BaseSettings built at import')\n"
        "pydantic_settings.BaseSettings.__init__ = refuse\n"
        "import app.main, app.db, app.deps, app.config\n"
        "assert app.config.get_settings.cache_info().misses == 0\n"
        "assert not hasattr(app.db, 'engine')\n"
        "assert not hasattr(app.main, 'app')\n"
    )

    result = subprocess.run(
        [sys.executable, "-c", script], cwd=BACKEND_DIR, capture_output=True, text=True
    )

    assert result.returncode == 0, result.stderr


@pytest.mark.usefixtures("no_config")
def test_missing_url_fails_at_startup() -> None:
    with pytest.raises(ValidationError, match="database_url"):
        create_app()


def test_bad_app_env_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "prod")

    with pytest.raises(ValidationError, match="app_env"):
        Settings(_env_file=None, database_url=URL)


def test_empty_url_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)

    with pytest.raises(ValidationError, match="database_url"):
        Settings(_env_file=None, database_url="")


def test_env_beats_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    env_file = write_env(tmp_path / ".env", DATABASE_URL="postgresql+psycopg://a/a")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://b/b")

    settings = Settings(_env_file=env_file)

    assert settings.database_url == "postgresql+psycopg://b/b"


def test_unknown_keys_in_file_are_ignored(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    env_file = write_env(
        tmp_path / ".env",
        DATABASE_URL=URL,
        TEST_DATABASE_URL="postgresql+psycopg://t/t_pytest",
        POSTGRES_USER="todo",
    )

    settings = Settings(_env_file=env_file)

    assert settings.database_url == URL
    assert settings.app_env == "app"
    assert not settings.model_extra
    assert not hasattr(settings, "test_database_url")


def test_env_file_is_backend_env_from_any_cwd(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    assert ENV_FILE.is_absolute()
    assert ENV_FILE == BACKEND_DIR / ".env"
    assert Settings.model_config["env_file"] == ENV_FILE
    assert Path(app.config.__file__).resolve().parent.parent / ".env" == ENV_FILE

    workdir = tmp_path / "cwd"
    workdir.mkdir()
    decoy = "postgresql+psycopg://decoy/decoy"
    write_env(workdir / ".env", DATABASE_URL=decoy)
    pinned = write_env(tmp_path / "pinned.env", DATABASE_URL=URL)
    monkeypatch.setitem(Settings.model_config, "env_file", pinned.resolve())
    monkeypatch.chdir(workdir)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)

    settings = Settings()  # type: ignore[call-arg]

    assert settings.database_url == URL
    assert settings.database_url != decoy


def test_explicit_settings_are_used() -> None:
    settings = Settings(_env_file=None, database_url=URL)

    application = create_app(settings)

    try:
        assert application.state.settings is settings
        assert application.state.engine.url.render_as_string(hide_password=False) == URL
    finally:
        application.state.engine.dispose()


def test_request_providers_read_app_state() -> None:
    application = create_app(Settings(_env_file=None, database_url=URL))
    request = SimpleNamespace(app=application)
    sessions = get_session(request)  # type: ignore[arg-type]

    try:
        assert current_settings(request) is application.state.settings  # type: ignore[arg-type]
        session = next(sessions)
        assert session.get_bind() is application.state.engine
    finally:
        sessions.close()
        application.state.engine.dispose()


def test_test_settings_default_ignores_database_url(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    env_file = write_env(tmp_path / ".env", DATABASE_URL=URL)

    settings = TestSettings(_env_file=env_file)

    assert settings.test_database_url == DEFAULT_TEST_DATABASE_URL
    assert DEFAULT_TEST_DATABASE_URL.endswith("@127.0.0.1:5436/todo_pytest")
    assert not hasattr(settings, "database_url")


def test_test_database_url_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    assert TestSettings.model_config["env_file"] == ENV_FILE
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    from_file = "postgresql+psycopg://x/x_pytest"
    env_file = write_env(tmp_path / ".env", TEST_DATABASE_URL=from_file)

    assert TestSettings(_env_file=env_file).test_database_url == from_file

    from_env = "postgresql+psycopg://y/y_pytest"
    monkeypatch.setenv("TEST_DATABASE_URL", from_env)

    assert TestSettings(_env_file=None).test_database_url == from_env


@pytest.mark.usefixtures("no_config")
def test_alembic_uses_caller_url_over_settings() -> None:
    buffer = io.StringIO()
    config = Config(output_buffer=buffer)
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", URL)

    command.upgrade(config, "head", sql=True)

    assert "CREATE TABLE" in buffer.getvalue()
    assert get_settings.cache_info().misses == 0
