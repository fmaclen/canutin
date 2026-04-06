FROM golang:1.24-alpine AS go-builder

WORKDIR /pocketbase

COPY pocketbase/go.mod pocketbase/go.sum ./
RUN go mod download

COPY pocketbase/main.go ./
RUN CGO_ENABLED=0 go build -o pocketbase-custom .

FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ENV DOCKER_BUILD=true
RUN bun run build

FROM node:22-slim

LABEL org.opencontainers.image.source=https://github.com/fmaclen/canutin
LABEL org.opencontainers.image.description="Personal finance app"
LABEL org.opencontainers.image.licenses=AGPL-3.0

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pocketbase/pb_migrations ./pocketbase/pb_migrations
COPY --from=builder /app/pocketbase/pb_hooks ./pocketbase/pb_hooks
COPY --from=go-builder /pocketbase/pocketbase-custom ./pocketbase/pocketbase-custom

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=42069

EXPOSE 42069
EXPOSE 42070

CMD ["node", "build/index.js"]
