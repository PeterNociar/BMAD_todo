from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection
from sqlmodel import SQLModel

import app.models  # noqa: F401  (registers table metadata)
from app.config import get_settings
from app.db import make_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def database_url() -> str:
    """AD-21: a caller-set `sqlalchemy.url` wins over the app settings."""
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_on(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        run_on(connection)  # the caller owns it; never close or dispose it here
        return
    engine = make_engine(database_url())
    try:
        with engine.connect() as connection:
            run_on(connection)
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
