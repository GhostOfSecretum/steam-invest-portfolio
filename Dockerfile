FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Run as the non-root `node` user (already present in the base image). Ensure the
# app dir and the mounted data dir are writable by that user.
RUN mkdir -p /app/.data && chown -R node:node /app
USER node

EXPOSE 3000

ENV NODE_OPTIONS=--max-old-space-size=1536

CMD ["node", "server/index.js"]
