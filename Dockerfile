# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:22-alpine AS deps
RUN apk add --no-cache \
    postgresql16-client \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate
WORKDIR /app
ARG FROZEN_LOCKFILE=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN if [ "$FROZEN_LOCKFILE" = "true" ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# ---- dev ----
# Extends deps with sshd for agent access. Never used in production.
# Pass the agent's public key via AGENT_PUBKEY build arg (store in .env.dev, gitignored).
FROM deps AS dev
RUN apk add --no-cache openssh
ARG AGENT_PUBKEY=""
RUN mkdir -p /home/node/.ssh && chmod 700 /home/node/.ssh && chown node:node /home/node/.ssh && \
    mkdir -p /root/.ssh && chmod 700 /root/.ssh
# Inline wrapper: forces SSH sessions to start in /app
RUN printf '#!/bin/sh\ncd /app\nif [ -n "$SSH_ORIGINAL_COMMAND" ]; then\n  exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"\nelse\n  exec "$SHELL"\nfi\n' \
    > /usr/local/bin/ssh_wrapper.sh && chmod +x /usr/local/bin/ssh_wrapper.sh
# Write authorized_keys only when AGENT_PUBKEY is provided
RUN if [ -n "$AGENT_PUBKEY" ]; then \
      printf 'command="/usr/local/bin/ssh_wrapper.sh" %s\n' "$AGENT_PUBKEY" > /home/node/.ssh/authorized_keys && \
      printf '%s\n' "$AGENT_PUBKEY" > /root/.ssh/authorized_keys && \
      chmod 600 /home/node/.ssh/authorized_keys /root/.ssh/authorized_keys && \
      chown node:node /home/node/.ssh/authorized_keys; \
    fi
RUN passwd -d node && \
    printf '\nPort 2222\nPasswordAuthentication no\nPermitRootLogin prohibit-password\nStrictModes no\n' >> /etc/ssh/sshd_config

# ---- prod-deps ----
# Flat (hoisted) layout so .bin shims have no absolute paths baked in —
# lets us copy node_modules to a different path in the runner.
FROM node:22-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --config.node-linker=hoisted

# ---- builder ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG NEXT_PUBLIC_APP_URL
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET \
    BETTER_AUTH_URL=$BETTER_AUTH_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm exec prisma generate
RUN NODE_ENV=production pnpm build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Prod-only deps from pnpm — kept in a separate dir so it doesn't collide
# with the standalone bundle's traced node_modules. Used for the prisma CLI.
# Must be copied into a folder literally named "node_modules" so Node's
# module resolution finds @prisma/engines etc. when walking up from the CLI.
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules /opt/prod-modules/node_modules
ENV PATH="/opt/prod-modules/node_modules/.bin:$PATH"

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
