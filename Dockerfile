# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

# Install runtime utilities (tini for signal handling, procps for process inspection)
RUN apk add --no-cache tini procps curl

WORKDIR /app

# Set production environment
ENV NODE_ENV=production \
    PORT=9080 \
    HOST=0.0.0.0

# Install dependencies first (leverage Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source and assets
COPY src/ ./src/
COPY public/ ./public/

# Use unprivileged node user
USER node

EXPOSE 9080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
