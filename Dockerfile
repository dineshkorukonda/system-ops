# syntax=docker/dockerfile:1
# ── Stage 1: Build Frontend SPA ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Production Runtime ──
FROM node:20-alpine AS runner
RUN apk add --no-cache tini procps curl

WORKDIR /app
ENV NODE_ENV=production \
    PORT=9080 \
    HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY public/ ./public/
COPY --from=builder /app/dist ./dist/

USER node
EXPOSE 9080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
