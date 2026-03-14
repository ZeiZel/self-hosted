FROM oven/bun:1.2-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ curl bash

WORKDIR /app

# Copy package files first for better caching
COPY cli/package.json cli/bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY cli/src ./src
COPY cli/tsconfig.json ./

# Production image
FROM oven/bun:1.2-alpine

# Install runtime dependencies
RUN apk add --no-cache curl bash && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

WORKDIR /app

# Copy built node_modules and source from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Create data directory
RUN mkdir -p /data

# Set environment defaults
ENV CHECK_INTERVAL=60
ENV DATA_DIR=/data
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD bun run src/daemon/healthcheck.ts || exit 1

# Entry point
ENTRYPOINT ["bun", "run", "src/daemon/daemon.runner.ts"]
