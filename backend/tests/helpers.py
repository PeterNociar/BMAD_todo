"""Shared test helpers for the scratch-role `%` tests (AD-21)."""

from sqlalchemy import create_engine, make_url, text

from tests.settings import TestSettings

# `%w` is no percent-escape, so `make_url` keeps it raw; a URL normally writes `%` as `%25`.
PERCENT_PASSWORD = "p%w"
PERCENT_PASSWORD_ENCODED = "p%25w"
# Interpolated into `CREATE ROLE ... PASSWORD '...'`, so it must hold no quote of either kind.
assert not {"'", '"'} & set(PERCENT_PASSWORD)


def public_tables(url: str) -> list[str]:
    """The tables in `public` of the database at `url`, read on a fresh admin connection."""
    admin_url = make_url(TestSettings().test_database_url)
    engine = create_engine(admin_url.set(database=make_url(url).database))
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
            ).scalars()
            return list(rows)
    finally:
        engine.dispose()
