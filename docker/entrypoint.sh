#!/bin/sh
set -eu

REDIS_PID=0
NODE_PID=0

term() {
    [ "$NODE_PID" -ne 0 ] && kill -TERM "$NODE_PID" 2>/dev/null || true
    [ "$REDIS_PID" -ne 0 ] && kill -TERM "$REDIS_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 0
}
trap term TERM INT

/usr/bin/redis-server /etc/redis.conf &
REDIS_PID=$!

i=0
until redis-cli ping >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 100 ]; then
        echo "[entrypoint] redis-server failed to start within 10s" >&2
        exit 1
    fi
    sleep 0.1
done
echo "[entrypoint] redis-server ready on 127.0.0.1:6379"

node /app/dist/src/main &
NODE_PID=$!

# If either dies, exit so the orchestrator restarts the whole container.
while kill -0 "$REDIS_PID" 2>/dev/null && kill -0 "$NODE_PID" 2>/dev/null; do
    sleep 1
done

echo "[entrypoint] a managed process exited; shutting down" >&2
term
