FROM golang:1.27-alpine AS go-builder

WORKDIR /pocketbase

COPY pocketbase/go.mod pocketbase/go.sum ./
RUN go mod download

COPY pocketbase/*.go ./
RUN CGO_ENABLED=0 go build -o pocketbase-custom .

FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN bun run build

FROM alpine:3.22

LABEL org.opencontainers.image.source=https://github.com/fmaclen/canutin
LABEL org.opencontainers.image.description="Personal finance app"
LABEL org.opencontainers.image.licenses=Apache-2.0

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app/pocketbase

COPY --from=builder /app/build /app/build
COPY --from=builder /app/pocketbase/pb_migrations ./pb_migrations
COPY --from=go-builder /pocketbase/pocketbase-custom ./pocketbase-custom

EXPOSE 42070

CMD ["./pocketbase-custom", "serve", "--http", "0.0.0.0:42070"]
