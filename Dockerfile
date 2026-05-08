# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:20-alpine AS deps
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
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder ----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
RUN NODE_ENV=production pnpm build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node server.js"]
