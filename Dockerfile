# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1-alpine

ARG POCKETBASE_VERSION
ENV POCKETBASE_VERSION=${POCKETBASE_VERSION}

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Download PocketBase using build arg version
RUN apk add --no-cache wget unzip && \
    wget https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip && \
    unzip pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip -d /usr/local/bin && \
    rm pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip && \
    apk del wget unzip

COPY --from=builder --chown=appuser:appgroup /app/build ./build
COPY --from=builder --chown=appuser:appgroup /app/pocketbase ./pocketbase
COPY --from=builder --chown=appuser:appgroup /app/scripts ./scripts

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "build/index.js"]
