#!/usr/bin/env bash
set -euo pipefail

mkdir -p \
  "$(dirname "${DB_PATH:-/app/data/db.json}")" \
  "${GENERATED_DIR:-/app/generated}" \
  "${SECRETS_DIR:-/app/data/secrets}" \
  /var/log/apache2 \
  /etc/letsencrypt

apache_pid=""
app_pid=""

stop_children() {
  if [[ -n "${app_pid}" ]] && kill -0 "${app_pid}" 2>/dev/null; then
    kill -TERM "${app_pid}" 2>/dev/null || true
  fi

  if [[ -n "${apache_pid}" ]] && kill -0 "${apache_pid}" 2>/dev/null; then
    apachectl -k graceful-stop 2>/dev/null || kill -TERM "${apache_pid}" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}

trap stop_children INT TERM

if [[ "${RUN_APACHE:-true}" == "true" ]]; then
  apachectl -DFOREGROUND &
  apache_pid="$!"
fi

node /app/server.mjs &
app_pid="$!"

if [[ -n "${apache_pid}" ]]; then
  wait -n "${apache_pid}" "${app_pid}"
else
  wait "${app_pid}"
fi

status="$?"
stop_children
exit "${status}"
