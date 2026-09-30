"""Database engine and request-scoped session (AD-20, AD-21)."""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine
from sqlmodel import Session, create_engine


def make_engine(url: str) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"options": "-c TimeZone=UTC"},
    )


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session
