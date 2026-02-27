#!/bin/sh
# ── Docker entrypoint ─────────────────────────────────────────────────────────
# Runs at container start (before nginx).
#
# 1. Substitutes GATEWAY_PROXY_PASS into nginx.conf
# 2. Injects window.__ENV__ into index.html so the React app can read
#    VITE_GATEWAY_URL at runtime without needing a rebuild.
# ─────────────────────────────────────────────────────────────────────────────

set -e

INDEX=/usr/share/nginx/html/index.html
NGINX_CONF=/etc/nginx/conf.d/default.conf

# ── 1. nginx proxy target ─────────────────────────────────────────────────────
PROXY=${GATEWAY_PROXY_PASS:-http://gateway:3000}
echo "[entrypoint] Gateway proxy: ${PROXY}"
sed -i "s|GATEWAY_PROXY_PASS_PLACEHOLDER|${PROXY}|g" "$NGINX_CONF"

# ── 2. Runtime env injection into index.html ──────────────────────────────────
GATEWAY_URL=${VITE_GATEWAY_URL:-""}
ENV_SCRIPT="<script>window.__ENV__={VITE_GATEWAY_URL:\"${GATEWAY_URL}\"};</script>"

# Insert just before </head>
sed -i "s|</head>|${ENV_SCRIPT}</head>|" "$INDEX"

echo "[entrypoint] VITE_GATEWAY_URL=${GATEWAY_URL:-'(empty — using /api proxy)'}"

# ── 3. Hand off to nginx ──────────────────────────────────────────────────────
exec "$@"
