# Multi-stage Dockerfile for Jeop3
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# The optional host icon symlink may point outside the build context.
RUN if [ -L public/icons ] && [ ! -e public/icons ]; then rm public/icons; fi \
    && npm run build

FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/index.js server/*.cjs ./server/
COPY --from=frontend-builder /app/dist ./dist
COPY --from=frontend-builder /app/public/games ./public/games

EXPOSE 10005

CMD ["node", "server/index.js"]
