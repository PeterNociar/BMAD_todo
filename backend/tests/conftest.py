import os
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, make_url
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, SQLModel

import app.models  # noqa: F401  (registers table metadata)
from app.db import get_session, make_engine
from app.main import create_app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://todo:todo@127.0.0.1:5433/todo_pytest",
)


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
    return create_app()


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
