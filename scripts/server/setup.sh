#!/usr/bin/env bash
# Install systemd units, nginx config, and webhook for power2plant.
# Run as root after exporting variables (see docs/server-setup.md).
set -euo pipefail

# ── Validate required variables ───────────────────────────────────────────────
required=(VOLUME_PATH DEPLOY_USERNAME PROJECT DOMAIN ADMIN_EMAIL GITHUB_USER GITHUB_PAT WEBHOOK_SECRET)
missing=()
for var in "${required[@]}"; do
  [[ -z "${!var:-}" ]] && missing+=("$var")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Error: required variables not set:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo "Export them before running this script (see docs/server-setup.md)." >&2
  exit 1
fi

PROJECT_PATH="${VOLUME_PATH}/${PROJECT}"
PROD_PATH="${PROJECT_PATH}/prod"
STAGING_PATH="${PROJECT_PATH}/staging"

# Staging is opt-in: set STAGING_DOMAIN to enable.
SETUP_STAGING=false
if [[ -n "${STAGING_DOMAIN:-}" ]]; then
  SETUP_STAGING=true
  : "${STAGING_WEBHOOK_SECRET:?STAGING_WEBHOOK_SECRET required when STAGING_DOMAIN is set}"
  STAGING_APP_PORT="${STAGING_APP_PORT:-3001}"
fi

if [[ ! -d "$PROD_PATH" ]]; then
  echo "Error: $PROD_PATH does not exist. Clone the repo first (step 5 in docs)." >&2
  exit 1
fi

if $SETUP_STAGING && [[ ! -d "$STAGING_PATH" ]]; then
  echo "Error: $STAGING_PATH does not exist. Clone the repo there first." >&2
  exit 1
fi

if ! id "$DEPLOY_USERNAME" &>/dev/null; then
  echo "Error: user '$DEPLOY_USERNAME' does not exist. Create it first (step 4 in docs)." >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Error: must run as root." >&2
  exit 1
fi

echo "==> Installing power2plant server config..."

# ── Systemd: prod ─────────────────────────────────────────────────────────────
cat > "/etc/systemd/system/${PROJECT}-prod.service" <<EOF
[Unit]
Description=${PROJECT} production
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=${DEPLOY_USERNAME}
Group=${DEPLOY_USERNAME}
WorkingDirectory=${PROD_PATH}
ExecStart=docker compose up -d --build
ExecStop=docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
echo "    wrote ${PROJECT}-prod.service"

# ── Systemd: dev ──────────────────────────────────────────────────────────────
cat > "/etc/systemd/system/${PROJECT}-dev.service" <<EOF
[Unit]
Description=${PROJECT} dev
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=${DEPLOY_USERNAME}
Group=${DEPLOY_USERNAME}
WorkingDirectory=${PROJECT_PATH}/dev
ExecStart=docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
ExecStop=docker compose -f docker-compose.yml -f docker-compose.dev.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
echo "    wrote ${PROJECT}-dev.service"

# ── Systemd: staging ─────────────────────────────────────────────────────────
if $SETUP_STAGING; then
cat > "/etc/systemd/system/${PROJECT}-staging.service" <<EOF
[Unit]
Description=${PROJECT} staging
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=${DEPLOY_USERNAME}
Group=${DEPLOY_USERNAME}
WorkingDirectory=${STAGING_PATH}
ExecStart=docker compose up -d --build
ExecStop=docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
echo "    wrote ${PROJECT}-staging.service"

cat > "/etc/systemd/system/${PROJECT}-staging-deploy.path" <<EOF
[Unit]
Description=Watch for ${PROJECT} staging deploy trigger

[Path]
PathExists=/run/p2p/staging-deploy.trigger
Unit=${PROJECT}-staging-deploy.service

[Install]
WantedBy=multi-user.target
EOF

STAGING_DUMP_FILE="${VOLUME_PATH}/${PROJECT}/backups/staging-latest.sql"

cat > "/etc/systemd/system/${PROJECT}-staging-deploy.service" <<EOF
[Unit]
Description=${PROJECT} staging deploy

[Service]
Type=oneshot
Environment=DEPLOY_USERNAME=${DEPLOY_USERNAME}
Environment=PROJECT_PATH=${STAGING_PATH}
Environment=PROD_PATH=${PROD_PATH}
Environment=STAGING_DUMP_FILE=${STAGING_DUMP_FILE}
ExecStart=${STAGING_PATH}/scripts/server/staging-deploy.sh
TimeoutStartSec=600
EOF

cat > "/etc/systemd/system/${PROJECT}-staging-dump-refresh.service" <<EOF
[Unit]
Description=${PROJECT} staging DB dump refresh (daily prod → anonymized dump)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=DEPLOY_USERNAME=${DEPLOY_USERNAME}
Environment=PROJECT_PATH=${STAGING_PATH}
Environment=PROD_PATH=${PROD_PATH}
Environment=STAGING_DUMP_FILE=${STAGING_DUMP_FILE}
ExecStart=${STAGING_PATH}/scripts/server/staging-dump-refresh.sh
TimeoutStartSec=1800
EOF

cat > "/etc/systemd/system/${PROJECT}-staging-dump-refresh.timer" <<EOF
[Unit]
Description=Daily refresh of ${PROJECT} staging DB dump from prod

[Timer]
OnCalendar=*-*-* 02:00:00
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "    wrote ${PROJECT}-staging-deploy.path, ${PROJECT}-staging-deploy.service"
echo "    wrote ${PROJECT}-staging-dump-refresh.service and .timer"
fi

# ── Systemd: deploy trigger ───────────────────────────────────────────────────
cat > "/etc/systemd/system/${PROJECT}-deploy.path" <<EOF
[Unit]
Description=Watch for ${PROJECT} deploy trigger

[Path]
PathExists=/run/p2p/deploy.trigger
Unit=${PROJECT}-deploy.service

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/${PROJECT}-deploy.service" <<EOF
[Unit]
Description=${PROJECT} production deploy

[Service]
Type=oneshot
Environment=DEPLOY_USERNAME=${DEPLOY_USERNAME}
Environment=PROJECT_PATH=${PROD_PATH}
ExecStart=${PROD_PATH}/scripts/server/deploy.sh
TimeoutStartSec=600
EOF
echo "    wrote ${PROJECT}-deploy.path and ${PROJECT}-deploy.service"

# ── Nginx rate-limit zone ─────────────────────────────────────────────────────
# limit_req_zone must live in the http{} context → /etc/nginx/conf.d/
cat > "/etc/nginx/conf.d/${PROJECT}-rate-limits.conf" <<'RLCONF'
# 60 req/min per IP on /share/* (token-guessing mitigation)
# 10m shared memory ≈ 160k tracked IPs
limit_req_zone $binary_remote_addr zone=p2p_share_rl:10m rate=1r/s;
RLCONF
echo "    wrote /etc/nginx/conf.d/${PROJECT}-rate-limits.conf"

# ── Nginx site config ─────────────────────────────────────────────────────────
# Single-quoted NGINX heredoc prevents shell expansion — nginx vars ($host etc.) preserved.
# sed substitutes only __DOMAIN__.
#
# Cert chicken-and-egg: certbot needs nginx serving :80 to validate, but a
# config referencing a non-existent fullchain.pem fails `nginx -t`. So:
#   - cert absent → install HTTP-only bootstrap (proxies / to app, no SSL block)
#   - cert present → install full HTTPS config with :80 → :443 redirect
# Operator runs setup.sh, then certbot, then setup.sh again to swap to HTTPS.
cert_path="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

if [[ -f "$cert_path" ]]; then
  nginx_mode="https"
  nginx_template=$(cat <<'NGINX'
server {
    listen [::]:443 ssl;
    listen 443 ssl;
    server_name __DOMAIN__;

    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;

    location /hooks/ {
        proxy_pass http://127.0.0.1:9000/hooks/;
        proxy_read_timeout 10s;
    }

    # Rate-limited: 60 req/min per IP, burst of 10
    location /share/ {
        limit_req zone=p2p_share_rl burst=10 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen [::]:80;
    listen 80;
    server_name __DOMAIN__;
    return 301 https://$host$request_uri;
}
NGINX
)
else
  nginx_mode="http-bootstrap"
  nginx_template=$(cat <<'NGINX'
# Bootstrap config — no cert yet. After certbot succeeds, re-run setup.sh
# to install the full HTTPS config.
server {
    listen [::]:80;
    listen 80;
    server_name __DOMAIN__;

    location /hooks/ {
        proxy_pass http://127.0.0.1:9000/hooks/;
        proxy_read_timeout 10s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
NGINX
)
fi

echo "$nginx_template" | sed "s/__DOMAIN__/${DOMAIN}/g" \
  > "/etc/nginx/sites-available/${PROJECT}"

if [[ ! -e "/etc/nginx/sites-enabled/${PROJECT}" ]]; then
  ln -s "/etc/nginx/sites-available/${PROJECT}" "/etc/nginx/sites-enabled/${PROJECT}"
fi

# Stock Ubuntu nginx ships a `default` site with `listen 80 default_server`
# and `server_name _` — it wins for IPv4 traffic without a Host match.
rm -f /etc/nginx/sites-enabled/default

echo "    wrote nginx config for ${DOMAIN} (${nginx_mode})"

# ── Nginx site config: staging ────────────────────────────────────────────────
if $SETUP_STAGING; then
  staging_cert_path="/etc/letsencrypt/live/${STAGING_DOMAIN}/fullchain.pem"

  if [[ -f "$staging_cert_path" ]]; then
    staging_nginx_mode="https"
    staging_nginx_template=$(cat <<'NGINX'
server {
    listen [::]:443 ssl;
    listen 443 ssl;
    server_name __DOMAIN__;

    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;

    location /share/ {
        limit_req zone=p2p_share_rl burst=10 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:__APP_PORT__;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:__APP_PORT__;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen [::]:80;
    listen 80;
    server_name __DOMAIN__;
    return 301 https://$host$request_uri;
}
NGINX
)
  else
    staging_nginx_mode="http-bootstrap"
    staging_nginx_template=$(cat <<'NGINX'
# Bootstrap config — no cert yet. After certbot succeeds, re-run setup.sh
# to install the full HTTPS config.
server {
    listen [::]:80;
    listen 80;
    server_name __DOMAIN__;

    location / {
        proxy_pass http://127.0.0.1:__APP_PORT__;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
NGINX
)
  fi

  echo "$staging_nginx_template" \
    | sed -e "s/__DOMAIN__/${STAGING_DOMAIN}/g" \
          -e "s/__APP_PORT__/${STAGING_APP_PORT}/g" \
    > "/etc/nginx/sites-available/${PROJECT}-staging"

  if [[ ! -e "/etc/nginx/sites-enabled/${PROJECT}-staging" ]]; then
    ln -s "/etc/nginx/sites-available/${PROJECT}-staging" \
          "/etc/nginx/sites-enabled/${PROJECT}-staging"
  fi

  echo "    wrote nginx config for ${STAGING_DOMAIN} (${staging_nginx_mode}, port ${STAGING_APP_PORT})"
fi

# ── Git credential store ─────────────────────────────────────────────────────
git_creds="${PROJECT_PATH}/.git-credentials"
echo "https://${GITHUB_USER}:${GITHUB_PAT}@github.com" > "$git_creds"
chmod 600 "$git_creds"
chown "${DEPLOY_USERNAME}:${DEPLOY_USERNAME}" "$git_creds"
sudo -u "$DEPLOY_USERNAME" git config --global credential.helper store
echo "    wrote .git-credentials for ${GITHUB_USER}"

# ── Webhook hooks.json from template ─────────────────────────────────────────
# Only write if absent — re-running setup with a freshly-rolled WEBHOOK_SECRET
# would otherwise silently invalidate the GitHub webhook. To rotate, delete
# hooks.json first.
hooks_template="${PROD_PATH}/webhook/hooks.json.template"
hooks_out="${PROD_PATH}/webhook/hooks.json"
if [[ ! -f "$hooks_template" ]]; then
  echo "Warning: $hooks_template not found — skipping hooks.json generation." >&2
elif [[ -f "$hooks_out" ]]; then
  echo "    webhook/hooks.json exists, leaving in place (delete to regenerate)"
else
  staging_secret="${STAGING_WEBHOOK_SECRET:-STAGING-NOT-CONFIGURED}"
  sed -e "s/__WEBHOOK_SECRET__/${WEBHOOK_SECRET}/g" \
      -e "s/__STAGING_WEBHOOK_SECRET__/${staging_secret}/g" \
      "$hooks_template" > "$hooks_out"
  chmod 644 "$hooks_out"
  chown "${DEPLOY_USERNAME}:${DEPLOY_USERNAME}" "$hooks_out"
  echo "    wrote webhook/hooks.json"
fi

# ── tmpfiles.d: /run/p2p owned by deploy user ────────────────────────────────
echo "d /run/p2p 0755 ${DEPLOY_USERNAME} ${DEPLOY_USERNAME} -" \
  > /etc/tmpfiles.d/p2p.conf
systemd-tmpfiles --create /etc/tmpfiles.d/p2p.conf
echo "    wrote /etc/tmpfiles.d/p2p.conf and created /run/p2p"

# ── Reload and enable ─────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable "${PROJECT}-prod" "${PROJECT}-dev" "${PROJECT}-deploy.path"
if $SETUP_STAGING; then
  systemctl enable "${PROJECT}-staging" "${PROJECT}-staging-deploy.path" "${PROJECT}-staging-dump-refresh.timer"
  systemctl start "${PROJECT}-staging-dump-refresh.timer"
fi
echo "    systemd units enabled"

nginx -t && systemctl reload nginx
echo "    nginx reloaded"

echo ""
echo "Done. Remaining manual steps:"
echo "  1. Create/verify prod .env:  ${PROD_PATH}/.env"
echo "  2. Start services:           systemctl start ${PROJECT}-prod ${PROJECT}-dev"
if [[ "$nginx_mode" == "http-bootstrap" ]]; then
echo "  3. Get TLS cert (nginx is in HTTP-only bootstrap mode):"
echo "       certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${ADMIN_EMAIL}"
echo "     Then re-run THIS script to install the full HTTPS config."
else
echo "  3. (TLS cert already installed — HTTPS config in place.)"
fi
echo "  4. Start webhook:"
echo "       cd ${PROD_PATH}/webhook && sudo -u ${DEPLOY_USERNAME} docker compose up -d"
echo "  5. Add GitHub webhook (prod):"
echo "       URL: https://${DOMAIN}/hooks/deploy-prod"
echo "       Secret: (the WEBHOOK_SECRET you exported)"
echo "       Trigger: Releases only (action: published)"
if $SETUP_STAGING; then
echo ""
echo "  Staging:"
echo "  6. Create staging .env:      ${STAGING_PATH}/.env"
echo "       Required: VOLUME_DATA_DIR, POSTGRES_PASSWORD, DATABASE_URL, APP_PORT=3001, DB_PORT=5433"
echo "       BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL (pointing to ${STAGING_DOMAIN})"
echo "       STAGING_DATA_SOURCE=prod  # or: seed"
echo "  7. Start staging:            systemctl start ${PROJECT}-staging"
if [[ "$staging_nginx_mode" == "http-bootstrap" ]]; then
echo "  8. Get TLS cert for staging (nginx is in HTTP-only bootstrap mode):"
echo "       certbot --nginx -d ${STAGING_DOMAIN} --non-interactive --agree-tos -m ${ADMIN_EMAIL}"
echo "     Then re-run THIS script to install the full HTTPS config."
else
echo "  8. (TLS cert for staging already installed — HTTPS config in place.)"
fi
echo "  9. Add GitHub webhook (staging):"
echo "       URL: https://${STAGING_DOMAIN}/hooks/deploy-staging"
echo "       Secret: (the STAGING_WEBHOOK_SECRET you exported)"
echo "       Trigger: push events only (release/* branches)"
fi
