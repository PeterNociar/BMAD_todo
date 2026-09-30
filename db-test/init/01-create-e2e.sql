-- Runs once, on an empty db-test data directory (docker-entrypoint-initdb.d).
-- todo_pytest (POSTGRES_DB) is for pytest; todo_e2e is for backend-test (AD-16).
CREATE DATABASE todo_e2e;
