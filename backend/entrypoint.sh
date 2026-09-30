#!/bin/sh
set -e
alembic upgrade head
# Extra arguments go to uvicorn (the dev profile passes --reload).
exec uvicorn --factory app.main:create_app --host 0.0.0.0 --port 8000 "$@"
