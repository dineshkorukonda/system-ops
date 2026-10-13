# syntax=docker/dockerfile:1

# --- Build frontend assets ---
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html ./
COPY config/vite.config.mjs ./config/vite.config.mjs
COPY src/client ./src/client
RUN npm run build

# --- Production runtime ---
FROM node:24-alpine AS base

RUN apk add --no-cache tini procps curl

WORKDIR /app

ENV NODE_ENV=production \
    PORT=9080 \
    HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY plugins/superpowers/skills/pm2_discovery/ ./plugins/superpowers/skills/pm2_discovery/
COPY public/ ./public/
COPY docker-compose.yml ./
COPY --from=builder /app/dist ./dist/

# Branding/settings must be writable by the unprivileged runtime user.
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 9080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:9080/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/start.js"]
