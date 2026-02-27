# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║        Cognigy A2A Webchat UI — Production Dockerfile                       ║
# ║                                                                              ║
# ║  Multi-stage build:                                                          ║
# ║    Stage 1 (builder) — Node 22: install deps + vite build → /dist           ║
# ║    Stage 2 (runner)  — nginx:alpine: serve static files with env injection  ║
# ║                                                                              ║
# ║  Runtime env injection:                                                      ║
# ║    VITE_GATEWAY_URL — URL of the A2A Gateway reachable FROM the browser     ║
# ║                        e.g. http://localhost:3000  or  https://a2a.example   ║
# ║                        If unset, the UI falls back to /api proxy path       ║
# ║                                                                              ║
# ║  Build:                                                                      ║
# ║    docker build -t cognigy-a2a-webchat:latest .                              ║
# ║                                                                              ║
# ║  Run:                                                                        ║
# ║    docker run -p 8080:80 \                                                   ║
# ║      -e VITE_GATEWAY_URL=http://localhost:3000 \                             ║
# ║      cognigy-a2a-webchat:latest                                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Layer cache: reinstall only when manifests change
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .

# VITE_GATEWAY_URL can be baked in at build time if known.
# If left empty the runtime injection script will provide it instead.
ARG VITE_GATEWAY_URL=""
ENV VITE_GATEWAY_URL=${VITE_GATEWAY_URL}

RUN npm run build


# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# ── Labels ────────────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="Cognigy A2A Webchat UI"
LABEL org.opencontainers.image.description="React SPA chat interface for the Cognigy A2A Gateway"
LABEL org.opencontainers.image.licenses="MIT"

# ── nginx config ──────────────────────────────────────────────────────────────
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ── Static files from builder ─────────────────────────────────────────────────
COPY --from=builder /build/dist /usr/share/nginx/html

# ── Runtime environment injection ─────────────────────────────────────────────
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# ── Environment variables ─────────────────────────────────────────────────────
#
# VITE_GATEWAY_URL
#   The URL of the A2A Gateway as seen from the USER'S BROWSER.
#   Must be reachable from the browser, NOT a Docker-internal hostname.
#   Examples:
#     http://localhost:3000       ← local dev (browser on same machine as Docker)
#     https://a2a.mycompany.com   ← production with TLS
#   If empty, nginx proxy (/api → gateway) is used instead.
ENV VITE_GATEWAY_URL=""

# GATEWAY_PROXY_PASS
#   Internal Docker network URL for the nginx /api proxy.
#   Use the Docker service name. Default: http://gateway:3000
ENV GATEWAY_PROXY_PASS="http://gateway:3000"

ENV PORT=80

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
