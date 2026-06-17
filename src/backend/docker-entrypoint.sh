#!/bin/sh
set -e

echo "⏳ Applying database migrations..."
npx prisma migrate deploy

echo "🌱 Seeding database (idempotent — skips if already seeded)..."
npx ts-node --transpile-only prisma/seed.ts

echo "🚀 Starting backend..."
exec node dist/main.js
