# Multi-stage Dockerfile for Jeop3
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/index.js ./server/index.js
COPY --from=frontend-builder /app/dist ./dist
COPY --from=frontend-builder /app/public ./public

EXPOSE 10005

CMD ["node", "server/index.js"]
