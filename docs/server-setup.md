# Server Setup — power2plant

Ubuntu 24.04, IPv6-only, `power2plant.ecohackerfarm.org`.

## Variables

Export these before running any commands or scripts:

```sh
export VOLUME_PATH=/mnt/HC_Volume_105677979
export DEPLOY_USERNAME=deploy
export PROJECT=power2plant
export DOMAIN=power2plant.ecohackerfarm.org
export ADMIN_EMAIL=admin@ecohackerfarm.com
export GITHUB_USER=JustTB
export GITHUB_PAT=<fine-grained-PAT>        # never commit a real value here
export WEBHOOK_SECRET=$(openssl rand -hex 32)   # generate once; store somewhere safe

# Derived — don't change:
export PROJECT_PATH=$VOLUME_PATH/$PROJECT
export AI_PATH=$VOLUME_PATH/ai
```

---

## Architecture

```
$VOLUME_PATH/
├── $PROJECT/              ← this project
│   ├── prod/              (production clone — app + db)
│   ├── dev/               (dev clone — agent works here)
│   └── (webhook/ lives inside prod clone)
└── ai/                    ← orchestration agent (separate, multi-project)

Symlinks:  /opt/$PROJECT → $PROJECT_PATH
           /opt/ai       → $AI_PATH

Host:  nginx (www-data) — TLS termination → prod:3000
       certbot (root)   — Let's Encrypt auto-renew
       $DEPLOY_USERNAME — system user, owns project dirs, runs compose
```

**Deploy trigger flow:**
```
GitHub push → webhook container → writes /run/p2p-deploy.trigger
→ systemd path unit → deploy.service → scripts/server/deploy.sh
```

---

## 1. Hetzner volume

Verify the volume survives reboots:
```sh
grep "$VOLUME_PATH" /etc/fstab
```
If missing: Hetzner Cloud Console → volume page has the exact fstab line.

Create layout and symlinks:
```sh
mkdir -p $PROJECT_PATH/{prod/data,dev/data}
mkdir -p $AI_PATH

ln -s $PROJECT_PATH /opt/$PROJECT
ln -s $AI_PATH /opt/ai
```

Postgres data lands on the volume via `VOLUME_DATA_DIR` in each stack's `.env`.
Docker images stay on root disk — disposable, re-pull on a new machine.

**To migrate to a new machine:**
1. `systemctl stop ${PROJECT}-prod ${PROJECT}-dev`
2. Detach volume in Hetzner Cloud Console
3. Attach to new machine, mount at `$VOLUME_PATH`
4. Install Docker, recreate symlinks, restore systemd units — data already there

---

## 2. DNS

```
power2plant    AAAA    2a01:4f9:c012:379d::1
power2plant    A       <your-ipv4-address>
```

IPv4 is required for GitHub webhook delivery (GitHub doesn't support IPv6).
Certbot, nginx, and browser traffic work on either.

Verify addresses:
```sh
ip -6 addr show | grep 2a01:4f9:c012:379d   # confirm IPv6
ip -4 addr show                              # confirm IPv4
```

Verify propagation before requesting certs:
```sh
dig AAAA $DOMAIN
dig A $DOMAIN
```

---

## 3. Host prerequisites

```sh
apt update && apt upgrade -y

# nginx + certbot (Docker already installed)
apt install -y nginx certbot python3-certbot-nginx

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
# 2222 (dev SSH) stays internal — agent reaches it via Docker network only
ufw --force enable
```

---

## 4. System user

```sh
useradd -r -M -d /opt/$PROJECT -s /bin/bash $DEPLOY_USERNAME
usermod -aG docker $DEPLOY_USERNAME
chown -R $DEPLOY_USERNAME:$DEPLOY_USERNAME $PROJECT_PATH
```

`docker` group is effectively root-equivalent for Docker ops — the gain is host
system isolation and auditability, not a hard security boundary.

Git credentials via HTTPS PAT — stored in the deploy user's credential store,
not embedded in remote URLs (keeps `git remote -v` and process list clean):
```sh
sudo -u $DEPLOY_USERNAME git config --global credential.helper store
echo "https://${GITHUB_USER}:${GITHUB_PAT}@github.com" \
  > $PROJECT_PATH/.git-credentials
chmod 600 $PROJECT_PATH/.git-credentials
chown $DEPLOY_USERNAME:$DEPLOY_USERNAME $PROJECT_PATH/.git-credentials
```

Use a fine-grained PAT scoped to this repo, contents read-only.
Rotate by replacing `.git-credentials` — no server config changes needed.

---

## 5. Clone the repo

```sh
sudo -u $DEPLOY_USERNAME git clone \
  https://github.com/Ecohackerfarm/power2plant.git \
  $PROJECT_PATH/dev

sudo -u $DEPLOY_USERNAME git clone \
  https://github.com/Ecohackerfarm/power2plant.git \
  $PROJECT_PATH/prod
```

---

## 6. Production .env

Create `$PROJECT_PATH/prod/.env`:
```env
DATABASE_URL=postgresql://power2plant:<strong-db-password>@db:5432/power2plant
POSTGRES_PASSWORD=<same-strong-db-password>
BETTER_AUTH_SECRET=<min-32-char-random>
BETTER_AUTH_URL=https://power2plant.ecohackerfarm.org
NEXT_PUBLIC_APP_URL=https://power2plant.ecohackerfarm.org
VOLUME_DATA_DIR=/mnt/HC_Volume_105677979/power2plant/prod/data
```

```sh
openssl rand -base64 48   # → BETTER_AUTH_SECRET
openssl rand -base64 24   # → DB password (use in both DATABASE_URL and POSTGRES_PASSWORD)

chmod 600 $PROJECT_PATH/prod/.env
```

---

## 7. Install services and nginx

`scripts/server/setup.sh` generates and installs:
- `/etc/systemd/system/${PROJECT}-{prod,dev,deploy.path,deploy.service}`
- `/etc/nginx/sites-available/${PROJECT}` (symlinked to enabled)
- `$PROJECT_PATH/prod/webhook/hooks.json` (from template, secret substituted)

```sh
cd $PROJECT_PATH/prod
bash scripts/server/setup.sh
```

Script validates all variables are set and errors with missing names if not.

---

## 8. TLS cert

After nginx is running (step 7 reloads it):
```sh
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $ADMIN_EMAIL
```

Verify auto-renew:
```sh
systemctl status certbot.timer
certbot renew --dry-run
```

---

## 9. Start production

```sh
systemctl start ${PROJECT}-prod
systemctl start ${PROJECT}-dev
```

Check:
```sh
systemctl status ${PROJECT}-prod
docker compose --project-directory $PROJECT_PATH/prod logs -f app
```

> Prod app binds as `:::3000:3000` — nginx proxies to `[::1]:3000`. If the app
> isn't reachable via nginx, verify the port binding in `docker ps`.

---

## 10. Start webhook

```sh
cd $PROJECT_PATH/prod/webhook
sudo -u $DEPLOY_USERNAME docker compose up -d
```

Add webhook in GitHub repo → Settings → Webhooks:
- Payload URL: `https://$DOMAIN/hooks/deploy-prod`
- Content type: `application/json`
- Secret: `$WEBHOOK_SECRET`
- Events: `push` only

---

## 11. AI agent stack

Lives at `$AI_PATH` (`/opt/ai`) — separate from this project, multi-project capable.

```sh
git clone <your-ai-repo> $AI_PATH
# Build and configure per that repo's instructions
```

Minimum wiring to reach this project's dev stack:
```yaml
volumes:
  - /opt/power2plant/dev:/app
  - ai_home:/root/.claude

networks:
  - power2plant-dev

environment:
  - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
```

```yaml
volumes:
  ai_home:
networks:
  power2plant-dev:
    external: true
```

Create the external network first:
```sh
docker network create ${PROJECT}-dev
```

Agent SSHes to dev app container:
```sh
ssh -i /home/ai/.ssh/power2plant_dev -p 2222 -o StrictHostKeyChecking=no node@app-dev
# root@app-dev for orchestrator
```

---

## 12. Port map

| Port | Bound to        | Service                             |
|------|-----------------|-------------------------------------|
| 22   | host            | host SSH                            |
| 80   | `[::]:80`       | nginx → HTTPS redirect              |
| 443  | `[::]:443`      | nginx → prod app + /hooks/          |
| 3000 | `:::3000`       | prod app (Docker, not direct)       |
| 2222 | Docker-internal | dev app SSH (ai agent only)         |
| 9000 | `[::]:9000`     | webhook (proxied via nginx /hooks/) |

Port 9000 blocked by ufw — only reachable through nginx `/hooks/`.

---

## 13. Day-2 ops

### Manual deploy
```sh
cd $PROJECT_PATH/prod
sudo -u $DEPLOY_USERNAME git pull origin main
sudo -u $DEPLOY_USERNAME docker compose up -d --build
```

### DB backup
```sh
sudo -u $DEPLOY_USERNAME docker compose \
  --project-directory $PROJECT_PATH/prod \
  exec db pg_dump -U power2plant power2plant \
  > backup-$(date +%Y%m%d).sql
chmod 600 backup-$(date +%Y%m%d).sql
```

### Logs
```sh
sudo -u $DEPLOY_USERNAME docker compose \
  --project-directory $PROJECT_PATH/prod logs -f app
```

### Cert renewal test
```sh
certbot renew --dry-run
```

### Re-run setup (after repo changes to scripts or nginx needs)
```sh
cd $PROJECT_PATH/prod && git pull origin main
bash scripts/server/setup.sh
```
