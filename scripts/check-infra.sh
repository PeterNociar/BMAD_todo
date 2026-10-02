#!/usr/bin/env bash
# Smoke checks for the compose profiles that no unit or E2E suite can reach (story 3.6).
#
#   1. Test profile up: POST :8082/api/test/reset is 204; with the app profile up, the same
#      call on the app (:8081) is 404. That probe is the only HTTP request this script sends to
#      the app stack (but see check 3: backend-dev migrates the app's db).
#   2. Stale IP: backend-test is stopped, busybox squatters start on the compose network until
#      one takes its IP (Docker hands out the lowest free address, so earlier squatters fill
#      any lower gaps), backend-test comes back on a new IP, and nginx (frontend-test) must
#      follow it: GET :8082/api/health is 200 within 15 s (AD-16, `resolver 127.0.0.11
#      valid=10s`). SKIP when no squatter got the old IP.
#   3. Dev profile: backend-dev and frontend-dev come up, uvicorn runs with --reload (the
#      entrypoint.sh pass-through), and Vite proxies GET :5173/api/health to 200. backend-dev
#      uses the app's db, so its start runs `alembic upgrade head` there (a no-op when the app
#      runs the same code). Then it stops whichever of db, backend-dev and frontend-dev it
#      started; any that were already running stay up.
#
# Needs the test profile running (`COMPOSE_PROFILES=test docker compose up -d --build --wait`)
# and host ports 8000 and 5173 free. It restores what it changes, even on failure: the
# squatters are removed, backend-test is running again, and the dev-profile services it
# started (and only those) are stopped.
# Prints one PASS / FAIL / SKIP line per check and exits 1 if any check failed.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

TEST_URL=http://127.0.0.1:8082
DEV_URL=http://127.0.0.1:5173
SQUATTER_LABEL=todo-check-infra=squatter
MAX_SQUATTERS=8
HEALTH_WINDOW_S=15

# The app's host address: APP_BIND from the shell, then from .env, then 127.0.0.1.
# Quotes and a CRLF line ending are stripped from the .env value.
app_bind=${APP_BIND:-$(sed -n 's/^APP_BIND=//p' .env 2>/dev/null | tail -n 1 | tr -d "\"'\r")}
APP_URL=http://${app_bind:-127.0.0.1}:8081

failures=0
# The dev-profile services check 3 started, which restore() stops.
dev_started=()

pass() { echo "PASS  $*"; }
fail() {
  echo "FAIL  $*"
  failures=$((failures + 1))
}
skip() { echo "SKIP  $*"; }
note() { echo "      $*"; }

# docker compose with exactly one profile active, whatever .env says.
compose() {
  local profile=$1
  shift
  COMPOSE_PROFILES=$profile docker compose "$@"
}

# The HTTP status of a request, or 000 when nothing answered.
status() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$@" || true; }

container_ip() {
  docker inspect -f "{{(index .NetworkSettings.Networks \"$2\").IPAddress}}" "$1"
}

remove_squatters() {
  local ids
  ids=$(docker ps -aq --filter "label=$SQUATTER_LABEL")
  if [[ -n "$ids" ]]; then
    # shellcheck disable=SC2086 # one id per word
    docker rm -f $ids >/dev/null 2>&1 || true
  fi
}

restore() {
  remove_squatters
  if [[ -z "$(compose test ps -q --status running backend-test 2>/dev/null)" ]]; then
    echo "      restoring backend-test"
    compose test up -d --no-deps --wait backend-test >/dev/null 2>&1 ||
      echo "      WARNING: backend-test did not come back; run: COMPOSE_PROFILES=test docker compose up -d --wait"
  fi
  stop_dev_started
}

# Stops the dev-profile services this script started, leaving any that were already running.
stop_dev_started() {
  ((${#dev_started[@]})) || return 0
  if compose dev stop "${dev_started[@]}" >/dev/null 2>&1; then
    note "stopped ${dev_started[*]}"
    dev_started=()
  else
    echo "      WARNING: could not stop ${dev_started[*]}"
  fi
}
trap restore EXIT

# --- 1. Test profile up ---------------------------------------------------------------------

check_test_profile() {
  local code
  code=$(status -X POST "$TEST_URL/api/test/reset")
  if [[ "$code" != 204 ]]; then
    fail "test profile: POST $TEST_URL/api/test/reset gave $code, expected 204 (is the test profile up?)"
    return
  fi
  pass "test profile: POST $TEST_URL/api/test/reset is 204"

  if [[ -z "$(compose app ps -q --status running frontend 2>/dev/null)" ]]; then
    skip "app profile: not running, so the 404 probe on $APP_URL was not sent"
    return
  fi
  code=$(status -X POST "$APP_URL/api/test/reset")
  if [[ "$code" == 404 ]]; then
    pass "app profile: POST $APP_URL/api/test/reset is 404 (no testing router)"
  else
    fail "app profile: POST $APP_URL/api/test/reset gave $code, expected 404"
  fi
}

# --- 2. nginx follows a recreated backend's new IP ------------------------------------------

check_stale_ip() {
  local cid network old_ip squatter squatter_ip new_ip code deadline i
  cid=$(compose test ps -q --status running backend-test)
  if [[ -z "$cid" ]]; then
    fail "stale IP: backend-test is not running"
    return
  fi
  network=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$cid" | head -n 1)
  old_ip=$(container_ip "$cid" "$network")
  note "backend-test is $old_ip on $network; stopping it"

  compose test stop backend-test >/dev/null 2>&1 || {
    fail "stale IP: could not stop backend-test"
    return
  }
  squatter_ip=
  for ((i = 1; i <= MAX_SQUATTERS; i++)); do
    squatter=$(docker run -q -d --rm --label "$SQUATTER_LABEL" --network "$network" busybox sleep 300) || {
      fail "stale IP: could not start a busybox squatter on $network"
      remove_squatters
      return
    }
    squatter_ip=$(container_ip "$squatter" "$network")
    [[ "$squatter_ip" == "$old_ip" ]] && break
  done
  if [[ "$squatter_ip" != "$old_ip" ]]; then
    skip "stale IP: none of $MAX_SQUATTERS squatters got backend-test's old $old_ip (last: $squatter_ip), so nothing to test"
    remove_squatters
    compose test up -d --no-deps --wait backend-test >/dev/null 2>&1 || {
      fail "stale IP: backend-test did not become healthy again after the SKIP"
      return
    }
    return
  fi
  note "squatter $i holds $old_ip; starting backend-test again"

  if ! compose test up -d --no-deps --wait backend-test >/dev/null 2>&1; then
    remove_squatters
    fail "stale IP: backend-test did not become healthy again"
    return
  fi
  new_ip=$(container_ip "$(compose test ps -q backend-test)" "$network")
  note "backend-test is back on $new_ip"

  deadline=$((SECONDS + HEALTH_WINDOW_S))
  code=000
  while ((SECONDS < deadline)); do
    code=$(status -m 2 "$TEST_URL/api/health")
    [[ "$code" == 200 ]] && break
    sleep 1
  done
  remove_squatters
  if [[ "$code" == 200 ]]; then
    pass "stale IP: GET $TEST_URL/api/health is 200 after backend-test moved $old_ip -> $new_ip"
  else
    fail "stale IP: GET $TEST_URL/api/health gave $code, not 200, within ${HEALTH_WINDOW_S} s of the move"
  fi
}

# --- 3. Dev profile -------------------------------------------------------------------------

check_dev_profile() {
  local cid code deadline service processes
  for service in db backend-dev frontend-dev; do
    if [[ -z "$(compose dev ps -q --status running "$service" 2>/dev/null)" ]]; then
      dev_started+=("$service")
    fi
  done
  note "starting the dev profile (backend-dev, frontend-dev); frontend-dev runs npm ci first"
  if ! compose dev up -d --build --wait --wait-timeout 300 backend-dev frontend-dev >/dev/null 2>&1; then
    fail "dev profile: backend-dev and frontend-dev did not become healthy"
    return
  fi

  cid=$(compose dev ps -q --status running backend-dev 2>/dev/null || true)
  if [[ -z "$cid" ]]; then
    fail "dev profile: backend-dev not running"
  else
    # Captured first: `docker top | grep -q` under pipefail can fail on SIGPIPE.
    processes=$(docker top "$cid" -o pid,args 2>/dev/null || true)
    if grep -q -- 'uvicorn .*--reload' <<<"$processes"; then
      pass "dev profile: backend-dev runs uvicorn with --reload"
    else
      fail "dev profile: backend-dev's uvicorn process has no --reload"
    fi
  fi

  deadline=$((SECONDS + 15))
  code=000
  while ((SECONDS < deadline)); do
    code=$(status -m 2 "$DEV_URL/api/health")
    [[ "$code" == 200 ]] && break
    sleep 1
  done
  if [[ "$code" == 200 ]]; then
    pass "dev profile: GET $DEV_URL/api/health is 200 through Vite"
  else
    fail "dev profile: GET $DEV_URL/api/health gave $code, expected 200"
  fi

  stop_dev_started
}

check_test_profile
check_stale_ip
check_dev_profile

if ((failures)); then
  echo "check-infra: $failures check(s) failed"
  exit 1
fi
echo "check-infra: all checks passed"
