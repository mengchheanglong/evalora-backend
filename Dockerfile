# Multi-stage Dockerfile for Evalora Backend (NestJS + Prisma)
# Architectures: linux/amd64, linux/arm64 (Oracle Cloud Ampere A1)

# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.17.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY prisma ./prisma/

# Install all dependencies and generate Prisma Client
RUN pnpm install --frozen-lockfile

# Copy application source and build configs
COPY tsconfig*.json nest-cli.json* ./
COPY src ./src/

# Build NestJS production bundle
RUN pnpm build

# Prune devDependencies to keep only production packages & Prisma client
RUN pnpm prune --prod

# Stage 2: Production Runtime
FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Security: run as non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 -g nodejs nodejs

# Copy package manifests, schema, and entrypoint
COPY package.json ./
COPY prisma ./prisma/
COPY docker-entrypoint.sh ./

# Copy compiled files and production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN chmod +x docker-entrypoint.sh && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
