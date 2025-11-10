FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app/.svelte-kit/output ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pocketbase ./pocketbase

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=42069
ENV ORIGIN=http://localhost:42069

EXPOSE 42069
EXPOSE 42070

CMD ["bun", "run", "build/server/index.js"]
