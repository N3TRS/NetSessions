FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts
RUN DATABASE_URL="mongodb://dummy" npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

# tini = PID 1 duties (signal forwarding, zombie reaping); redis = in-container cache.
RUN apk add --no-cache tini redis

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts \
    && DATABASE_URL="mongodb://dummy" npx prisma generate \
    && npm prune --omit=dev

COPY --from=builder /app/dist ./dist

COPY docker/redis.conf /etc/redis.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD redis-cli ping | grep -q PONG \
        && wget -qO- http://127.0.0.1:3002/v1/health > /dev/null \
        || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/entrypoint.sh"]
