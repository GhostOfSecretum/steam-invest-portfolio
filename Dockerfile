FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Keep the image default user (root) so the one-shot xray-config init container can
# write to the shared Docker volume. The app service overrides user to `node` in
# docker-compose.yml. Only chown paths the app needs at runtime.
RUN mkdir -p /app/.data && chown -R node:node /app

EXPOSE 3000

ENV NODE_OPTIONS=--max-old-space-size=1536

CMD ["node", "server/index.js"]
