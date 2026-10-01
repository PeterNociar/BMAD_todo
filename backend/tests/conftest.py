from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, make_url, text
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, SQLModel

import app.models  # noqa: F401  (registers table metadata)
from app.config import Settings
from app.db import get_session, make_engine
from app.main import create_app
from tests.helpers import PERCENT_PASSWORD
from tests.settings import TestSettings

TEST_DATABASE_URL = TestSettings().test_database_url


@pytest.fixture()
def percent_password_url() -> Iterator[str]:
    """A scratch `*_pytest` database owned by a scratch role whose password contains `%`.

    Yields its URL with the `%` raw (`p%w`; `%w` is no percent-escape). Only a URL that
    reaches the engine with the password intact can log in. Both objects are dropped even
    if creating the second one fails.
    """
    server_url = make_url(TEST_DATABASE_URL)
    suffix = uuid4().hex[:12]
    role = f"todo_percent_{suffix}"
    name = f"todo_percent_{suffix}_pytest"
    admin = create_engine(server_url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            connection.execute(text(f"CREATE ROLE \"{role}\" LOGIN PASSWORD '{PERCENT_PASSWORD}'"))
            connection.execute(text(f'CREATE DATABASE "{name}" OWNER "{role}"'))
        yield (
            f"{server_url.drivername}://{role}:{PERCENT_PASSWORD}"
            f"@{server_url.host}:{server_url.port}/{name}"
        )
    finally:
        try:
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
                connection.execute(text(f'DROP ROLE IF EXISTS "{role}"'))
        finally:
            admin.dispose()


@pytest.fixture(scope="session")
def database_engine() -> Iterator[Engine]:
    database = make_url(TEST_DATABASE_URL).database or ""
    if not database.endswith("_pytest"):
        pytest.exit(
            f"Refusing to run: TEST_DATABASE_URL names database {database!r}; the tests drop"
            " all tables, so its name must end in '_pytest'.",
            returncode=1,
        )
    engine = make_engine(TEST_DATABASE_URL)
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def session_factory(database_engine: Engine) -> Iterator[sessionmaker[Session]]:
    with database_engine.connect() as connection:
        transaction = connection.begin()
        factory = sessionmaker(
            bind=connection,
            class_=Session,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield factory
        finally:
            if transaction.is_active:
                transaction.rollback()


@pytest.fixture()
def db_session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with session_factory() as session:
        yield session


@pytest.fixture(scope="session")
def application() -> FastAPI:
    return create_app(Settings(_env_file=None, database_url=TEST_DATABASE_URL, app_env="app"))


@pytest.fixture()
def client(application: FastAPI, session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    def override_get_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    application.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(application) as test_client:
            yield test_client
    finally:
        application.dependency_overrides.clear()


@pytest.fixture(scope="session")
def testing_application() -> FastAPI:
    """The one extra session app, in test mode, for testing-router tests (AD-21)."""
    return create_app(Settings(_env_file=None, database_url=TEST_DATABASE_URL, app_env="test"))


@pytest.fixture()
def testing_client(
    testing_application: FastAPI, session_factory: sessionmaker[Session]
) -> Iterator[TestClient]:
    """Client for the test-mode app. The app is session-scoped, so its shared clock is
    restored after each test: no offset leaks into the next one."""

    def override_get_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    clock = testing_application.state.clock
    testing_application.dependency_overrides[get_session] = override_get_session
    try:
        with TestClient(testing_application) as test_client:
            yield test_client
    finally:
        testing_application.dependency_overrides.clear()
        testing_application.state.clock = clock
        clock.offset_ms = 0
