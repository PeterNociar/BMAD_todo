"""Database engine and request-scoped session (AD-20)."""

import os
from collections.abc import Iterator

from sqlalchemy import Engine
from sqlmodel import Session, create_engine

DEFAULT_DATABASE_URL = "postgresql+psycopg://todo:todo@localhost:5432/todo"


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def make_engine(url: str) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"options": "-c TimeZone=UTC"},
    )


engine = make_engine(database_url())


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
