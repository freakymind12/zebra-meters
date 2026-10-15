#!/bin/bash
set -u

su-exec node node /app/.output/server/index.mjs &
node_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

terminate_children() {
  kill -TERM "$node_pid" "$nginx_pid" 2>/dev/null || true
}

trap terminate_children TERM INT

wait -n "$node_pid" "$nginx_pid"
status=$?

terminate_children
wait "$node_pid" 2>/dev/null || true
wait "$nginx_pid" 2>/dev/null || true

exit "$status"
