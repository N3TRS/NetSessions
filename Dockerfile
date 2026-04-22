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
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts && DATABASE_URL="mongodb://dummy" npx prisma generate && npm prune --omit=dev
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/src/main"]
