FROM oven/bun:1.1-alpine

# Install kubectl
RUN apk add --no-cache curl bash && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

WORKDIR /app

# Copy package files first for better caching
COPY cli/package.json cli/bun.lock* ./

# Install dependencies
RUN bun install --production --frozen-lockfile || bun install --production

# Copy source code
COPY cli/src ./src
COPY cli/tsconfig.json ./

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
