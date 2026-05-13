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
    ttf-freefont \
    openssh
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Agent SSH access:
#   node@ (uid 1000 = agent uid) — for worker agents, avoids EACCES on shared volume
#   root@ — for direct orchestrator/manual use
RUN mkdir -p /home/node/.ssh && chmod 700 /home/node/.ssh && chown node:node /home/node/.ssh && \
    mkdir -p /root/.ssh && chmod 700 /root/.ssh
COPY deploy_keys/agent.pub /home/node/.ssh/authorized_keys
RUN cp /home/node/.ssh/authorized_keys /root/.ssh/authorized_keys && \
    chmod 600 /home/node/.ssh/authorized_keys /root/.ssh/authorized_keys && \
    chown node:node /home/node/.ssh/authorized_keys && \
    passwd -d node && \
    printf '\nPort 2222\nPasswordAuthentication no\nPermitRootLogin prohibit-password\nStrictModes no\n' >> /etc/ssh/sshd_config
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
ARG FROZEN_LOCKFILE=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN if [ "$FROZEN_LOCKFILE" = "true" ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# ---- prod-deps ----
# Flat (hoisted) layout so .bin shims have no absolute paths baked in —
# lets us copy node_modules to a different path in the runner.
FROM node:22-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --config.node-linker=hoisted

# ---- builder ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
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
