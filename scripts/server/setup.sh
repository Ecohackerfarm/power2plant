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

if [[ ! -d "$PROD_PATH" ]]; then
  echo "Error: $PROD_PATH does not exist. Clone the repo first (step 5 in docs)." >&2
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

# ── Systemd: deploy trigger ───────────────────────────────────────────────────
cat > "/etc/systemd/system/${PROJECT}-deploy.path" <<EOF
[Unit]
Description=Watch for ${PROJECT} deploy trigger

[Path]
PathExists=/run/p2p-deploy.trigger
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

# ── Sentinel file ─────────────────────────────────────────────────────────────
touch /run/p2p-deploy.trigger
chmod 777 /run/p2p-deploy.trigger  # world-writable sentinel (no sensitive content)

# ── Nginx config ──────────────────────────────────────────────────────────────
# Single-quoted NGINX heredoc prevents shell expansion — nginx vars ($host etc.) preserved.
# sed substitutes only $DOMAIN.
nginx_template=$(cat <<'NGINX'
server {
    listen [::]:443 ssl;
    server_name __DOMAIN__;

    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;

    location /hooks/ {
        proxy_pass http://[::1]:9000/hooks/;
        proxy_read_timeout 10s;
    }

    location / {
        proxy_pass http://[::1]:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen [::]:80;
    server_name __DOMAIN__;
    return 301 https://$host$request_uri;
}
NGINX
)

echo "$nginx_template" | sed "s/__DOMAIN__/${DOMAIN}/g" \
  > "/etc/nginx/sites-available/${PROJECT}"

if [[ ! -e "/etc/nginx/sites-enabled/${PROJECT}" ]]; then
  ln -s "/etc/nginx/sites-available/${PROJECT}" "/etc/nginx/sites-enabled/${PROJECT}"
fi
echo "    wrote nginx config for ${DOMAIN}"

# ── Git credential store ─────────────────────────────────────────────────────
git_creds="${PROJECT_PATH}/.git-credentials"
echo "https://${GITHUB_USER}:${GITHUB_PAT}@github.com" > "$git_creds"
chmod 600 "$git_creds"
chown "${DEPLOY_USERNAME}:${DEPLOY_USERNAME}" "$git_creds"
sudo -u "$DEPLOY_USERNAME" git config --global credential.helper store
echo "    wrote .git-credentials for ${GITHUB_USER}"

# ── Webhook hooks.json from template ─────────────────────────────────────────
hooks_template="${PROD_PATH}/webhook/hooks.json.template"
hooks_out="${PROD_PATH}/webhook/hooks.json"
if [[ ! -f "$hooks_template" ]]; then
  echo "Warning: $hooks_template not found — skipping hooks.json generation." >&2
else
  sed "s/__WEBHOOK_SECRET__/${WEBHOOK_SECRET}/g" "$hooks_template" > "$hooks_out"
  chmod 600 "$hooks_out"
  chown "${DEPLOY_USERNAME}:${DEPLOY_USERNAME}" "$hooks_out"
  echo "    wrote webhook/hooks.json"
fi

# ── Reload and enable ─────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable "${PROJECT}-prod" "${PROJECT}-dev" "${PROJECT}-deploy.path"
echo "    systemd units enabled"

nginx -t && systemctl reload nginx
echo "    nginx reloaded"

echo ""
echo "Done. Remaining manual steps:"
echo "  1. Create/verify prod .env:  ${PROD_PATH}/.env"
echo "  2. Start services:           systemctl start ${PROJECT}-prod ${PROJECT}-dev"
echo "  3. Get TLS cert:"
echo "       certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${ADMIN_EMAIL}"
echo "  4. Start webhook:"
echo "       cd ${PROD_PATH}/webhook && sudo -u ${DEPLOY_USERNAME} docker compose up -d"
echo "  5. Add GitHub webhook:"
echo "       URL: https://${DOMAIN}/hooks/deploy-prod"
echo "       Secret: (the WEBHOOK_SECRET you exported)"
