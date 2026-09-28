#!/bin/sh
set -e

# Run database migrations if DATABASE_URL is configured
if [ -n "$DATABASE_URL" ] && [ "$RUN_MIGRATIONS" != "false" ]; then
  echo "[entrypoint] Applying database migrations..."
  npx prisma migrate deploy || echo "[entrypoint] Warning: prisma migrate deploy encountered an error, proceeding with startup."
fi

echo "[entrypoint] Starting Evalora backend on port ${PORT:-4000}..."
exec "$@"
