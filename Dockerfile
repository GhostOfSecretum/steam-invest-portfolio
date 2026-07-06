FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# su-exec drops root after fixing mounted .data permissions on startup.
RUN apk add --no-cache su-exec \
  && mkdir -p /app/.data && chown -R node:node /app \
  && chmod +x /app/scripts/docker-app-entrypoint.sh

EXPOSE 3000

ENV NODE_OPTIONS=--max-old-space-size=1536

CMD ["node", "server/index.js"]
